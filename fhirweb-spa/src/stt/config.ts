import { getAuthenticatedHeaders } from '../services/auth/oidc';

export type SttProvider = 'browser' | 'realtime-api';
export interface SttConfig {
  provider: SttProvider;
  language: string;
}

export const resolveSttProvider = (
  flag: string | undefined,
  mode: string,
  hostname: string,
): SttProvider | 'auto' => {
  if (flag === 'browser' || flag === 'realtime-api' || flag === 'auto')
    return flag;
  if (flag)
    throw new Error(
      'Invalid VITE_STT_PROVIDER. Use browser, realtime-api, or auto.',
    );
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) return 'browser';
  return mode.startsWith('azure') ? 'realtime-api' : 'auto';
};

export const sttUrl = (path: string, websocket = false): string => {
  const base =
    import.meta.env.VITE_AGENT_API_BASE_URL || window.location.origin;
  const url = new URL(
    `${base.replace(/\/+$/, '')}${path}`,
    window.location.origin,
  );
  if (websocket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
};

export const getSttWebSocketUrl = async (
  tenantId: string,
  accessToken?: string,
): Promise<string> => {
  const headers = await getAuthenticatedHeaders({
    'X-Tenant-ID': tenantId,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  });
  const response = await fetch(sttUrl('/api/agentbuilder/ws-ticket'), {
    method: 'POST',
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Voice connection authorization unavailable (${response.status}).`,
    );
  const data = await response.json();
  if (typeof data.ticket !== 'string' || !data.ticket.trim())
    throw new Error('The server did not return a voice connection ticket.');
  const url = new URL(sttUrl('/ws/agentbuilder/stt', true));
  url.searchParams.set('ticket', data.ticket);
  return url.href;
};

const configs = new Map<string, Promise<SttConfig>>();
export const loadSttConfig = (
  tenantId: string,
  accessToken?: string,
): Promise<SttConfig> => {
  const url = sttUrl('/api/agentbuilder/config/stt');
  const key = `${url}:${tenantId}`;
  const cached = configs.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const headers = await getAuthenticatedHeaders({
      'X-Tenant-ID': tenantId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    });
    const response = await fetch(url, {
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Voice configuration unavailable (${response.status}).`);
    const data = await response.json();
    if (data.provider !== 'browser' && data.provider !== 'realtime-api')
      throw new Error('The server returned an unsupported voice provider.');
    return {
      provider: data.provider,
      language: typeof data.language === 'string' ? data.language : 'auto',
    } as SttConfig;
  })();
  configs.set(key, pending);
  void pending.catch(() => configs.delete(key));
  return pending;
};
