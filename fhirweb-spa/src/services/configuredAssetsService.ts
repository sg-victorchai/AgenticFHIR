import { getAuthenticatedHeaders } from './auth/oidc';

export interface ConfiguredAsset {
  resourceType: string;
  authoringSource: string;
  enabled: boolean;
  fhirVersions: string[];
  businessRuleCount: number;
  workflowName: string | null;
}

export interface ConfiguredAssetDetail extends ConfiguredAsset {
  interactions: Record<string, boolean>;
  profileUrls: string[];
  eventTriggerCount: number;
  nlSearchSynonyms: string[];
  embeddingEnabled: boolean;
  embeddingModel?: string;
  storageDesign?: StorageDesign | null;
}

export interface StorageDesign {
  branch?: 'A1' | 'A2' | 'B1' | 'B2' | string | null;
  artifactsGenerated?: boolean;
  configuredAt?: string | null;
  sessionId?: string | null;
  artifacts?: Array<{ fileName?: string; filename?: string; type?: string }>;
}

export interface StorageArtifact {
  fileName: string;
  content: string;
}

export interface WorkflowAction {
  actionId: string;
  actionType?: string;
  label?: string;
  requiredRole?: string[];
  toStage?: string;
  guard?: string | string[];
  prerequisite?: WorkflowPrerequisite[];
  conditionalToStage?: WorkflowConditionalRoute[];
  fhirMutation?: WorkflowMutation[];
  navigationKey?: string;
  [key: string]: unknown;
}

export interface WorkflowPrerequisite {
  label?: string;
  description?: string;
  checkQuery?: string;
  minCount?: number;
  onViolation?: string;
  navigationKey?: string;
  profileUrl?: string;
  resourceTemplate?: string;
}

export interface WorkflowMutation {
  sequenceNumber?: number;
  mutationType?: string;
  expression?: string;
}

export interface WorkflowConditionalRoute {
  conditionQuery?: string;
  toStage: string;
  fhirMutation?: WorkflowMutation[];
}

export interface WorkflowStage {
  stageId: string;
  label?: string;
  actor?: string;
  optional?: boolean;
  description?: string;
  stageExpression?: string;
  uiHint?: { icon?: string; terminal?: boolean; [key: string]: unknown };
  action?: WorkflowAction[];
}

export interface WorkflowDefinition {
  resourceType: 'WorkflowDefinition';
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  name?: string;
  title?: string;
  status?: string;
  meta?: { versionId?: string; lastUpdated?: string; profile?: string[] };
  targetResourceProfile?: string;
  stage: WorkflowStage[];
}

export interface WorkflowDefinitionBundle {
  resourceType: 'Bundle';
  entry?: Array<{ resource?: WorkflowDefinition }>;
}

export interface WorkflowAssignmentResult {
  resourceType: string;
  workflowDefinitionIdentifier: string;
  ruleId: string;
  authoringSource: string;
}

export interface AssetBusinessRule {
  ruleId: string;
  targetResourceType: string;
  triggerOperation: string;
  phase: string;
  mode: string;
  priority: number;
  pluginId: string;
  description?: string;
  enabled: boolean;
  properties: Record<string, unknown>;
  authoringSource: string;
}

export interface BusinessRuleWrite {
  ruleId: string;
  targetResourceType: string;
  triggerOperation: string;
  phase: string;
  mode: string;
  priority: number;
  enabled: boolean;
  pluginId: string;
  properties: Record<string, unknown>;
  description: string;
}

export interface EventTrigger {
  triggerId: string;
  topicRef: string;
  resourceType: string;
  scopeExtractor: string;
  suppressionWindow: string;
  consolidate: string;
  actionType: 'rest-hook' | 'persona-mission' | 'email';
  actionConfig: Record<string, unknown>;
  enabled: boolean;
}

export interface OnboardingSessionSummary {
  sessionId: string;
  status: string;
  entityName?: string | null;
  currentPhase?: number | null;
  phaseStatus?: Record<string, string>;
  updatedAt?: string;
  specMarkdown?: string | null;
  entrySkill?: string | null;
  conversation?: Array<{ role?: string; content?: string; message?: string }>;
}

type OnboardingSessionDto = OnboardingSessionSummary & {
  session_id?: string;
  entity_name?: string | null;
  current_phase?: number | null;
  phase_status?: Record<string, string>;
  updated_at?: string;
  spec_markdown?: string | null;
  entry_skill?: string | null;
};

const get = async <Result>(
  path: string,
  notFoundMessage = 'This resource type is no longer configured.',
): Promise<Result> => {
  const base = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': import.meta.env.VITE_TENANT_ID || 'default',
  });
  const response = await fetch(`${base}/api/admin/data-assets${path}`, {
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 403)
      throw new Error('You do not have permission to view configured assets.');
    if (response.status === 404) throw new Error(notFoundMessage);
    throw new Error(`Unable to load configured assets (${response.status}).`);
  }
  return response.json() as Promise<Result>;
};

const request = async <Result>(path: string, init: RequestInit = {}) => {
  const base = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': import.meta.env.VITE_TENANT_ID || 'default',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  });
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    signal: init.signal || AbortSignal.timeout(30000),
  });
  if (response.status === 204) return undefined as Result;
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
    const outcome = payload.issue
      ?.map(
        (issue: { diagnostics?: string; details?: { text?: string } }) =>
          issue.diagnostics || issue.details?.text,
      )
      .filter(Boolean)
      .join('; ');
    throw new Error(
      outcome ||
        payload.message ||
        payload.error ||
        `Request failed (${response.status})`,
    );
  }
  return payload as Result;
};

export const listConfiguredAssets = () => get<ConfiguredAsset[]>('');
export const getConfiguredAsset = (resourceType: string) =>
  get<ConfiguredAssetDetail>(`/${encodeURIComponent(resourceType)}`);
export const getConfiguredAssetWorkflow = (resourceType: string) =>
  get<WorkflowDefinition>(
    `/${encodeURIComponent(resourceType)}/workflow`,
    'No workflow definition was found for this resource type.',
  );
export const assignConfiguredAssetWorkflow = (
  resourceType: string,
  workflowDefinitionIdentifier: string,
) =>
  request<WorkflowAssignmentResult>(
    `/api/admin/data-assets/${encodeURIComponent(resourceType)}/workflow`,
    {
      method: 'PUT',
      body: JSON.stringify({ workflowDefinitionIdentifier }),
    },
  );
export const removeConfiguredAssetWorkflow = (resourceType: string) =>
  request<void>(
    `/api/admin/data-assets/${encodeURIComponent(resourceType)}/workflow`,
    { method: 'DELETE' },
  );
export const listWorkflowDefinitions = () =>
  request<WorkflowDefinitionBundle>('/fhir/r5/WorkflowDefinition?_count=50');
export const findWorkflowDefinition = (identifier: string) =>
  request<WorkflowDefinitionBundle>(
    `/fhir/r5/WorkflowDefinition?${new URLSearchParams({ identifier })}`,
  );
export const getAssetBusinessRules = (resourceType: string) =>
  get<AssetBusinessRule[]>(`/${encodeURIComponent(resourceType)}/rules`);
export const disableConfiguredAsset = (resourceType: string) =>
  request<void>(`/api/admin/data-assets/${encodeURIComponent(resourceType)}`, {
    method: 'DELETE',
  });

export const createBusinessRule = (rule: BusinessRuleWrite) =>
  request<AssetBusinessRule>(
    `/api/admin/data-assets/${encodeURIComponent(rule.targetResourceType)}/rules`,
    { method: 'POST', body: JSON.stringify(rule) },
  );

export const replaceBusinessRule = (rule: BusinessRuleWrite) =>
  request<AssetBusinessRule>(
    `/api/admin/data-assets/${encodeURIComponent(rule.targetResourceType)}/rules/${encodeURIComponent(rule.ruleId)}`,
    { method: 'PUT', body: JSON.stringify(rule) },
  );

export const deleteBusinessRule = (resourceType: string, ruleId: string) =>
  request<void>(
    `/api/admin/data-assets/${encodeURIComponent(resourceType)}/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
  );

export const listEventTriggers = () =>
  request<EventTrigger[]>('/api/admin/event-triggers');

export const createEventTrigger = (trigger: EventTrigger) =>
  request<EventTrigger>('/api/admin/event-triggers', {
    method: 'POST',
    body: JSON.stringify(trigger),
  });

export const replaceEventTrigger = (trigger: EventTrigger) =>
  request<EventTrigger>(
    `/api/admin/event-triggers/${encodeURIComponent(trigger.triggerId)}`,
    { method: 'PUT', body: JSON.stringify(trigger) },
  );

export const deleteEventTrigger = (triggerId: string) =>
  request<void>(`/api/admin/event-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'DELETE',
  });

export const listOnboardingSessions = () =>
  request<OnboardingSessionDto[]>('/api/sessions/service-onboarding').then(
    (sessions) => sessions.map(normalizeOnboardingSession),
  );

const inferOnboardingEntityName = (session: OnboardingSessionDto) => {
  const specMarkdown = session.specMarkdown ?? session.spec_markdown ?? '';
  const specHeading = specMarkdown.match(/^#\s+([A-Z][A-Za-z0-9]*)\b/m)?.[1];
  if (specHeading && !['DataAsset', 'Entity', 'Resource'].includes(specHeading))
    return specHeading;

  const assistantText = (session.conversation || [])
    .filter((message) => message.role?.toLowerCase() === 'assistant')
    .map((message) => message.content || message.message || '')
    .reverse()
    .join('\n');
  return (
    assistantText.match(
      /(?:sounds like|model(?:ing|led)?(?:\s+this\s+as)?)\s+(?:an?\s+)?\*{0,2}([A-Z][A-Za-z0-9]*)\*{0,2}(?=\s+(?:entity|resource)\b|[.,\s])/i,
    )?.[1] ||
    assistantText.match(/\*\*([A-Z][A-Za-z0-9]*)\*\*\s+entity\b/i)?.[1]
  );
};

const normalizeOnboardingSession = (
  session: OnboardingSessionDto,
): OnboardingSessionSummary => {
  const entityName =
    session.entityName ||
    session.entity_name ||
    inferOnboardingEntityName(session);
  return {
    ...session,
    sessionId: session.sessionId || session.session_id || '',
    entityName,
    currentPhase: session.currentPhase ?? session.current_phase,
    phaseStatus: session.phaseStatus ?? session.phase_status,
    updatedAt: session.updatedAt ?? session.updated_at,
    specMarkdown: session.specMarkdown ?? session.spec_markdown,
    entrySkill: session.entrySkill ?? session.entry_skill,
  };
};

export const createOnboardingSession = (
  options: {
    entityName?: string;
    entrySkill?: string;
  } = {},
) =>
  request<{ sessionId: string; status: string; entrySkill?: string }>(
    '/api/sessions/service-onboarding',
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
  );

const sessionStorageArtifacts = new Map<
  string,
  { entityName: string; artifacts: StorageArtifact[] }
>();

export const rememberStorageArtifacts = (
  sessionId: string,
  entityName: string,
  artifacts: StorageArtifact[],
) => {
  if (!artifacts.length) return;
  sessionStorageArtifacts.set(sessionId, { entityName, artifacts });
};

export const getStorageArtifactsForSession = (sessionId: string) =>
  sessionStorageArtifacts.get(sessionId)?.artifacts || null;

export const getStorageArtifacts = (entityName: string) =>
  [...sessionStorageArtifacts.entries()]
    .reverse()
    .find(([, saved]) => saved.entityName === entityName) || null;

export const getOnboardingSession = (sessionId: string) =>
  request<OnboardingSessionDto>(
    `/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}`,
  ).then(normalizeOnboardingSession);

const readSseResponse = async (
  response: Response,
  onEvent: (event: { type: string; data: string }) => void,
  signal?: AbortSignal,
) => {
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Onboarding stream failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];
  const dispatch = () => {
    onEvent({ type: eventName, data: dataLines.join('\n') });
    eventName = 'message';
    dataLines = [];
  };
  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) dispatch();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:'))
        dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (buffer.startsWith('data:'))
    dataLines.push(buffer.slice(5).replace(/^ /, ''));
  if (dataLines.length) dispatch();
};

export const sendOnboardingMessage = async (
  sessionId: string,
  message: string,
  onEvent: (event: { type: string; data: string }) => void,
  signal?: AbortSignal,
) => {
  const base = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': import.meta.env.VITE_TENANT_ID || 'default',
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  const response = await fetch(
    `${base}/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: signal || AbortSignal.timeout(120000),
      body: JSON.stringify({ message }),
    },
  );
  await readSseResponse(response, onEvent, signal);
};

export const pauseOnboardingSession = (sessionId: string) =>
  request<void>(
    `/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}/pause`,
    { method: 'POST' },
  );

export const abandonOnboardingSession = (sessionId: string) =>
  request<void>(
    `/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );

export const streamOnboardingSession = async (
  sessionId: string,
  onEvent: (event: { type: string; data: string }) => void,
  signal: AbortSignal,
) => {
  const base = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': import.meta.env.VITE_TENANT_ID || 'default',
    Accept: 'text/event-stream',
  });
  const response = await fetch(
    `${base}/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}/stream`,
    { headers, credentials: 'include', signal },
  );
  await readSseResponse(response, onEvent, signal);
};
