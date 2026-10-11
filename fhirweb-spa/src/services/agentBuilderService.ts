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
  lifecycleState:
    | 'DRAFT'
    | 'QUALITY_GATE_PENDING'
    | 'QUALITY_GATE_APPROVED'
    | 'UAT_TRAINING'
    | 'PRODUCTION_APPROVED'
    | 'MONITORING'
    | 'IMPROVEMENT_CANDIDATE'
    | string;
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
  authoring_step?: AuthoringStep;
  finalized_persona_id?: string;
  finalized_persona_version?: string;
  selectedModelId?: string;
  selected_model_id?: string;
  modelId?: string;
  model_id?: string;
  tenant_id?: string;
  owner_user_id?: string;
  authoring_mode: 'FROM_SCRATCH' | 'ADAPT_FROM' | string;
  source_persona_id?: string;
  source_persona_version?: string;
  persona_type: 'AGENT' | 'DATA_PIPELINE' | string;
  persona_name?: string;
  description?: string;
  status:
    | 'IN_PROGRESS'
    | 'AWAITING_REVIEW'
    | 'QUALITY_REVIEW'
    | 'SANDBOX_EXPERIMENT'
    | 'COMPLETE'
    | 'ABANDONED'
    | string;
  current_phase: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface AuthoringTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AuthoringStep =
  | 'P0_OUTCOME_INTAKE'
  | 'P0_PROXY_QUESTIONS'
  | 'P0_TYPE_DECISION'
  | 'P0_COHORT_CHECK'
  | 'P0_COHORT_RECIPE'
  | 'P0_AUTHORING_MODE'
  | null;

export type LifecycleAction =
  | 'promote'
  | 'quality-approve'
  | 'enter-sandbox'
  | 'approve'
  | 'flag-for-improvement'
  | 'retire';
export type SessionReviewAction =
  | 'approve'
  | 'quality-approve'
  | 'complete'
  | 'reject';
export interface LifecycleResult {
  sessionId?: string;
  status?: string;
  personaId?: string;
  version?: string;
  lifecycleState?: string;
  sessionStatus?: string;
  message?: string;
  warning?: string;
  nextSteps?: string[];
}

export interface ResumedAuthoringSession {
  session_id: string;
  status: AuthoringSession['status'];
  current_phase: number;
  persona_name?: string;
  selected_model_id?: string;
  conversation_turn_count: number;
  conversation: AuthoringTurn[];
}

export interface ConversationModels {
  provider: string;
  defaultModelId: string;
  models: Array<{
    id: string;
    displayName: string;
    description?: string;
    default?: boolean;
  }>;
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
  patientCount?: number;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string | null;
}

export interface SeededPatients {
  seedJobId: string;
  evalTenantId: string;
  seedStatus: string;
  patientIds: string[];
  patientCount: number;
}

export interface TerminologySearchCode {
  system: string;
  code: string;
  display?: string;
}

export interface TerminologySearchResult {
  name?: string;
  displayName?: string;
  chineseDisplayName?: string;
  resourceType?: string;
  synonyms?: string[];
  codes?: TerminologySearchCode[];
  primaryCode?: string;
  primarySystem?: string;
  primaryDisplay?: string;
}

export const normalizeSeedStatus = (
  status: Omit<SeedStatus, 'seededCounts'> & { seededCounts?: unknown },
): SeedStatus => {
  let counts = status.seededCounts;
  if (typeof counts === 'string') {
    try {
      counts = JSON.parse(counts);
    } catch {
      counts = undefined;
    }
  }
  const seededCounts =
    counts && typeof counts === 'object' && !Array.isArray(counts)
      ? (Object.fromEntries(
          Object.entries(counts).filter(
            ([, count]) =>
              typeof count === 'number' &&
              Number.isInteger(count) &&
              count >= 0,
          ),
        ) as Record<string, number>)
      : undefined;
  return { ...status, seededCounts };
};

export interface SeededPatientBundle {
  resourceType: 'Bundle';
  type: 'collection';
  total?: number;
  entry?: Array<{ resource?: Record<string, unknown> }>;
}

export interface SeededResourceBundle extends SeededPatientBundle {
  _meta: {
    evalTenantId: string;
    resourceType: string;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

export interface ScenarioSummary {
  scenarioId: string;
  personaId?: string;
  scenarioName: string;
  scenarioType: string;
  hasSeedSpec?: boolean;
  hasMissionParams?: boolean;
  createdAt?: string;
}

export interface ScenarioDetail extends ScenarioSummary {
  seedSpec?: Record<string, unknown> | null;
  missionParams?: Record<string, unknown> | null;
  conversationScript?: AuthoringTurn[] | null;
  responseCriteria?: unknown;
  expectedQueryPatterns?: Array<{
    resourceType: string;
    expectedParams: Record<string, string>;
  }>;
  generateRubric?: boolean;
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
  searchTerminology: async (query: string, resourceType: string) => {
    const params = new URLSearchParams({ q: query, resourceType });
    const result = await request<unknown>(`/api/terminology/search?${params}`);
    if (Array.isArray(result)) return result as TerminologySearchResult[];
    if (result && typeof result === 'object') {
      const payload = result as {
        results?: unknown;
        entries?: unknown;
        items?: unknown;
      };
      const rows = payload.results ?? payload.entries ?? payload.items;
      if (Array.isArray(rows)) return rows as TerminologySearchResult[];
    }
    return [];
  },
  getModels: () => request<ConversationModels>('/api/agentbuilder/models'),
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
    modelId?: string;
    description?: string;
  }) =>
    request<{
      sessionId: string;
      selectedModelId?: string;
      description?: string;
      authoring_step?: AuthoringStep;
    }>('/api/agentbuilder/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  resumeSession: (id: string) =>
    request<ResumedAuthoringSession>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/$resume`,
      { method: 'POST' },
    ),
  getSessionMessages: (id: string) =>
    request<{ sessionId: string; count: number; messages: AuthoringTurn[] }>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/messages`,
    ),
  abandonSession: (id: string) =>
    request<void>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/$abandon`,
      {
        method: 'POST',
      },
    ),
  reviewSession: (id: string, action: SessionReviewAction, reason?: string) =>
    request<LifecycleResult>(
      `/api/agentbuilder/sessions/${encodeURIComponent(id)}/$${action}`,
      {
        method: 'POST',
        ...(action === 'reject' && reason
          ? { body: JSON.stringify({ reason }) }
          : {}),
      },
    ),
  streamMessage: async (
    id: string,
    message: string,
    onToken: (token: string) => void,
    onStep?: (step: AuthoringStep) => void,
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
      if (eventName === 'step')
        onStep?.((data.trim() || null) as AuthoringStep);
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
    request<ScenarioSummary[]>(
      `/api/agentbuilder/scenarios?personaId=${encodeURIComponent(personaId)}`,
    ),
  getScenario: (scenarioId: string) =>
    request<ScenarioDetail>(
      `/api/agentbuilder/scenarios/${encodeURIComponent(scenarioId)}`,
    ),
  seedScenario: (scenarioId: string) =>
    request<{ seedJobId: string; evalTenantId: string }>(
      `/api/agentbuilder/experiments/eval/$seed?scenarioId=${encodeURIComponent(scenarioId)}`,
      { method: 'POST' },
    ),
  getSeedStatus: (seedJobId: string) =>
    request<SeedStatus>(
      `/api/agentbuilder/experiments/eval/seed/${encodeURIComponent(seedJobId)}`,
    ).then(normalizeSeedStatus),
  listSeedJobs: (scenarioId: string) =>
    request<SeedStatus[]>(
      `/api/agentbuilder/experiments/eval/seed?scenarioId=${encodeURIComponent(scenarioId)}`,
    ).then((jobs) => jobs.map(normalizeSeedStatus)),
  getSeededPatients: (seedJobId: string) =>
    request<SeededPatients>(
      `/api/agentbuilder/experiments/eval/seed/${encodeURIComponent(seedJobId)}/patients`,
    ),
  getSeededPatientBundle: (seedJobId: string, patientId: string) =>
    request<SeededPatientBundle>(
      `/api/agentbuilder/experiments/eval/seed/${encodeURIComponent(seedJobId)}/patients/${encodeURIComponent(patientId)}`,
    ),
  getSeededResources: (
    seedJobId: string,
    resourceType: string,
    page = 0,
    size = 50,
  ) =>
    request<SeededResourceBundle>(
      `/api/agentbuilder/experiments/eval/seed/${encodeURIComponent(seedJobId)}/resources/${encodeURIComponent(resourceType)}?${new URLSearchParams({ page: String(page), size: String(size) })}`,
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
      `/api/agentbuilder/experiments/$compare?${new URLSearchParams({ personaId, tenantId })}`,
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
    action: LifecycleAction,
    personaId: string,
    version: string,
    tenantId: string,
    sessionId?: string,
  ) =>
    request<LifecycleResult | undefined>(
      `/api/agentbuilder/experiments/$${action}?${new URLSearchParams({ personaId, version, tenantId, ...(sessionId ? { sessionId } : {}) })}`,
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
