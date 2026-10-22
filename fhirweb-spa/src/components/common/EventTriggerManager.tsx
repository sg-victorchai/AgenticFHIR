import { useEffect, useState } from 'react';
import {
  createEventTrigger,
  deleteEventTrigger,
  EventTrigger,
  listEventTriggers,
  replaceEventTrigger,
} from '../../services/configuredAssetsService';

const topics = [
  [
    'observation-vital-out-of-range',
    'Observation created or updated with interpretation',
  ],
  ['condition-recorded', 'Condition created'],
  ['encounter-arrived', 'Encounter created or status changed'],
  ['medication-administered', 'MedicationAdministration created'],
  ['document-ready', 'DocumentReference created'],
  ['careplan-enrollment', 'CarePlan enrollment created'],
  ['careplan-healthplan', 'CarePlan health plan changed'],
  ['patient-demographic-change', 'Patient updated'],
] as const;

const blank = (resourceType: string): EventTrigger => ({
  triggerId: '',
  topicRef:
    resourceType === 'Encounter'
      ? 'encounter-arrived'
      : resourceType === 'Patient'
        ? 'patient-demographic-change'
        : resourceType === 'Condition'
          ? 'condition-recorded'
          : resourceType === 'Observation'
            ? 'observation-vital-out-of-range'
            : topics[0][0],
  resourceType,
  scopeExtractor: 'subject.reference',
  suppressionWindow: 'PT0S',
  consolidate: 'last',
  actionType: 'persona-mission',
  actionConfig: { personaId: '', goalTemplate: '' },
  enabled: true,
});

const actionText = (trigger: EventTrigger, key: string) =>
  String(trigger.actionConfig[key] ?? '');

export default function EventTriggerManager({
  resourceType,
  onChanged,
  canManage = true,
}: {
  resourceType: string;
  onChanged: () => void;
  canManage?: boolean;
}) {
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventTrigger | null | false>(false);
  const [form, setForm] = useState<EventTrigger>(blank(resourceType));
  const [headersText, setHeadersText] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const isCustomTopic = !topics.some(([id]) => id === form.topicRef);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listEventTriggers()
      .then(
        (items) => {
          if (active) {
            setTriggers(
              items.filter((item) => item.resourceType === resourceType),
            );
            setLoadError(null);
          }
        },
        (failure: unknown) => {
          if (active)
            setLoadError(
              failure instanceof Error
                ? failure.message
                : 'Unable to load event triggers.',
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceType, attempt]);

  const openEditor = (trigger?: EventTrigger) => {
    const next = trigger
      ? { ...trigger, actionConfig: { ...trigger.actionConfig } }
      : blank(resourceType);
    setEditing(trigger || null);
    setForm(next);
    setHeadersText(JSON.stringify(next.actionConfig.headers || {}, null, 2));
    setError(null);
  };

  const updateAction = (key: string, value: unknown) =>
    setForm((current) => ({
      ...current,
      actionConfig: { ...current.actionConfig, [key]: value },
    }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let actionConfig = form.actionConfig;
    if (form.actionType === 'rest-hook') {
      if (
        /\bBearer\s+(?!\$\{ENV_[A-Z0-9_]+\})\S+/i.test(headersText) ||
        /(?:password|secret|api[_-]?key)\s*[:=]\s*(?!\$\{ENV_)[^\s"']+/i.test(
          headersText,
        )
      ) {
        setError(
          'Use ${ENV_VARIABLE_NAME} placeholders for secrets; do not enter literal credentials.',
        );
        setBusy(false);
        return;
      }
      try {
        actionConfig = {
          ...actionConfig,
          headers: JSON.parse(headersText || '{}'),
        };
      } catch {
        setError('Headers must be valid JSON key/value pairs.');
        setBusy(false);
        return;
      }
    }
    try {
      const payload = { ...form, actionConfig };
      if (editing) await replaceEventTrigger(payload);
      else await createEventTrigger(payload);
      setEditing(false);
      setAttempt((value) => value + 1);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to save event trigger.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (trigger: EventTrigger) => {
    if (!window.confirm(`Disable event trigger ${trigger.triggerId}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEventTrigger(trigger.triggerId);
      setAttempt((value) => value + 1);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to disable event trigger.',
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (trigger: EventTrigger) => {
    setBusy(true);
    setError(null);
    try {
      await replaceEventTrigger({ ...trigger, enabled: !trigger.enabled });
      setAttempt((value) => value + 1);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to update event trigger.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Event Triggers · {resourceType}
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => openEditor()}
            className="rounded bg-cyan-800 px-3 py-2 text-sm font-semibold text-white"
          >
            + Add Trigger
          </button>
        )}
      </div>
      {loadError && (
        <div
          role="alert"
          className="mb-3 border-l-4 border-rose-400 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {loadError}{' '}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="underline"
          >
            Retry
          </button>
        </div>
      )}
      {error && !editing && (
        <p role="alert" className="mb-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-6 text-sm text-slate-500">
          Loading event triggers…
        </p>
      ) : !loadError && !triggers.length ? (
        <p className="py-6 text-sm text-slate-500">
          No event triggers are configured for {resourceType}.
        </p>
      ) : (
        !loadError && (
          <div className="overflow-x-auto border-y border-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {['Topic', 'Action type', 'Status', 'Actions'].map(
                    (label) => (
                      <th key={label} className="px-3 py-2">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {triggers.map((trigger) => (
                  <tr
                    key={trigger.triggerId}
                    className="border-t border-slate-100"
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">
                        {trigger.topicRef}
                      </p>
                      <p className="text-xs text-slate-500">
                        {trigger.triggerId} · suppression{' '}
                        {trigger.suppressionWindow || 'PT0S'}
                      </p>
                    </td>
                    <td className="px-3 py-3">{trigger.actionType}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => void toggle(trigger)}
                        className={`text-xs font-semibold ${trigger.enabled ? 'text-emerald-700' : 'text-slate-500'}`}
                      >
                        {trigger.enabled ? '● Active' : '○ Disabled'}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-3 text-xs">
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditor(trigger)}
                              className="text-cyan-800 underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(trigger)}
                              className="text-rose-700 underline"
                            >
                              Disable
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-400">Read only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {editing !== false && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5">
          <form
            onSubmit={save}
            aria-label={editing ? 'Edit event trigger' : 'Add event trigger'}
            className="max-h-[92vh] w-full max-w-2xl overflow-auto bg-white p-5 shadow-xl sm:rounded-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {editing ? 'Edit' : 'Add'} Event Trigger
              </h4>
              <button
                type="button"
                aria-label="Close trigger editor"
                onClick={() => setEditing(false)}
                className="rounded p-2 text-slate-500"
              >
                ×
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Trigger ID
                <input
                  required
                  disabled={Boolean(editing)}
                  value={form.triggerId}
                  onChange={(event) =>
                    setForm({ ...form, triggerId: event.target.value })
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>
              <label className="text-sm font-medium">
                Topic
                <select
                  value={isCustomTopic ? '__custom__' : form.topicRef}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      topicRef:
                        event.target.value === '__custom__'
                          ? ''
                          : event.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                >
                  {topics.map(([id, description]) => (
                    <option key={id} value={id}>
                      {id} · {description}
                    </option>
                  ))}
                  <option value="__custom__">Custom tenant topic…</option>
                </select>
              </label>
              {isCustomTopic && (
                <label className="text-sm font-medium">
                  Custom topic ID
                  <input
                    required
                    value={form.topicRef}
                    onChange={(event) =>
                      setForm({ ...form, topicRef: event.target.value })
                    }
                    placeholder="tenant-topic-id"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              )}
              <label className="text-sm font-medium">
                Resource type
                <input
                  value={form.resourceType}
                  readOnly
                  className="mt-1 block w-full rounded border border-slate-300 bg-slate-100 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium">
                Scope extractor
                <input
                  value={form.scopeExtractor}
                  onChange={(event) =>
                    setForm({ ...form, scopeExtractor: event.target.value })
                  }
                  placeholder="subject.reference"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="text-sm font-medium">
                Action type
                <select
                  value={form.actionType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      actionType: event.target
                        .value as EventTrigger['actionType'],
                      actionConfig:
                        event.target.value === 'rest-hook'
                          ? {
                              url: '',
                              method: 'POST',
                              headers: {},
                              payloadTemplate: '',
                            }
                          : event.target.value === 'email'
                            ? {
                                toStatic: '',
                                subject: '',
                                bodyTemplate: '',
                                cc: [],
                              }
                            : { personaId: '', goalTemplate: '' },
                    })
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="rest-hook">Call external API</option>
                  <option value="persona-mission">Trigger AI persona</option>
                  <option value="email">Send email</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Suppression window
                <input
                  value={form.suppressionWindow}
                  onChange={(event) =>
                    setForm({ ...form, suppressionWindow: event.target.value })
                  }
                  placeholder="PT1H"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  ISO 8601 duration, such as PT1H.
                </span>
              </label>
              <label className="text-sm font-medium">
                Consolidate
                <select
                  value={form.consolidate}
                  onChange={(event) =>
                    setForm({ ...form, consolidate: event.target.value })
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="first">First event</option>
                  <option value="last">Latest event</option>
                </select>
              </label>
            </div>
            {form.actionType === 'rest-hook' && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium">
                  Endpoint URL
                  <input
                    required
                    type="url"
                    value={actionText(form, 'url')}
                    onChange={(event) =>
                      updateAction('url', event.target.value)
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Method
                    <select
                      value={actionText(form, 'method') || 'POST'}
                      onChange={(event) =>
                        updateAction('method', event.target.value)
                      }
                      className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                    >
                      {['GET', 'POST', 'PUT'].map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Payload template
                    <input
                      value={actionText(form, 'payloadTemplate')}
                      onChange={(event) =>
                        updateAction('payloadTemplate', event.target.value)
                      }
                      className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Headers (JSON)
                  <textarea
                    value={headersText}
                    onChange={(event) => setHeadersText(event.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <p className="border-l-4 border-amber-400 bg-amber-50 p-2 text-xs text-amber-900">
                  Store secrets as environment variables, for example ${'{'}
                  ENV_API_KEY{'}'}. Never paste tokens directly.
                </p>
              </div>
            )}
            {form.actionType === 'persona-mission' && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium">
                  Persona ID
                  <input
                    required
                    value={actionText(form, 'personaId')}
                    onChange={(event) =>
                      updateAction('personaId', event.target.value)
                    }
                    placeholder="care-coordinator"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Goal template
                  <textarea
                    required
                    value={actionText(form, 'goalTemplate')}
                    onChange={(event) =>
                      updateAction('goalTemplate', event.target.value)
                    }
                    placeholder="Review {{scopeRef}} triggered by {{topicId}}"
                    rows={3}
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            )}
            {form.actionType === 'email' && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium">
                  To
                  <input
                    required
                    value={actionText(form, 'toStatic')}
                    onChange={(event) =>
                      updateAction('toStatic', event.target.value)
                    }
                    placeholder="address@example.com or resource template"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Subject
                  <input
                    required
                    value={actionText(form, 'subject')}
                    onChange={(event) =>
                      updateAction('subject', event.target.value)
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Body template ID
                  <input
                    required
                    value={actionText(form, 'bodyTemplate')}
                    onChange={(event) =>
                      updateAction('bodyTemplate', event.target.value)
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  CC addresses
                  <input
                    value={
                      Array.isArray(form.actionConfig.cc)
                        ? form.actionConfig.cc.join(', ')
                        : ''
                    }
                    onChange={(event) =>
                      updateAction(
                        'cc',
                        event.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="rounded bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save Trigger'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
