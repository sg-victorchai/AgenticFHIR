import { useState } from 'react';
import {
  AssetBusinessRule,
  BusinessRuleWrite,
  createBusinessRule,
  deleteBusinessRule,
  replaceBusinessRule,
} from '../../services/configuredAssetsService';

const plugins = [
  ['fhirpath-guard', 'Validate fields and FHIR structure'],
  ['spel-guard', 'Enforce numeric or context-aware conditions'],
  ['cross-resource-check', 'Check related records before saving'],
  ['fhirpath-enrichment', 'Stamp or mutate FHIR fields'],
  ['spel-enrichment', 'Compute and assign derived values'],
] as const;

type RuleItem = { expression: string; message: string };
type CheckItem = { query: string; minCount: string; message: string };
type MutationItem = { expression: string };
type AssignmentItem = {
  expression: string;
  targetPath: string;
  sequence: string;
};

const initialRule = (resourceType: string): BusinessRuleWrite => ({
  ruleId: '',
  targetResourceType: resourceType,
  triggerOperation: 'create',
  phase: 'before',
  mode: 'sync',
  priority: 50,
  enabled: true,
  pluginId: 'fhirpath-guard',
  properties: { rules: [{ expression: '', message: '' }] },
  description: '',
});

const objectRows = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function RuleEditor({
  resourceType,
  rule,
  onClose,
  onSaved,
}: {
  resourceType: string;
  rule?: AssetBusinessRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BusinessRuleWrite>(() => {
    if (!rule) return initialRule(resourceType);
    return {
      ...rule,
      description: rule.description || '',
      triggerOperation: rule.triggerOperation.toLowerCase(),
      phase: rule.phase.toLowerCase(),
      mode: rule.mode.toLowerCase(),
    };
  });
  const [items, setItems] = useState<RuleItem[]>(() => {
    const rows = objectRows<RuleItem | string>(rule?.properties.rules);
    return rows.length
      ? rows.map((row) =>
          typeof row === 'string'
            ? { expression: row, message: '' }
            : { expression: row.expression || '', message: row.message || '' },
        )
      : [{ expression: '', message: '' }];
  });
  const [checks, setChecks] = useState<CheckItem[]>(() => {
    const rows = objectRows<Record<string, unknown>>(rule?.properties.checks);
    return rows.length
      ? rows.map((row) => ({
          query: String(row.query || ''),
          minCount: String(row['min-count'] ?? 1),
          message: String(row.message || ''),
        }))
      : [{ query: '', minCount: '1', message: '' }];
  });
  const [mutations, setMutations] = useState<MutationItem[]>(() => {
    const rows = objectRows<Record<string, unknown>>(
      rule?.properties.mutations,
    );
    return rows.length
      ? rows.map((row) => ({ expression: String(row.expression || '') }))
      : [{ expression: '' }];
  });
  const [assignments, setAssignments] = useState<AssignmentItem[]>(() => {
    const rows = objectRows<Record<string, unknown>>(
      rule?.properties.assignments,
    );
    return rows.length
      ? rows.map((row, index) => ({
          expression: String(row.expression || ''),
          targetPath: String(row['target-path'] || ''),
          sequence: String(row.sequence ?? index + 1),
        }))
      : [{ expression: '', targetPath: '', sequence: '1' }];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<BusinessRuleWrite>) =>
    setForm((current) => ({ ...current, ...patch }));

  const properties = () => {
    switch (form.pluginId) {
      case 'fhirpath-guard':
      case 'spel-guard':
        return {
          rules: items.map(({ expression, message }) => ({
            expression,
            message,
          })),
        };
      case 'cross-resource-check':
        return {
          checks: checks.map(({ query, minCount, message }) => ({
            query,
            'min-count': Number(minCount) || 0,
            message,
          })),
        };
      case 'fhirpath-enrichment':
        return {
          mutations: mutations.map(({ expression }, index) => ({
            expression,
            sequence: index + 1,
          })),
        };
      case 'spel-enrichment':
        return {
          assignments: assignments.map((item, index) => ({
            expression: item.expression,
            'target-path': item.targetPath,
            sequence: Number(item.sequence) || index + 1,
          })),
        };
      default:
        return {};
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      ruleId:
        form.ruleId || `${slug(resourceType)}-${form.pluginId}-${Date.now()}`,
      properties: properties(),
    };
    try {
      if (rule) await replaceBusinessRule(payload);
      else await createBusinessRule(payload);
      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Unable to save rule.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5">
      <form
        onSubmit={save}
        className="max-h-[92vh] w-full max-w-3xl overflow-auto bg-white p-5 shadow-xl sm:rounded-lg"
        aria-label={rule ? 'Edit business rule' : 'Add business rule'}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {rule ? 'Edit Rule' : 'Add Rule'} · {resourceType}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="rounded p-2 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Plugin type
            <select
              value={form.pluginId}
              onChange={(event) =>
                update({ pluginId: event.target.value, properties: {} })
              }
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              {plugins.map(([id, label]) => (
                <option key={id} value={id}>
                  {id} · {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Rule ID
            <input
              value={form.ruleId}
              onChange={(event) => update({ ruleId: event.target.value })}
              placeholder="Generated if blank"
              disabled={Boolean(rule)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            />
          </label>
          <label className="text-sm font-medium">
            Trigger
            <select
              value={form.triggerOperation}
              onChange={(event) =>
                update({ triggerOperation: event.target.value })
              }
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              {['create', 'update', 'delete', 'read', 'ALL'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Phase
            <select
              value={form.phase}
              onChange={(event) => update({ phase: event.target.value })}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              {['before', 'after', 'both'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mode
            <select
              value={form.mode}
              onChange={(event) => update({ mode: event.target.value })}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              {['sync', 'async'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Priority
            <input
              type="number"
              value={form.priority}
              onChange={(event) =>
                update({ priority: Number(event.target.value) })
              }
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        {(form.pluginId === 'fhirpath-guard' ||
          form.pluginId === 'spel-guard') && (
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2 text-sm font-semibold">Expressions</legend>
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  aria-label={`Expression ${index + 1}`}
                  value={item.expression}
                  onChange={(event) =>
                    setItems((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, expression: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="FHIRPath or SpEL expression"
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <input
                  aria-label={`Error message ${index + 1}`}
                  value={item.message}
                  onChange={(event) =>
                    setItems((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, message: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="Message if the expression fails"
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setItems((rows) =>
                      rows.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  className="px-2 text-rose-700"
                  aria-label={`Remove expression ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setItems((rows) => [...rows, { expression: '', message: '' }])
              }
              className="text-sm font-medium text-cyan-800"
            >
              + Add expression
            </button>
          </fieldset>
        )}
        {form.pluginId === 'cross-resource-check' && (
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2 text-sm font-semibold">
              Prerequisite checks
            </legend>
            {checks.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[2fr_90px_2fr_auto]"
              >
                <input
                  aria-label={`Search query ${index + 1}`}
                  value={item.query}
                  onChange={(event) =>
                    setChecks((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, query: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="Patient?_id={subject.idPart}&active=true"
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <input
                  aria-label={`Minimum count ${index + 1}`}
                  type="number"
                  min="0"
                  value={item.minCount}
                  onChange={(event) =>
                    setChecks((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, minCount: event.target.value }
                          : row,
                      ),
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-2"
                />
                <input
                  aria-label={`Check message ${index + 1}`}
                  value={item.message}
                  onChange={(event) =>
                    setChecks((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, message: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="Failure message"
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setChecks((rows) =>
                      rows.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  className="px-2 text-rose-700"
                  aria-label={`Remove check ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setChecks((rows) => [
                  ...rows,
                  { query: '', minCount: '1', message: '' },
                ])
              }
              className="text-sm font-medium text-cyan-800"
            >
              + Add check
            </button>
          </fieldset>
        )}
        {form.pluginId === 'fhirpath-enrichment' && (
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2 text-sm font-semibold">
              FHIRPath mutations
            </legend>
            {mutations.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  aria-label={`Mutation ${index + 1}`}
                  value={item.expression}
                  onChange={(event) =>
                    setMutations((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { expression: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder={`${resourceType}.meta.source = 'portal'`}
                  className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    setMutations((rows) =>
                      rows.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  className="px-2 text-rose-700"
                  aria-label={`Remove mutation ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setMutations((rows) => [...rows, { expression: '' }])
              }
              className="text-sm font-medium text-cyan-800"
            >
              + Add mutation
            </button>
          </fieldset>
        )}
        {form.pluginId === 'spel-enrichment' && (
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2 text-sm font-semibold">
              Computed assignments
            </legend>
            {assignments.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_70px_auto]"
              >
                <input
                  aria-label={`SpEL expression ${index + 1}`}
                  value={item.expression}
                  onChange={(event) =>
                    setAssignments((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, expression: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="resource['amount'] * 1.13"
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <input
                  aria-label={`Target field ${index + 1}`}
                  value={item.targetPath}
                  onChange={(event) =>
                    setAssignments((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, targetPath: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder={`${resourceType}.total`}
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <input
                  aria-label={`Sequence ${index + 1}`}
                  type="number"
                  min="1"
                  value={item.sequence}
                  onChange={(event) =>
                    setAssignments((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, sequence: event.target.value }
                          : row,
                      ),
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-2"
                />
                <button
                  type="button"
                  onClick={() =>
                    setAssignments((rows) =>
                      rows.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  className="px-2 text-rose-700"
                  aria-label={`Remove assignment ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setAssignments((rows) => [
                  ...rows,
                  {
                    expression: '',
                    targetPath: '',
                    sequence: String(rows.length + 1),
                  },
                ])
              }
              className="text-sm font-medium text-cyan-800"
            >
              + Add assignment
            </button>
            <p className="text-xs text-slate-500">
              BEFORE stores the computed value. AFTER enriches only the
              response.
            </p>
          </fieldset>
        )}
        <label className="mt-5 block text-sm font-medium">
          Description
          <textarea
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
            rows={2}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BusinessRuleManager({
  resourceType,
  rules,
  onChanged,
  canManage = true,
  openAddForm = false,
}: {
  resourceType: string;
  rules: AssetBusinessRule[];
  onChanged: () => void;
  canManage?: boolean;
  openAddForm?: boolean;
}) {
  const [editing, setEditing] = useState<AssetBusinessRule | null | false>(
    openAddForm ? null : false,
  );
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operations = [...new Set(rules.map((rule) => rule.triggerOperation))];

  const toggle = async (rule: AssetBusinessRule) => {
    setBusyRule(rule.ruleId);
    setError(null);
    try {
      await replaceBusinessRule({
        ruleId: rule.ruleId,
        targetResourceType: rule.targetResourceType,
        triggerOperation: rule.triggerOperation.toLowerCase(),
        phase: rule.phase.toLowerCase(),
        mode: rule.mode.toLowerCase(),
        priority: rule.priority,
        pluginId: rule.pluginId,
        properties: rule.properties,
        enabled: !rule.enabled,
        description: rule.description || '',
      });
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Unable to update rule.',
      );
    } finally {
      setBusyRule(null);
    }
  };

  const remove = async (rule: AssetBusinessRule) => {
    if (!window.confirm(`Disable rule ${rule.ruleId}?`)) return;
    setBusyRule(rule.ruleId);
    setError(null);
    try {
      await deleteBusinessRule(resourceType, rule.ruleId);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Unable to disable rule.',
      );
    } finally {
      setBusyRule(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Business Rules · {resourceType}
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded bg-cyan-800 px-3 py-2 text-sm font-semibold text-white"
          >
            + Add Rule
          </button>
        )}
      </div>
      <details className="mb-4 border-l-4 border-cyan-500 bg-cyan-50 p-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold">
          How the rule pipeline runs
        </summary>
        <p className="mt-2">
          Rules run in ascending priority within each phase. BEFORE rules can
          block or enrich a write; AFTER rules run after persistence. Common
          rules may also apply across resource types.
        </p>
      </details>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {operations.length === 0 && (
        <p className="py-6 text-sm text-slate-500">
          No business rules are configured for {resourceType}.
        </p>
      )}
      {operations.map((operation) => (
        <section key={operation} className="mb-6">
          <h4 className="mb-2 text-sm font-semibold text-slate-800">
            When {operation === 'ALL' ? 'any operation' : operation} runs
          </h4>
          <div className="overflow-x-auto border-y border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {[
                    'Priority',
                    'Plugin / Source',
                    'Phase / Mode',
                    'Purpose & Configuration',
                    'Status',
                    'Actions',
                  ].map((name) => (
                    <th key={name} className="px-2 py-2">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules
                  .filter((rule) => rule.triggerOperation === operation)
                  .sort((a, b) => a.priority - b.priority)
                  .map((rule) => {
                    const portal = rule.authoringSource === 'portal';
                    return (
                      <tr
                        key={rule.ruleId}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="px-2 py-3 font-mono">{rule.priority}</td>
                        <td className="px-2 py-3">
                          <p className="break-words font-medium">
                            {rule.pluginId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {portal ? 'Portal' : '🔒 Platform'}
                            {rule.targetResourceType !== resourceType
                              ? ` · ${rule.targetResourceType}`
                              : ''}
                          </p>
                          {!portal && (
                            <p className="mt-1 max-w-56 text-[11px] text-slate-500">
                              Defined in platform configuration; change it in
                              the codebase.
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-3 text-xs">
                          {rule.phase}
                          <br />
                          {rule.mode}
                        </td>
                        <td className="max-w-md px-2 py-3">
                          <p className="break-words">
                            {rule.description || 'No description provided.'}
                          </p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-cyan-800">
                              Configuration
                            </summary>
                            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-2 text-xs">
                              {JSON.stringify(rule.properties, null, 2)}
                            </pre>
                          </details>
                        </td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            disabled={
                              !portal || !canManage || busyRule === rule.ruleId
                            }
                            onClick={() => void toggle(rule)}
                            aria-label={`Toggle ${rule.ruleId}`}
                            title={
                              portal
                                ? 'Toggle enabled'
                                : 'Platform rules cannot be changed here'
                            }
                            className={`whitespace-nowrap text-xs font-semibold ${rule.enabled ? 'text-emerald-700' : 'text-slate-500'} disabled:cursor-not-allowed`}
                          >
                            {rule.enabled ? '● Enabled' : '○ Disabled'}
                          </button>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex gap-2 text-xs">
                            {portal && canManage ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyRule === rule.ruleId}
                                  onClick={() => setEditing(rule)}
                                  className="text-cyan-800 underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRule === rule.ruleId}
                                  onClick={() => void remove(rule)}
                                  className="text-rose-700 underline"
                                >
                                  Disable
                                </button>
                              </>
                            ) : (
                              <span className="text-slate-400">Locked</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {editing !== false && (
        <RuleEditor
          resourceType={resourceType}
          rule={editing || undefined}
          onClose={() => setEditing(false)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
