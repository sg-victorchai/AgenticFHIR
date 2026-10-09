import React, { useEffect, useState } from 'react';
import { agentBuilderService } from '../../services/agentBuilderService';

const SeededResourceBrowser: React.FC<{
  seedJobId: string;
  resourceType: string;
  onClose: () => void;
}> = ({ seedJobId, resourceType, onClose }) => {
  const [resources, setResources] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setResources([]);
    setLoading(true);
    setError(null);
    setProgress({ loaded: 0, total: 0 });
    void (async () => {
      try {
        const patients = await agentBuilderService.getSeededPatients(seedJobId);
        if (!active) return;
        const collected = new Map<string, Record<string, unknown>>();
        setProgress({ loaded: 0, total: patients.patientIds.length });
        for (let offset = 0; offset < patients.patientIds.length; offset += 4) {
          if (!active) return;
          const bundles = await Promise.all(
            patients.patientIds
              .slice(offset, offset + 4)
              .map((id) =>
                agentBuilderService.getSeededPatientBundle(seedJobId, id),
              ),
          );
          if (!active) return;
          for (const bundle of bundles) {
            for (const entry of bundle.entry || []) {
              const resource = entry.resource;
              if (resource?.resourceType !== resourceType) continue;
              const key =
                typeof resource.id === 'string'
                  ? resource.id
                  : JSON.stringify(resource);
              collected.set(key, resource);
            }
          }
          setProgress({
            loaded: Math.min(offset + 4, patients.patientIds.length),
            total: patients.patientIds.length,
          });
        }
        setResources([...collected.values()]);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load seeded resources.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [seedJobId, resourceType, retry]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Seeded ${resourceType} data`}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Seeded {resourceType}
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              Seed job {seedJobId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          {loading && (
            <p role="status" className="text-sm text-slate-600">
              Loading resources... {progress.loaded}/{progress.total} patient
              bundles
            </p>
          )}
          {error && (
            <div role="alert" className="text-sm text-rose-700">
              {error}
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="ml-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && (
            <>
              <p className="mb-3 text-sm text-slate-600">
                {resources.length} {resourceType} resources
              </p>
              {!resources.length && (
                <p className="text-sm text-slate-500">
                  No {resourceType} resources were returned for this seed job.
                </p>
              )}
              <div className="divide-y divide-slate-200">
                {resources.map((resource, index) => (
                  <details key={String(resource.id || index)} className="py-3">
                    <summary className="cursor-pointer break-all text-sm font-medium text-slate-800">
                      {resourceType}/{String(resource.id || index + 1)}
                    </summary>
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      {JSON.stringify(resource, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default SeededResourceBrowser;
