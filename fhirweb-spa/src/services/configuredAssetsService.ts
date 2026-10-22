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
  conversation?: Array<{ role?: string; content?: string; message?: string }>;
}

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
  request<OnboardingSessionSummary[]>('/api/sessions/service-onboarding');

export const createOnboardingSession = () =>
  request<{ sessionId: string; status: string }>(
    '/api/sessions/service-onboarding',
    {
      method: 'POST',
      body: JSON.stringify({
        tenantId: import.meta.env.VITE_TENANT_ID || 'default',
      }),
    },
  );

export const getOnboardingSession = (sessionId: string) =>
  request<OnboardingSessionSummary>(
    `/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}`,
  );

export const sendOnboardingMessage = (sessionId: string, content: string) =>
  request<void>(
    `/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}/messages`,
    { method: 'POST', body: JSON.stringify({ content }) },
  );

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
  onEvent: (event: { type: string; [key: string]: unknown }) => void,
  signal: AbortSignal,
  lastEventId?: string,
) => {
  const base = (import.meta.env.VITE_AGENT_API_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': import.meta.env.VITE_TENANT_ID || 'default',
    Accept: 'text/event-stream',
    ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
  });
  const response = await fetch(
    `${base}/api/sessions/service-onboarding/${encodeURIComponent(sessionId)}/stream`,
    { headers, credentials: 'include', signal },
  );
  if (!response.ok || !response.body)
    throw new Error(`Onboarding stream failed (${response.status}).`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let eventId = '';
  let dataLines: string[] = [];
  const dispatch = () => {
    if (!dataLines.length) {
      eventName = 'message';
      eventId = '';
      return;
    }
    let payload: Record<string, unknown> = {};
    const data = dataLines.join('\n');
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      payload = { content: data };
    }
    onEvent({
      ...payload,
      type: String(payload.type || eventName),
      id: eventId,
    });
    eventName = 'message';
    eventId = '';
    dataLines = [];
  };

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) dispatch();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('id:')) eventId = line.slice(3).trim();
      else if (line.startsWith('data:'))
        dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (buffer.startsWith('data:'))
    dataLines.push(buffer.slice(5).replace(/^ /, ''));
  dispatch();
};
