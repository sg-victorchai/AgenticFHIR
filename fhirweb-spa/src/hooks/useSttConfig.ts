import { useEffect, useState } from 'react';
import { loadSttConfig, resolveSttProvider, SttConfig } from '../stt/config';

export function useSttConfig(
  enabled: boolean,
  tenantId: string,
  accessToken?: string,
) {
  const [config, setConfig] = useState<SttConfig>({
    provider: 'browser',
    language: 'auto',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      const requested = resolveSttProvider(
        import.meta.env.VITE_STT_PROVIDER,
        import.meta.env.MODE,
        window.location.hostname,
      );
      if (requested === 'browser')
        return { provider: 'browser', language: 'auto' } as SttConfig;
      const remote = await loadSttConfig(tenantId, accessToken);
      return {
        ...remote,
        provider: requested === 'auto' ? remote.provider : requested,
      };
    };
    void load()
      .then(
        (result) => {
          if (active) setConfig(result);
        },
        (failure: unknown) => {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Unable to load voice configuration.',
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, tenantId, accessToken, attempt]);
  return {
    ...config,
    loading,
    error,
    retry: () => setAttempt((current) => current + 1),
  };
}
