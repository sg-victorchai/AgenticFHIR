import React, { useEffect, useState } from 'react';
import {
  agentBuilderService,
  SeededResourceBundle,
} from '../../services/agentBuilderService';

const SeededResourceBrowser: React.FC<{
  seedJobId: string;
  resourceType: string;
  onClose: () => void;
}> = ({ seedJobId, resourceType, onClose }) => {
  const [resources, setResources] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [bundle, setBundle] = useState<SeededResourceBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setResources([]);
    setLoading(true);
    setError(null);
    setBundle(null);
    void (async () => {
      try {
        const result = await agentBuilderService.getSeededResources(
          seedJobId,
          resourceType,
          page,
          50,
        );
        if (!active) return;
        setBundle(result);
        setResources(
          (result.entry || []).flatMap((entry) =>
            entry.resource ? [entry.resource] : [],
          ),
        );
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
  }, [seedJobId, resourceType, page, retry]);

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
              Loading resources...
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
                {bundle?.total ?? resources.length} {resourceType} resources
              </p>
              {!resources.length && (
                <p className="text-sm text-slate-500">
                  No {resourceType} resources were returned for this seed job.
                </p>
              )}
              <div className="divide-y divide-slate-200">
                {resources.map((resource, index) => (
                  <details
                    key={`${page}:${String(resource.id || index)}`}
                    className="py-3"
                  >
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
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
          <span className="text-xs text-slate-600">
            {bundle
              ? `Page ${bundle._meta.page + 1} of ${Math.max(1, bundle._meta.totalPages)} · ${resources.length} shown`
              : `Page ${page + 1}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || page === 0}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || Boolean(error) || !bundle?._meta.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default SeededResourceBrowser;
