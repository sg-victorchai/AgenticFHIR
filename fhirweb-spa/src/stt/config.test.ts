import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedHeaders } from '../services/auth/oidc';
import {
  getSttWebSocketUrl,
  loadSttConfig,
  resolveSttProvider,
  sttUrl,
} from './config';

vi.mock('../services/auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(async (headers) => ({
    ...headers,
    Authorization: 'Bearer test',
  })),
}));
afterEach(() => vi.unstubAllGlobals());

describe('STT provider configuration', () => {
  it('keeps local browser recognition and defaults Azure builds to realtime', () => {
    expect(resolveSttProvider(undefined, 'development', 'localhost')).toBe(
      'browser',
    );
    expect(resolveSttProvider(undefined, 'azure', 'portal.example')).toBe(
      'realtime-api',
    );
    expect(
      resolveSttProvider(undefined, 'azure-staging', 'portal.example'),
    ).toBe('realtime-api');
    expect(resolveSttProvider(undefined, 'production', 'portal.example')).toBe(
      'auto',
    );
  });
  it('honors explicit flags, including overriding Azure with browser', () => {
    expect(resolveSttProvider('browser', 'azure', 'portal.example')).toBe(
      'browser',
    );
    expect(resolveSttProvider('realtime-api', 'development', 'localhost')).toBe(
      'realtime-api',
    );
    expect(resolveSttProvider('auto', 'azure', 'portal.example')).toBe('auto');
    expect(() =>
      resolveSttProvider('invalid', 'azure', 'portal.example'),
    ).toThrow('VITE_STT_PROVIDER');
  });
  it('loads config once for concurrent consumers and authenticates REST requests', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ provider: 'realtime-api', language: 'zh-CN' }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const [first, second] = await Promise.all([
      loadSttConfig('stt-test'),
      loadSttConfig('stt-test'),
    ]);
    expect(first).toEqual({ provider: 'realtime-api', language: 'zh-CN' });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAuthenticatedHeaders).toHaveBeenCalled();
  });
  it('builds a websocket URL without leaking tokens in a query string', () => {
    const url = new URL(sttUrl('/ws/agentbuilder/stt', true));
    expect(['ws:', 'wss:']).toContain(url.protocol);
    expect(url.pathname).toBe('/ws/agentbuilder/stt');
    expect(url.search).toBe('');
  });
  it('requests a fresh authenticated ticket and appends it to the socket URL', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ticket: 'one-use-ticket' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const socketUrl = new URL(
      await getSttWebSocketUrl('tenant-1', 'oauth-token'),
    );

    expect(getAuthenticatedHeaders).toHaveBeenLastCalledWith({
      'X-Tenant-ID': 'tenant-1',
      Authorization: 'Bearer oauth-token',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      sttUrl('/api/agentbuilder/ws-ticket'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(socketUrl.pathname).toBe('/ws/agentbuilder/stt');
    expect(socketUrl.searchParams.get('ticket')).toBe('one-use-ticket');
    expect(socketUrl.searchParams.has('oauth-token')).toBe(false);
  });
});
