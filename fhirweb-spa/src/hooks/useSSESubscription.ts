import { useEffect, useRef, useState } from 'react';
import { getAuthenticatedHeaders } from '../services/auth/oidc';

// SSE server configuration (no FHIR context path)
let SSE_BASE_URL = import.meta.env.VITE_SSE_BASE_URL || 'http://localhost:8080';
const API_KEY = import.meta.env.VITE_API_KEY;

// Helper function - CORS now enabled on Azure server, so no proxy needed
const getSseProxyUrl = (url: string): string => {
  // Return URL as-is since CORS is now enabled on the Azure server
  return url;
};

// Use proxy URL in development mode
SSE_BASE_URL = getSseProxyUrl(SSE_BASE_URL);

if (!API_KEY && import.meta.env.DEV) {
  console.warn(
    'VITE_API_KEY environment variable is not set. SSE stream may fail without authentication.',
  );
}

export interface FHIREventNotification {
  timestamp: string;
  tenantId: string;
  action: 'create' | 'update' | 'delete';
  resourceType: string;
  resourceId: string;
}

export interface SSESubscriptionOptions {
  topics?: string[]; // Resource types to subscribe to (e.g., ['Patient', 'Observation'])
  actions?: string[]; // Actions to subscribe to (e.g., ['create', 'update', 'delete'])
  onEvent?: (event: FHIREventNotification) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  autoConnect?: boolean; // Default true
}

export const useSSESubscription = (options: SSESubscriptionOptions = {}) => {
  const {
    topics = ['Observation'],
    actions = ['create', 'update', 'delete'],
    onEvent,
    onError,
    onOpen,
    autoConnect = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<FHIREventNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleEvent = (eventData: string) => {
    try {
      const data: FHIREventNotification = JSON.parse(eventData);
      console.log('Received FHIR event:', data);
      setEvents((prev) => [data, ...prev].slice(0, 100));
      onEvent?.(data);
    } catch (err) {
      console.error('Error parsing event data:', err);
    }
  };

  const connect = async () => {
    // Close existing connection if any
    disconnect();

    try {
      const url = new URL(`${SSE_BASE_URL}/api/events/stream`);
      if (topics.length > 0) {
        url.searchParams.set('topics', topics.join(','));
      }
      if (actions.length > 0) {
        url.searchParams.set('actions', actions.join(','));
      }
      const requestHeaders: Record<string, string> = {
        Accept: 'text/event-stream',
      };
      if (API_KEY) {
        requestHeaders['x-api-key'] = API_KEY;
      }

      const headers = await getAuthenticatedHeaders(requestHeaders);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const response = await fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed (${response.status})`);
      }

      console.log('SSE connection opened:', url.toString());
      setIsConnected(true);
      setError(null);
      onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        events.forEach((eventBlock) => {
          const data = eventBlock
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (data) handleEvent(data);
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('SSE connection error:', err);
      setIsConnected(false);
      setError('Connection error. Attempting to reconnect...');
      onError?.(new Event('error'));
    } finally {
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (abortControllerRef.current) {
      console.log('Closing SSE connection');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsConnected(false);
    }
  };

  const clearEvents = () => {
    setEvents([]);
  };

  useEffect(() => {
    if (autoConnect) {
      void connect();
    }

    return () => {
      disconnect();
    };
  }, [topics.join(','), actions.join(',')]); // Reconnect if topics or actions change

  return {
    isConnected,
    events,
    error,
    connect,
    disconnect,
    clearEvents,
  };
};
