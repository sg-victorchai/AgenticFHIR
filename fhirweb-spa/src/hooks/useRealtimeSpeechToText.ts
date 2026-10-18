import { useEffect, useRef, useState } from 'react';
import { RealtimeSttAdapter } from '../stt/RealtimeSttAdapter';
import { getSttWebSocketUrl } from '../stt/config';

export function useRealtimeSpeechToText(
  enabled: boolean,
  onText: (text: string) => void,
  tenantId: string,
  accessToken?: string,
) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adapterRef = useRef<RealtimeSttAdapter | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const stop = () => {
    const adapter = adapterRef.current;
    adapterRef.current = null;
    adapter?.stop();
  };
  const start = (existing: string) => {
    if (!enabled || adapterRef.current) return;
    let partial = '';
    const show = (text: string) =>
      onTextRef.current(existing ? `${existing.trimEnd()} ${text}` : text);
    const adapter = new RealtimeSttAdapter(
      () => getSttWebSocketUrl(tenantId, accessToken),
      {
        onDelta: (delta) => {
          partial += delta;
          show(partial);
        },
        onFinal: (text) => show(text),
        onError: setError,
        onEnd: () => {
          adapterRef.current = null;
          setIsListening(false);
        },
      },
    );
    adapterRef.current = adapter;
    setError(null);
    setIsListening(true);
    void adapter.start();
  };
  useEffect(() => {
    if (!enabled) stop();
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [enabled]);
  return { start, stop, isListening, error };
}
