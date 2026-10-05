import { getAuthenticatedHeaders } from './auth/oidc';

const API_BASE = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
  /\/+$/,
  '',
);
const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'default';

export interface PersonaSummary {
  personaId: string;
  version: string;
  name: string;
  description?: string;
  scope?: string;
  personaType: 'AGENT' | 'DATA_PIPELINE' | string;
  authoringSource: 'platform' | 'portal' | 'cli' | string;
  lifecycleState: 'DRAFT' | 'REVIEW' | 'PRODUCTION_APPROVED' | string;
  ownerUserId?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface PersonaDetail extends PersonaSummary {
  createdAt?: string;
  systemPrompt?: string;
  model?: { provider?: string; modelId?: string; fallback?: string };
  reasoningStrategy?: string;
  confidenceThreshold?: number;
  budget?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  tools?: string[];
  toolConfig?: Record<string, unknown>;
  formatters?: Record<string, any>;
  skills?: Record<string, any>;
  params?: Array<Record<string, any>>;
  intendedUserRole?: string;
  intendedChannels?: string[];
  roleGuardrails?: Record<string, any>;
  trigger?: Record<string, any>;
  inputSchema?: Record<string, any>;
  pipelineSteps?: Array<Record<string, any>>;
  bindings?: Array<Record<string, any>>;
  policies?: Record<string, any>;
  completionCriteria?: Record<string, any>;
  safety?: Record<string, any>;
}

export interface AuthoringSession {
  session_id: string;
  tenant_id?: string;
  owner_user_id?: string;
  authoring_mode: 'FROM_SCRATCH' | 'ADAPT_FROM' | string;
  source_persona_id?: string;
  source_persona_version?: string;
  persona_type: 'AGENT' | 'DATA_PIPELINE' | string;
  persona_name?: string;
  status: 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'COMPLETE' | 'ABANDONED' | string;
  current_phase: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface EvalRun {
  runId: string;
  personaId: string;
  personaVersion: string;
  tenantId?: string;
  evalTenantId?: string;
  runStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | string;
  qualityScore?: number;
  qualityDimensions?: string | Record<string, number>;
  simulatedQuestion?: string;
  personaResponse?: string;
  replayTrace?: string | Record<string, any>;
  humanRating?: number;
  humanNotes?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface SeedStatus {
  seedJobId: string;
  evalTenantId: string;
  seedStatus:
    | 'PENDING'
    | 'SEEDING'
    | 'COMPLETED'
    | 'FAILED'
    | 'TORN_DOWN'
    | string;
  seededCounts?: Record<string, number>;
  errorMessage?: string;
}

const apiUrl = (path: string) => `${API_BASE}${path}`;

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(
      payload.message ||
        payload.error ||
        `AgentBuilder request failed (${response.status})`,
    );
  }
  return payload as T;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': TENANT_ID,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  });
  return parseResponse<T>(await fetch(apiUrl(path), { ...init, headers }));
};

export const agentBuilderService = {
  listPersonas: (source: 'platform' | 'portal' | 'all' = 'all') =>
    request<PersonaSummary[]>(`/api/agentbuilder/personas?source=${source}`),
  listMine: () => request<PersonaSummary[]>('/api/agentbuilder/personas/mine'),
  getPersona: (personaId: string, version?: string) =>
    request<PersonaDetail>(
      `/api/agentbuilder/personas/${encodeURIComponent(personaId)}${
        version ? `?version=${encodeURIComponent(version)}` : ''
      }`,
    ),
  listSessions: () => request<AuthoringSession[]>('/api/agentbuilder/sessions'),
  getSession: (id: string) =>
    request<AuthoringSession>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}`,
    ),
  createSession: (body: {
    personaType: 'AGENT' | 'DATA_PIPELINE';
    authoringMode: 'FROM_SCRATCH' | 'ADAPT_FROM';
    sourcePersonaId?: string;
    sourcePersonaVersion?: string;
  }) =>
    request<{ sessionId: string }>('/api/agentbuilder/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  resumeSession: (id: string) =>
    request<Record<string, any>>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/$resume`,
      { method: 'POST' },
    ),
  abandonSession: (id: string) =>
    request<void>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/$abandon`,
      {
        method: 'POST',
      },
    ),
  streamMessage: async (
    id: string,
    message: string,
    onToken: (token: string) => void,
  ) => {
    const headers = await getAuthenticatedHeaders({
      'X-Tenant-ID': TENANT_ID,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    });
    const response = await fetch(
      apiUrl(`/api/agentbuilder/sessions/${encodeURIComponent(id)}/messages`),
      { method: 'POST', headers, body: JSON.stringify({ message }) },
    );
    if (!response.ok) return parseResponse<void>(response);
    if (!response.body)
      throw new Error('Streaming is not supported by this browser.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let dataLines: string[] = [];
    let completed = false;
    const dispatchEvent = () => {
      const data = dataLines.join('\n');
      if (eventName === 'token' || eventName === 'message') onToken(data);
      if (eventName === 'error')
        throw new Error(data || 'Authoring session failed.');
      if (eventName === 'done') completed = true;
      eventName = 'message';
      dataLines = [];
    };

    while (!completed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) {
          dispatchEvent();
          if (completed) break;
        } else if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
    if (buffer.startsWith('data:'))
      dataLines.push(buffer.slice(5).replace(/^ /, ''));
    if (!completed && dataLines.length) dispatchEvent();
  },
  listSkills: () => request<any[]>('/api/agentbuilder/skills'),
  listFormatters: () =>
    request<Record<string, any>>('/api/agentbuilder/formatters'),
  createScenario: (body: Record<string, any>) =>
    request<{ scenarioId: string; scenarioName: string; scenarioType: string }>(
      '/api/agentbuilder/scenarios',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  listScenarios: (personaId: string) =>
    request<any[]>(
      `/api/agentbuilder/scenarios?personaId=${encodeURIComponent(personaId)}`,
    ),
  seedScenario: (scenarioId: string) =>
    request<{ seedJobId: string; evalTenantId: string }>(
      `/api/agentbuilder/experiments/eval/$seed?scenarioId=${encodeURIComponent(scenarioId)}`,
      { method: 'POST' },
    ),
  getSeedStatus: (seedJobId: string) =>
    request<SeedStatus>(
      `/api/agentbuilder/experiments/eval/seed/${encodeURIComponent(seedJobId)}`,
    ),
  submitEval: (params: {
    personaId: string;
    version: string;
    scenarioId: string;
    tenantId: string;
    evalTenantId: string;
  }) =>
    request<{ runId: string }>(
      `/api/agentbuilder/experiments/eval/$submit?${new URLSearchParams(params)}`,
      { method: 'POST' },
    ),
  getEval: (runId: string) =>
    request<EvalRun>(
      `/api/agentbuilder/experiments/eval/${encodeURIComponent(runId)}`,
    ),
  listEvalRuns: (personaId: string, tenantId: string, version?: string) => {
    const params = new URLSearchParams({ personaId, tenantId });
    if (version) params.set('version', version);
    return request<EvalRun[]>(`/api/agentbuilder/experiments/eval?${params}`);
  },
  compare: (personaId: string, tenantId: string) =>
    request<{ betterVersion: string }>(
      `/api/agentbuilder/experiments/compare?${new URLSearchParams({ personaId, tenantId })}`,
    ),
  fork: (
    personaId: string,
    baseVersion: string,
    tenantId: string,
    patchYaml = '',
  ) =>
    request<{ newVersion: string }>(
      `/api/agentbuilder/experiments/fork?${new URLSearchParams({ personaId, baseVersion, tenantId })}`,
      { method: 'POST', body: JSON.stringify({ patchYaml }) },
    ),
  lifecycle: (
    action: 'promote' | 'approve' | 'retire',
    personaId: string,
    version: string,
    tenantId: string,
  ) =>
    request<void>(
      `/api/agentbuilder/experiments/${action}?${new URLSearchParams({ personaId, version, tenantId })}`,
      { method: 'POST' },
    ),
  teardown: (evalTenantId: string) =>
    request<void>(
      `/api/agentbuilder/experiments/eval/$teardown?evalTenantId=${encodeURIComponent(evalTenantId)}`,
      { method: 'POST' },
    ),
  syncSkills: () =>
    request<{ status: string; skillsUpdated?: number }>(
      '/api/agentbuilder/admin/plugins/sync',
      { method: 'POST' },
    ),
};
