// Webhook service for managing FHIR server webhooks

let FHIR_BASE_URL =
  import.meta.env.VITE_FHIR_BASE_URL || 'http://localhost:8080/fhir';
const API_KEY = import.meta.env.VITE_API_KEY;

// Helper function - CORS now enabled on Azure server, so no proxy needed
const getWebhookProxyUrl = (url: string): string => {
  // Return URL as-is since CORS is now enabled on the Azure server
  return url;
};

// Use proxy URL in development mode
FHIR_BASE_URL = getWebhookProxyUrl(FHIR_BASE_URL);

if (!API_KEY && import.meta.env.DEV) {
  console.warn(
    'VITE_API_KEY environment variable is not set. Webhook operations may fail.',
  );
}

// Get base URL without /fhir context for webhook API
const getWebhookBaseUrl = () => {
  return FHIR_BASE_URL.replace(/\/fhir\/?$/, '');
};

export interface Webhook {
  id: string;
  callbackUrl: string;
  topics: string[];
  secret?: string;
  enabled: boolean;
  createdAt?: string;
  lastTriggered?: string;
}

export interface CreateWebhookRequest {
  callbackUrl: string;
  topics: string[];
  secret?: string;
}

export interface WebhookEvent {
  webhookId: string;
  timestamp: string;
  tenantId: string;
  action: 'create' | 'update' | 'delete';
  resourceType: string;
  resourceId: string;
}

const getHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }
  return headers;
};

export const webhookService = {
  // List all webhooks
  async listWebhooks(): Promise<Webhook[]> {
    const response = await fetch(`${getWebhookBaseUrl()}/api/webhooks`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.statusText}`);
    }

    return response.json();
  },

  // Get specific webhook
  async getWebhook(id: string): Promise<Webhook> {
    const response = await fetch(`${getWebhookBaseUrl()}/api/webhooks/${id}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get webhook: ${response.statusText}`);
    }

    return response.json();
  },

  // Register new webhook
  async createWebhook(webhook: CreateWebhookRequest): Promise<Webhook> {
    const response = await fetch(`${getWebhookBaseUrl()}/api/webhooks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(webhook),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create webhook: ${error}`);
    }

    return response.json();
  },

  // Enable webhook
  async enableWebhook(id: string): Promise<void> {
    const response = await fetch(
      `${getWebhookBaseUrl()}/api/webhooks/${id}/enable`,
      {
        method: 'POST',
        headers: getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to enable webhook: ${response.statusText}`);
    }
  },

  // Disable webhook
  async disableWebhook(id: string): Promise<void> {
    const response = await fetch(
      `${getWebhookBaseUrl()}/api/webhooks/${id}/disable`,
      {
        method: 'POST',
        headers: getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to disable webhook: ${response.statusText}`);
    }
  },

  // Delete webhook
  async deleteWebhook(id: string): Promise<void> {
    const response = await fetch(`${getWebhookBaseUrl()}/api/webhooks/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }
  },
};
