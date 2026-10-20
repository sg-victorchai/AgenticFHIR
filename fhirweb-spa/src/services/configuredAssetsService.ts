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

const get = async <Result>(path: string): Promise<Result> => {
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
    if (response.status === 404)
      throw new Error('This resource type is no longer configured.');
    throw new Error(`Unable to load configured assets (${response.status}).`);
  }
  return response.json() as Promise<Result>;
};

export const listConfiguredAssets = () => get<ConfiguredAsset[]>('');
export const getConfiguredAsset = (resourceType: string) =>
  get<ConfiguredAssetDetail>(`/${encodeURIComponent(resourceType)}`);
export const getAssetBusinessRules = (resourceType: string) =>
  get<AssetBusinessRule[]>(`/${encodeURIComponent(resourceType)}/rules`);
