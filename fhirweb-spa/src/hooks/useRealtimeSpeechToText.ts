import { useEffect, useRef, useState } from 'react';
import { RealtimeSttAdapter } from '../stt/RealtimeSttAdapter';
import { getSttWebSocketUrl } from '../stt/config';

const usesAzureRealtimeStt = () =>
  import.meta.env.MODE === 'azure' || import.meta.env.MODE === 'azure-staging';

export function useRealtimeSpeechToText(
  enabled: boolean,
  onText: (text: string) => void,
  tenantId: string,
  accessToken?: string,
) {
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adapterRef = useRef<RealtimeSttAdapter | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const stop = (waitForFinalTranscript = true) => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    const deferClose = waitForFinalTranscript && usesAzureRealtimeStt();
    setIsListening(false);
    setIsConnecting(false);
    setIsFinalizing(deferClose);
    adapter.stop(deferClose);
  };
  const start = (existing: string) => {
    if (!enabled || adapterRef.current) return;
    let committed = '';
    let partial = '';
    const show = () => {
      const transcript = [committed, partial.trimStart()]
        .filter(Boolean)
        .join(' ');
      onTextRef.current(
        existing && transcript
          ? `${existing.trimEnd()} ${transcript}`
          : existing || transcript,
      );
    };
    const adapter = new RealtimeSttAdapter(
      () => getSttWebSocketUrl(tenantId, accessToken),
      {
        onDelta: (delta) => {
          partial += delta;
          show();
        },
        onFinal: (text) => {
          committed = committed
            ? `${committed.trimEnd()} ${text.trimStart()}`
            : text;
          partial = '';
          show();
        },
        onConnected: () => setIsConnecting(false),
        onError: setError,
        onEnd: () => {
          adapterRef.current = null;
          setIsConnecting(false);
          setIsListening(false);
          setIsFinalizing(false);
        },
      },
      usesAzureRealtimeStt(),
    );
    adapterRef.current = adapter;
    setError(null);
    setIsFinalizing(false);
    setIsConnecting(true);
    setIsListening(true);
    void adapter.start();
  };
  useEffect(() => {
    if (!enabled) stop(false);
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') stop(false);
    };
    const stopOnPageHide = () => stop(false);
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', stopOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', stopOnPageHide);
      stop(false);
    };
  }, [enabled]);
  return { start, stop, isListening, isConnecting, isFinalizing, error };
}
