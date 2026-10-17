import React, { useEffect, useState } from 'react';
import {
  agentBuilderService,
  TerminologyConcept,
} from '../services/agentBuilderService';

const resourceTypes = ['Condition', 'Observation', 'MedicationRequest'];
type TerminologyResourceType = (typeof resourceTypes)[number];

export const TenantTerminologyForm: React.FC<{
  initialResourceType: TerminologyResourceType;
  onSaved: (concept: TerminologyConcept) => void;
  onCancel?: () => void;
}> = ({ initialResourceType, onSaved, onCancel }) => {
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [system, setSystem] = useState('');
  const [code, setCode] = useState('');
  const [display, setDisplay] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const concept = await agentBuilderService.createTenantTerminology({
        resourceType,
        name: name.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        system: system.trim(),
        code: code.trim(),
        ...(display.trim() ? { display: display.trim() } : {}),
      });
      onSaved(concept);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to add tenant terminology.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-700">
        Resource type
        <select
          value={resourceType}
          onChange={(event) =>
            setResourceType(event.target.value as TerminologyResourceType)
          }
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {resourceTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">
        Lookup name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. hypertension"
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        Display name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        System URI
        <input
          required
          value={system}
          onChange={(event) => setSystem(event.target.value)}
          placeholder="https://codes.example.org"
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        Code
        <input
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        Display
        <input
          value={display}
          onChange={(event) => setDisplay(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-rose-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add tenant code'}
        </button>
      </div>
    </form>
  );
};

export const QuickAddTenantTerminology: React.FC<{
  resourceType: TerminologyResourceType;
  onSaved: (concept: TerminologyConcept) => void;
}> = ({ resourceType, onSaved }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      {!open ? (
        <button
          type="button"
          aria-label={`Add tenant ${resourceType} code`}
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold text-cyan-800 underline"
        >
          Add tenant code
        </button>
      ) : (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-terminology-title"
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <header className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2
                  id="quick-add-terminology-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Add tenant code
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Add a {resourceType} code to this tenant’s terminology lookup.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close terminology form"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <TenantTerminologyForm
              initialResourceType={resourceType}
              onSaved={(concept) => {
                onSaved(concept);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </section>
        </div>
      )}
    </div>
  );
};

const TenantTerminologyPage: React.FC = () => {
  const [concepts, setConcepts] = useState<TerminologyConcept[]>([]);
  const [resourceType, setResourceType] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void agentBuilderService
        .listTenantTerminology(resourceType || undefined, query)
        .then(
          (items) => {
            if (active) setConcepts(items);
          },
          (failure: unknown) => {
            if (active)
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Unable to load tenant terminology.',
              );
          },
        )
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [resourceType, query, refresh]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Tenant configuration
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Terminology
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tenant-specific clinical codes are preferred by authoring
            terminology lookup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
        >
          {adding ? 'Close form' : 'Add code'}
        </button>
      </header>
      {adding && (
        <section className="border-b border-slate-200 pb-4">
          <TenantTerminologyForm
            initialResourceType="Condition"
            onSaved={() => {
              setAdding(false);
              setRefresh((value) => value + 1);
            }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, display, code, or system"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="w-56 text-xs font-medium text-slate-600">
          Resource type
          <select
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {resourceTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-6 text-sm text-slate-500">
          Loading tenant terminology…
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Resource type</th>
                <th className="py-2 pr-3 font-semibold">System</th>
                <th className="py-2 pr-3 font-semibold">Code</th>
                <th className="py-2 font-semibold">Display</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {concepts.map((concept) => (
                <tr key={concept.id}>
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {concept.displayName || concept.name}
                    {concept.displayName && (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {concept.name}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{concept.resourceType}</td>
                  <td className="max-w-64 break-all py-2 pr-3 font-mono text-xs">
                    {concept.system}
                  </td>
                  <td className="py-2 pr-3 font-mono">{concept.code}</td>
                  <td className="py-2">{concept.display || '—'}</td>
                </tr>
              ))}
              {!concepts.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    No tenant codes match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Codes can be added or searched here. Deletion is not available in the
        portal.
      </p>
    </section>
  );
};

export default TenantTerminologyPage;
