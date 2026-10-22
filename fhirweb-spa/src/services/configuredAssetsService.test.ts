import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedHeaders } from './auth/oidc';
import {
  getAssetBusinessRules,
  getConfiguredAsset,
  getConfiguredAssetWorkflow,
  listConfiguredAssets,
} from './configuredAssetsService';

vi.mock('./auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(async () => ({
    Authorization: 'Bearer test',
  })),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('configured asset API', () => {
  it('uses authenticated admin endpoints and encodes resource names', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL) => new Response(JSON.stringify([])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await listConfiguredAssets();
    await getConfiguredAsset('Custom/Type');
    await getAssetBusinessRules('Encounter');
    await getConfiguredAssetWorkflow('Encounter');
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('/api/admin/data-assets'),
      expect.stringContaining('/api/admin/data-assets/Custom%2FType'),
      expect.stringContaining('/api/admin/data-assets/Encounter/rules'),
      expect.stringContaining('/api/admin/data-assets/Encounter/workflow'),
    ]);
    expect(getAuthenticatedHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ 'X-Tenant-ID': expect.any(String) }),
    );
  });
  it('surfaces permission and missing-resource errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(listConfiguredAssets()).rejects.toThrow('permission');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(getConfiguredAsset('Missing')).rejects.toThrow(
      'no longer configured',
    );
    await expect(getConfiguredAssetWorkflow('Encounter')).rejects.toThrow(
      'No workflow definition was found',
    );
  });
});
