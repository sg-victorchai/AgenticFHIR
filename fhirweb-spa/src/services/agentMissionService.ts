// Agent mission service for submitting/tracking AgentPersona missions
// (patient-agnostic — no X-Patient-ID; mirrors the digital-twin mission contract
// used by AgentConversationModal, minus per-patient scoping)
import FHIR from 'fhirclient';
import {
  AgentInterventionRequest,
  AgentSource,
  CostBreakdown,
  MissionExecutionResult,
} from '../types/agent';

// Agent/AI API base URL (separate from FHIR server URL)
const AGENT_API_BASE_URL =
  import.meta.env.VITE_AGENT_API_BASE_URL || 'http://localhost:8080';

const API_KEY =
  import.meta.env.VITE_API_KEY || 'QcNaPYYwp57Ib3T2p1uxL3GazNNoF5pt513T1JCP';

const resolveTenantId = (): string | null => {
  const direct =
    sessionStorage.getItem('tenantId') ||
    sessionStorage.getItem('tenant_id') ||
    localStorage.getItem('tenantId') ||
    localStorage.getItem('tenant_id');

  if (direct) return direct;

  for (const key of Object.keys(sessionStorage)) {
    const raw = sessionStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        tenantId?: string;
        tenant_id?: string;
        tenant?: string;
        tokenResponse?: { tenantId?: string; tenant_id?: string; tenant?: string };
      };
      const tenant =
        parsed.tenantId ||
        parsed.tenant_id ||
        parsed.tenant ||
        parsed.tokenResponse?.tenantId ||
        parsed.tokenResponse?.tenant_id ||
        parsed.tokenResponse?.tenant;
      if (tenant) return tenant;
    } catch {
      // Ignore non-JSON values in session storage.
    }
  }

  return null;
};

const buildAuthHeaders = async (): Promise<Record<string, string>> => {
  let accessToken: string | undefined;
  let tenantId: string | null = resolveTenantId();

  try {
    const smartClient = await FHIR.oauth2.ready();
    accessToken = smartClient.state.tokenResponse?.access_token;
    const smartTenant = (smartClient.state as any)?.tenantId;
    if (!tenantId && smartTenant) tenantId = smartTenant;
  } catch {
    // No active SMART session — fall back to session-derived context.
  }

  const resolvedTenantId =
    tenantId || import.meta.env.VITE_TENANT_ID || 'default';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': resolvedTenantId,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  return headers;
};

const parseJsonSafely = (text: string): any => {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const normalizeMissionPayload = (payload: any): MissionExecutionResult => {
  const asObject = payload && typeof payload === 'object' ? payload : {};

  // The real backend nests the execution outcome inside a JSON-encoded
  // `result` string ({"outputs":{...},"success":bool,"summary":string,
  // "failureReason":string}) rather than putting outputs/failureReason
  // directly on the mission object.
  let result: Record<string, any> = {};
  if (typeof asObject.result === 'string' && asObject.result.trim()) {
    try {
      result = JSON.parse(asObject.result);
    } catch {
      // Leave result empty if it isn't valid JSON.
    }
  } else if (asObject.result && typeof asObject.result === 'object') {
    result = asObject.result;
  }

  const outputs = {
    ...(result.outputs && typeof result.outputs === 'object' ? result.outputs : {}),
    ...(asObject.outputs && typeof asObject.outputs === 'object' ? asObject.outputs : {}),
  } as Record<string, any>;

  return {
    missionId: asObject.missionId || asObject.id || asObject.executionId || '',
    status: (asObject.status || 'PENDING') as MissionExecutionResult['status'],
    goal: asObject.goal || '',
    outputs: {
      response: outputs.response || result.summary || asObject.summary,
      confidence: outputs.confidence,
      sources: outputs.sources as AgentSource[] | undefined,
      disclaimer: outputs.disclaimer,
      executionTimeMs: outputs.executionTimeMs,
      tokensUsed: outputs.tokensUsed,
      costBreakdown: outputs.costBreakdown as CostBreakdown | undefined,
    },
    failureReason:
      asObject.failureReason || asObject.error || result.failureReason || undefined,
    startedAt: asObject.startedAt || asObject.createdAt,
    completedAt: asObject.completedAt,
    auditTrail: asObject.auditTrail,
  };
};

// Extracts a resource list from whatever envelope shape the endpoint returns
// (plain array, FHIR-ish Bundle, or an { entry|items|missions|data } wrapper).
const extractList = (parsed: any): any[] => {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.entry)) {
    return parsed.entry.map((e: any) => e.resource ?? e);
  }
  return parsed?.missions || parsed?.items || parsed?.data || [];
};

export const agentMissionService = {
  async submitMission(
    personaId: string,
    goal: string,
    delegatedBy: string,
  ): Promise<MissionExecutionResult> {
    const headers = await buildAuthHeaders();

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentPersona/${personaId}/AgentMission`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          goal,
          context: { delegatedBy, channel: 'care-coordinator-portal' },
        }),
      },
    );

    const parsed = parseJsonSafely(await response.text());

    if (!response.ok) {
      throw new Error(
        parsed.message || `Failed to submit mission (${response.status})`,
      );
    }

    return normalizeMissionPayload(parsed);
  },

  async getMissionStatus(missionId: string): Promise<MissionExecutionResult> {
    const headers = await buildAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentMission/${encodeURIComponent(missionId)}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Status check failed (${response.status})`);
    }

    const parsed = parseJsonSafely(await response.text());
    return normalizeMissionPayload(parsed);
  },

  async getMissionsByPersona(
    personaId: string,
  ): Promise<MissionExecutionResult[]> {
    const headers = await buildAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentMission?personaId=${encodeURIComponent(personaId)}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to load missions (${response.status})`);
    }

    const parsed = parseJsonSafely(await response.text());
    return extractList(parsed).map(normalizeMissionPayload);
  },

  async cancelMission(missionId: string): Promise<void> {
    const headers = await buildAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentMission/${encodeURIComponent(missionId)}/$cancel`,
      { method: 'DELETE', headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel mission (${response.status})`);
    }
  },

  async getPendingInterventions(): Promise<AgentInterventionRequest[]> {
    const headers = await buildAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentInterventionRequest?status=PENDING`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to load interventions (${response.status})`);
    }

    const parsed = parseJsonSafely(await response.text());
    return extractList(parsed).filter((r) => r?.id);
  },

  async resolveIntervention(
    interventionId: string,
    decision: string,
  ): Promise<void> {
    const headers = await buildAuthHeaders();

    const response = await fetch(
      `${AGENT_API_BASE_URL}/api/agent/AgentInterventionRequest/${encodeURIComponent(interventionId)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ decision }),
      },
    );

    if (!response.ok) {
      const parsed = parseJsonSafely(await response.text());
      throw new Error(
        parsed.message || `Failed to resolve intervention (${response.status})`,
      );
    }
  },
};
