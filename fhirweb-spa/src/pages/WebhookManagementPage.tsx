import React, { useEffect, useState } from 'react';
import {
  webhookService,
  Webhook,
  CreateWebhookRequest,
} from '../services/fhir/webhookService';

export const WebhookManagementPage: React.FC = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [callbackUrl, setCallbackUrl] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'Observation.create',
  ]);
  const [secret, setSecret] = useState('');
  const [customTopic, setCustomTopic] = useState('');

  const availableTopics = [
    'Patient.create',
    'Patient.update',
    'Patient.delete',
    'Patient.*',
    'Observation.create',
    'Observation.update',
    'Observation.delete',
    'Observation.*',
    'CarePlan.*',
    'Encounter.*',
    'MedicationRequest.*',
    '*.*',
  ];

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await webhookService.listWebhooks();
      setWebhooks(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!callbackUrl) {
      alert('Callback URL is required');
      return;
    }

    const topics = [...selectedTopics];
    if (customTopic && !topics.includes(customTopic)) {
      topics.push(customTopic);
    }

    if (topics.length === 0) {
      alert('At least one topic is required');
      return;
    }

    try {
      const newWebhook: CreateWebhookRequest = {
        callbackUrl,
        topics,
        secret: secret || undefined,
      };

      await webhookService.createWebhook(newWebhook);
      await loadWebhooks();

      // Reset form
      setCallbackUrl('');
      setSelectedTopics(['Observation.create']);
      setSecret('');
      setCustomTopic('');
      setShowForm(false);

      alert('Webhook created successfully!');
    } catch (err) {
      alert(`Failed to create webhook: ${(err as Error).message}`);
    }
  };

  const handleToggleWebhook = async (webhook: Webhook) => {
    try {
      if (webhook.enabled) {
        await webhookService.disableWebhook(webhook.id);
      } else {
        await webhookService.enableWebhook(webhook.id);
      }
      await loadWebhooks();
    } catch (err) {
      alert(`Failed to toggle webhook: ${(err as Error).message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) {
      return;
    }

    try {
      await webhookService.deleteWebhook(id);
      await loadWebhooks();
      alert('Webhook deleted successfully!');
    } catch (err) {
      alert(`Failed to delete webhook: ${(err as Error).message}`);
    }
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Webhook Management
        </h1>
        <p className="text-gray-600">
          Register and manage webhooks for FHIR resource change notifications
        </p>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex justify-between items-center">
        <button
          onClick={() => loadWebhooks()}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
        >
          {showForm ? 'Cancel' : '+ Register New Webhook'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">Error: {error}</p>
        </div>
      )}

      {/* Registration Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Register New Webhook</h2>
          <form onSubmit={handleCreateWebhook} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Callback URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="https://your-server.com/webhook-endpoint"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Your server endpoint that will receive webhook notifications
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topics <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {availableTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                      selectedTopics.includes(topic)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Custom topic (e.g., Condition.create)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secret (Optional)
              </label>
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="HMAC-SHA256 secret for payload signing"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used to verify webhook payload authenticity via
                X-Webhook-Signature header
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
              >
                Register Webhook
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Registered Webhooks ({webhooks.length})
          </h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-gray-500">
            Loading webhooks...
          </div>
        ) : webhooks.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <p className="text-lg mb-2">No webhooks registered</p>
            <p className="text-sm">
              Click "Register New Webhook" to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          webhook.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {webhook.enabled ? '● Active' : '○ Inactive'}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        ID: {webhook.id}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Callback URL:
                      </span>
                      <p className="text-sm text-blue-600 break-all">
                        {webhook.callbackUrl}
                      </p>
                    </div>

                    <div className="mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Topics:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {webhook.topics.map((topic, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>

                    {webhook.createdAt && (
                      <p className="text-xs text-gray-500">
                        Created: {new Date(webhook.createdAt).toLocaleString()}
                      </p>
                    )}
                    {webhook.lastTriggered && (
                      <p className="text-xs text-gray-500">
                        Last Triggered:{' '}
                        {new Date(webhook.lastTriggered).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleToggleWebhook(webhook)}
                      className={`px-3 py-1 rounded text-sm font-medium transition ${
                        webhook.enabled
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {webhook.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          📘 How Webhooks Work
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>
            • Webhooks send HTTP POST requests to your callback URL when FHIR
            resources change
          </li>
          <li>
            • Use topic patterns like <code>Patient.create</code> or{' '}
            <code>Observation.*</code>
          </li>
          <li>
            • Add a secret to verify webhook authenticity via HMAC-SHA256
            signature
          </li>
          <li>
            • Your callback endpoint must be publicly accessible and return HTTP
            200
          </li>
        </ul>
      </div>
    </div>
  );
};
