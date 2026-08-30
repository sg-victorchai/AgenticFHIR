import { useEffect, useRef, useState } from 'react';

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
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = () => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Connect directly to Azure server
      const url = new URL(`${SSE_BASE_URL}/api/events/stream`);
      if (topics.length > 0) {
        url.searchParams.set('topics', topics.join(','));
      }
      if (actions.length > 0) {
        url.searchParams.set('actions', actions.join(','));
      }
      // Add API key as query parameter since EventSource doesn't support custom headers
      if (API_KEY) {
        url.searchParams.set('apiKey', API_KEY);
      }

      console.log('Connecting to SSE stream:', url.toString());

      const eventSource = new EventSource(url.toString());

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        setIsConnected(true);
        setError(null);
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data: FHIREventNotification = JSON.parse(event.data);
          console.log('Received FHIR event:', data);

          setEvents((prev) => [data, ...prev].slice(0, 100)); // Keep last 100 events
          onEvent?.(data);
        } catch (err) {
          console.error('Error parsing event data:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        setIsConnected(false);
        setError('Connection error. Attempting to reconnect...');
        onError?.(err);
      };

      // Listen for specific event types
      eventSource.addEventListener('resource-change', (event: MessageEvent) => {
        try {
          const data: FHIREventNotification = JSON.parse(event.data);
          console.log('Received resource-change event:', data);

          setEvents((prev) => [data, ...prev].slice(0, 100));
          onEvent?.(data);
        } catch (err) {
          console.error('Error parsing resource-change event:', err);
        }
      });

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error('Error creating EventSource:', err);
      setError('Failed to connect to event stream');
    }
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      console.log('Closing SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  };

  const clearEvents = () => {
    setEvents([]);
  };

  useEffect(() => {
    if (autoConnect) {
      connect();
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
