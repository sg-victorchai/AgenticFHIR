import React, { useEffect, useRef, useState } from 'react';
import {
  agentBuilderService,
  ScenarioDetail,
  ScenarioSummary,
  SeedStatus,
  SeededPatientBundle,
} from '../../services/agentBuilderService';

interface PreviousSeed {
  scenario: ScenarioSummary;
  job: SeedStatus;
}

const PreviousEvalData: React.FC<{
  personaId: string;
  refreshKey: string;
  disabled: boolean;
  submittedTenantId?: string;
  onSubmit: (scenario: ScenarioDetail, job: SeedStatus) => Promise<void>;
}> = ({ personaId, refreshKey, disabled, submittedTenantId, onSubmit }) => {
  const [items, setItems] = useState<PreviousSeed[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluatedTenants, setEvaluatedTenants] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [browseJob, setBrowseJob] = useState<SeedStatus | null>(null);
  const [patientIds, setPatientIds] = useState<string[]>([]);
  const [patientId, setPatientId] = useState('');
  const [bundle, setBundle] = useState<SeededPatientBundle | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const requestId = useRef(0);
  const selected = items.find((item) => item.job.seedJobId === selectedId);
  const alreadyEvaluated = Boolean(
    selected &&
    (evaluatedTenants.includes(selected.job.evalTenantId) ||
      selected.job.evalTenantId === submittedTenantId),
  );
  const buttonClass =
    'rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [scenarios, runs] = await Promise.all([
          agentBuilderService.listScenarios(personaId),
          agentBuilderService.listEvalRuns(
            personaId,
            import.meta.env.VITE_TENANT_ID || 'default',
          ),
        ]);
        const histories = await Promise.all(
          scenarios.map(async (scenario) => {
            const jobs = await agentBuilderService.listSeedJobs(
              scenario.scenarioId,
            );
            return jobs.map((job) => ({ scenario, job }));
          }),
        );
        const previous = histories
          .flat()
          .sort((first, second) =>
            (second.job.createdAt || '').localeCompare(
              first.job.createdAt || '',
            ),
          );
        if (!active) return;
        setEvaluatedTenants(
          runs.flatMap((run) => (run.evalTenantId ? [run.evalTenantId] : [])),
        );
        setItems(previous);
        setSelectedId((current) =>
          previous.some((item) => item.job.seedJobId === current)
            ? current
            : (
                previous.find((item) => item.job.seedStatus === 'COMPLETED') ||
                previous[0]
              )?.job.seedJobId || '',
        );
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load previous evaluation data.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [personaId, refreshKey, refresh]);

  const browsePatients = async (job: SeedStatus) => {
    const current = ++requestId.current;
    setBrowseJob(job);
    setPatientIds([]);
    setPatientId('');
    setBundle(null);
    setBrowseError(null);
    setBrowseLoading(true);
    try {
      const patients = await agentBuilderService.getSeededPatients(
        job.seedJobId,
      );
      if (current === requestId.current) setPatientIds(patients.patientIds);
    } catch (failure) {
      if (current === requestId.current)
        setBrowseError(
          failure instanceof Error
            ? failure.message
            : 'Unable to load seeded patients.',
        );
    } finally {
      if (current === requestId.current) setBrowseLoading(false);
    }
  };

  const viewPatient = async (id: string) => {
    if (!browseJob) return;
    const current = ++requestId.current;
    setPatientId(id);
    setBundle(null);
    setBrowseError(null);
    setBrowseLoading(true);
    try {
      const result = await agentBuilderService.getSeededPatientBundle(
        browseJob.seedJobId,
        id,
      );
      if (current === requestId.current) setBundle(result);
    } catch (failure) {
      if (current === requestId.current)
        setBrowseError(
          failure instanceof Error
            ? failure.message
            : 'Unable to load the patient bundle.',
        );
    } finally {
      if (current === requestId.current) setBrowseLoading(false);
    }
  };

  const submit = async () => {
    if (
      !selected ||
      selected.job.seedStatus !== 'COMPLETED' ||
      disabled ||
      submitting ||
      alreadyEvaluated ||
      loading ||
      Boolean(error)
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      const scenario = await agentBuilderService.getScenario(
        selected.scenario.scenarioId,
      );
      await onSubmit(scenario, selected.job);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to submit evaluation.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = (bundle?.entry || []).reduce<
    Record<string, Record<string, unknown>[]>
  >((groups, entry) => {
    if (!entry.resource) return groups;
    const type = String(entry.resource.resourceType || 'Resource');
    (groups[type] ||= []).push(entry.resource);
    return groups;
  }, {});

  return (
    <section className="border-y border-slate-200 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Previous Eval Data
        </h2>
        <button
          type="button"
          className={buttonClass}
          disabled={loading || disabled || submitting}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh seed jobs
        </button>
      </div>
      {loading && (
        <p role="status" className="mt-3 text-sm text-slate-500">
          Loading seed history...
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {!loading && !error && !items.length && (
        <p className="mt-3 text-sm text-slate-500">
          No previous seed jobs for this persona.
        </p>
      )}
      {!loading && items.length > 0 && (
        <>
          <label className="mt-3 block text-xs font-medium text-slate-700">
            Seed job
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm"
              value={selectedId}
              disabled={disabled || submitting}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {items.map(({ scenario, job }) => (
                <option key={job.seedJobId} value={job.seedJobId}>
                  {scenario.scenarioName} · {job.seedStatus} ·{' '}
                  {job.createdAt
                    ? new Date(job.createdAt).toLocaleString()
                    : 'Date unavailable'}{' '}
                  · {job.seedJobId}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="mt-3 space-y-3">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Seed job ID</dt>
                  <dd className="break-all font-mono">
                    {selected.job.seedJobId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Evaluation tenant</dt>
                  <dd className="break-all font-mono">
                    {selected.job.evalTenantId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd>{selected.job.seedStatus}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Patients</dt>
                  <dd>
                    {selected.job.patientCount ??
                      selected.job.seededCounts?.Patient ??
                      'Not available'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Updated</dt>
                  <dd>
                    {selected.job.updatedAt
                      ? new Date(selected.job.updatedAt).toLocaleString()
                      : 'Not available'}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selected.job.seededCounts || {}).map(
                  ([type, count]) => (
                    <span
                      key={type}
                      className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {type}: <b>{count}</b>
                    </span>
                  ),
                )}
              </div>
              {selected.job.errorMessage && (
                <p role="alert" className="text-sm text-rose-700">
                  {selected.job.errorMessage}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    disabled ||
                    submitting ||
                    selected.job.seedStatus !== 'COMPLETED'
                  }
                  onClick={() => void browsePatients(selected.job)}
                >
                  Browse Patients
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={
                    disabled ||
                    submitting ||
                    alreadyEvaluated ||
                    Boolean(error) ||
                    selected.job.seedStatus !== 'COMPLETED'
                  }
                  onClick={() => void submit()}
                >
                  {submitting
                    ? 'Submitting...'
                    : alreadyEvaluated
                      ? 'Already evaluated'
                      : 'Submit Eval'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {browseJob && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Seeded patient data"
            className="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Seeded patient data</h2>
                <p className="break-all font-mono text-xs text-slate-500">
                  {browseJob.seedJobId}
                </p>
              </div>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  requestId.current += 1;
                  setBrowseJob(null);
                }}
              >
                Close
              </button>
            </header>
            <div className="overflow-y-auto p-4">
              {patientId && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      requestId.current += 1;
                      setPatientId('');
                      setBundle(null);
                      setBrowseError(null);
                      setBrowseLoading(false);
                    }}
                  >
                    Back to Patient List
                  </button>
                  <span className="break-all font-mono text-xs">
                    {patientId}
                  </span>
                </div>
              )}
              {browseLoading && <p role="status">Loading patient data...</p>}
              {browseError && (
                <div role="alert" className="text-sm text-rose-700">
                  {browseError}
                  <button
                    type="button"
                    className={`${buttonClass} ml-2`}
                    onClick={() =>
                      void (patientId
                        ? viewPatient(patientId)
                        : browsePatients(browseJob))
                    }
                  >
                    Retry
                  </button>
                </div>
              )}
              {!patientId && !browseLoading && !browseError && (
                <ul className="divide-y divide-slate-100">
                  {patientIds.map((id, index) => (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0 break-all font-mono text-xs">
                        {index + 1}. {id}
                      </span>
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={`View patient ${id}`}
                        onClick={() => void viewPatient(id)}
                      >
                        View
                      </button>
                    </li>
                  ))}
                  {!patientIds.length && (
                    <li className="text-sm text-slate-500">
                      No seeded patients.
                    </li>
                  )}
                </ul>
              )}
              {bundle && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {bundle.total ?? bundle.entry?.length ?? 0} resources
                  </p>
                  {Object.entries(grouped).map(([type, resources]) => (
                    <details
                      key={type}
                      open={type === 'Patient'}
                      className="border-b border-slate-200 pb-3"
                    >
                      <summary className="cursor-pointer text-sm font-semibold">
                        {type} ({resources.length})
                      </summary>
                      {resources.map((resource, index) => (
                        <pre
                          key={index}
                          className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs"
                        >
                          {JSON.stringify(resource, null, 2)}
                        </pre>
                      ))}
                    </details>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default PreviousEvalData;
