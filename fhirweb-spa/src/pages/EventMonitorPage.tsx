import React, { useState } from 'react';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { NotificationContainer } from '../components/common/NotificationToast';

export const EventMonitorPage: React.FC = () => {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'Observation',
  ]);
  const [selectedActions, setSelectedActions] = useState<string[]>([
    'create',
    'update',
    'delete',
  ]);

  const { isConnected, events, error, connect, disconnect, clearEvents } =
    useSSESubscription({
      topics: selectedTopics,
      actions: selectedActions,
      autoConnect: true,
      onEvent: (event) => {
        // Play notification sound or trigger browser notification
        console.log('New event received:', event);
      },
    });

  const availableTopics = [
    'Patient',
    'Observation',
    'CarePlan',
    'Encounter',
    'MedicationRequest',
    'Condition',
    'Procedure',
  ];

  const availableActions = ['create', 'update', 'delete'];

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const toggleAction = (action: string) => {
    setSelectedActions((prev) =>
      prev.includes(action)
        ? prev.filter((a) => a !== action)
        : [...prev, action],
    );
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'text-green-600 bg-green-50';
      case 'update':
        return 'text-blue-600 bg-blue-50';
      case 'delete':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <NotificationContainer events={events} />

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          FHIR Event Monitor
        </h1>
        <p className="text-gray-600">
          Real-time monitoring of FHIR resource changes via Server-Sent Events
        </p>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`h-3 w-3 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            ></div>
            <span className="text-lg font-medium">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {error && <span className="text-sm text-red-600">({error})</span>}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={clearEvents}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
            >
              Clear Events
            </button>
            {isConnected ? (
              <button
                onClick={disconnect}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={connect}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Resource Types
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTopics.map((topic) => (
                <button
                  key={topic}
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Actions
            </label>
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action) => (
                <button
                  key={action}
                  onClick={() => toggleAction(action)}
                  className={`px-3 py-1 rounded-full text-sm font-medium capitalize transition ${
                    selectedActions.includes(action)
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-sm text-gray-600">Total Events</div>
          <div className="text-3xl font-bold text-gray-900">
            {events.length}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg shadow-md p-6">
          <div className="text-sm text-green-600">Created</div>
          <div className="text-3xl font-bold text-green-700">
            {events.filter((e) => e.action === 'create').length}
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow-md p-6">
          <div className="text-sm text-blue-600">Updated</div>
          <div className="text-3xl font-bold text-blue-700">
            {events.filter((e) => e.action === 'update').length}
          </div>
        </div>
      </div>

      {/* Event List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Event Log</h2>
        </div>
        <div className="overflow-x-auto">
          {events.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p className="text-lg">No events received yet</p>
              <p className="text-sm mt-2">
                {isConnected
                  ? 'Waiting for FHIR resource changes...'
                  : 'Connect to start monitoring events'}
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource ID
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.map((event, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${getActionColor(
                          event.action,
                        )}`}
                      >
                        {event.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {event.resourceType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {event.resourceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
