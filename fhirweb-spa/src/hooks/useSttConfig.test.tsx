import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSttConfig } from '../stt/config';
import { useSttConfig } from './useSttConfig';

vi.mock('../stt/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stt/config')>()),
  loadSttConfig: vi.fn(),
}));
vi.mock('../services/auth/oidc', () => ({ getAuthenticatedHeaders: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadSttConfig).mockResolvedValue({
    provider: 'realtime-api',
    language: 'zh-CN',
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('voice provider hook', () => {
  it('retains native browser voice without calling the config service when forced', async () => {
    vi.stubEnv('VITE_STT_PROVIDER', 'browser');
    const { result } = renderHook(() => useSttConfig(true, 'tenant'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.provider).toBe('browser');
    expect(loadSttConfig).not.toHaveBeenCalled();
  });
  it('uses backend provider and language in auto mode', async () => {
    vi.stubEnv('VITE_STT_PROVIDER', 'auto');
    const { result } = renderHook(() => useSttConfig(true, 'tenant', 'token'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.provider).toBe('realtime-api');
    expect(result.current.language).toBe('zh-CN');
    expect(loadSttConfig).toHaveBeenCalledWith('tenant', 'token');
  });
  it('allows forced realtime even if backend defaults to browser', async () => {
    vi.stubEnv('VITE_STT_PROVIDER', 'realtime-api');
    vi.mocked(loadSttConfig).mockResolvedValue({
      provider: 'browser',
      language: 'en-US',
    });
    const { result } = renderHook(() => useSttConfig(true, 'tenant'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.provider).toBe('realtime-api');
  });
  it('shows configuration errors instead of silently switching providers', async () => {
    vi.stubEnv('VITE_STT_PROVIDER', 'auto');
    vi.mocked(loadSttConfig).mockRejectedValue(new Error('Config unavailable'));
    const { result } = renderHook(() => useSttConfig(true, 'tenant'));
    await waitFor(() =>
      expect(result.current.error).toBe('Config unavailable'),
    );
    expect(result.current.loading).toBe(false);
  });
});
