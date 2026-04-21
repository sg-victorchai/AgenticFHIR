// Webhook service for managing FHIR server webhooks

const FHIR_BASE_URL =
  import.meta.env.VITE_FHIR_BASE_URL || 'http://localhost:8080/fhir';
const API_KEY =
  import.meta.env.VITE_API_KEY || 'QcNaPYYwp57Ib3T2p1uxL3GazNNoF5pt513T1JCP';

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

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
});

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
