import React, { useEffect, useRef, useState } from 'react';
import {
  agentBuilderService,
  EvalRun,
  ScenarioDetail,
  ScenarioSummary,
  SeedStatus,
  SeededPatientBundle,
} from '../../services/agentBuilderService';
import ConfirmationDialog from '../common/ConfirmationDialog';

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
  const [jobRuns, setJobRuns] = useState<EvalRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<EvalRun | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [reviewedRunIds, setReviewedRunIds] = useState<string[]>([]);
  const [scenarioDetail, setScenarioDetail] = useState<ScenarioDetail | null>(
    null,
  );
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [showTeardownConfirmation, setShowTeardownConfirmation] =
    useState(false);
  const [tearingDown, setTearingDown] = useState(false);
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
    (jobRuns.some((run) => run.evalTenantId === selected.job.evalTenantId) ||
      selected.job.evalTenantId === submittedTenantId),
  );
  const hasReviewedFinishedRun = jobRuns.some(
    (run) =>
      ['COMPLETED', 'FAILED'].includes(run.runStatus) &&
      reviewedRunIds.includes(run.runId),
  );
  const buttonClass =
    'rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const scenarios = await agentBuilderService.listScenarios(personaId);
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

  useEffect(() => {
    if (!selectedId) {
      setJobRuns([]);
      setRunDetail(null);
      return;
    }
    let active = true;
    setRunsLoading(true);
    setRunsError(null);
    setJobRuns([]);
    setRunDetail(null);
    setScenarioDetail(null);
    setScenarioError(null);
    void agentBuilderService
      .listEvalRunsForSeedJob(selectedId)
      .then(
        (runs) => {
          if (active)
            setJobRuns(
              [...runs].sort((first, second) => {
                const timestamp = (run: EvalRun) => {
                  const parsed = Date.parse(
                    run.createdAt || run.startedAt || run.completedAt || '',
                  );
                  return Number.isNaN(parsed) ? 0 : parsed;
                };
                return timestamp(second) - timestamp(first);
              }),
            );
        },
        (failure: unknown) => {
          if (active)
            setRunsError(
              failure instanceof Error
                ? failure.message
                : 'Unable to load runs for this seed job.',
            );
        },
      )
      .finally(() => {
        if (active) setRunsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

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

  const loadScenarioDetails = async () => {
    if (!selected) return;
    setScenarioLoading(true);
    setScenarioError(null);
    try {
      setScenarioDetail(
        await agentBuilderService.getScenario(selected.scenario.scenarioId),
      );
    } catch (failure) {
      setScenarioError(
        failure instanceof Error
          ? failure.message
          : 'Unable to load scenario details.',
      );
    } finally {
      setScenarioLoading(false);
    }
  };

  const viewRun = async (run: EvalRun) => {
    setRunDetailLoading(true);
    setRunsError(null);
    try {
      const detail = await agentBuilderService.getEval(run.runId);
      setRunDetail(detail);
      setReviewedRunIds((previous) =>
        previous.includes(run.runId) ? previous : [...previous, run.runId],
      );
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to load evaluation run details.',
      );
    } finally {
      setRunDetailLoading(false);
    }
  };

  const teardown = async () => {
    if (!selected) return;
    setTearingDown(true);
    setRunsError(null);
    try {
      await agentBuilderService.teardown(selected.job.evalTenantId);
      setItems((previous) =>
        previous.map((item) =>
          item.job.seedJobId === selected.job.seedJobId
            ? { ...item, job: { ...item.job, seedStatus: 'TORN_DOWN' } }
            : item,
        ),
      );
      setRunDetail(null);
      setShowTeardownConfirmation(false);
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to tear down sandbox data.',
      );
    } finally {
      setTearingDown(false);
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
                <button
                  type="button"
                  className={buttonClass}
                  disabled={scenarioLoading}
                  onClick={() => void loadScenarioDetails()}
                >
                  {scenarioLoading
                    ? 'Loading scenario...'
                    : scenarioDetail
                      ? 'Refresh scenario details'
                      : 'View scenario details'}
                </button>
                {selected.job.seedStatus === 'TORN_DOWN' ? (
                  <span className="self-center text-xs font-semibold text-slate-500">
                    Sandbox data removed
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    disabled={tearingDown || !hasReviewedFinishedRun}
                    title={
                      !hasReviewedFinishedRun
                        ? 'View a completed or failed run before tearing down this sandbox'
                        : undefined
                    }
                    onClick={() => setShowTeardownConfirmation(true)}
                  >
                    Tear down sandbox
                  </button>
                )}
              </div>
              {scenarioError && (
                <p role="alert" className="text-xs text-rose-700">
                  {scenarioError}
                </p>
              )}
              {scenarioDetail && (
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold">Scenario definition</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {scenarioDetail.scenarioName} · {scenarioDetail.scenarioId}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ['Seed specification', scenarioDetail.seedSpec],
                        [
                          'Conversation script',
                          scenarioDetail.conversationScript,
                        ],
                        ['Response criteria', scenarioDetail.responseCriteria],
                        [
                          'Expected query patterns',
                          scenarioDetail.expectedQueryPatterns,
                        ],
                      ] as const
                    ).map(([label, content]) => (
                      <details
                        key={label}
                        className="rounded border border-slate-200 bg-white p-2"
                      >
                        <summary className="cursor-pointer text-xs font-medium">
                          {label}
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                          {content == null
                            ? 'Not provided.'
                            : JSON.stringify(content, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                </section>
              )}
              {runsLoading && (
                <p role="status" className="text-xs text-slate-500">
                  Loading runs for this seed job...
                </p>
              )}
              {runsError && (
                <p role="alert" className="text-xs text-rose-700">
                  {runsError}
                </p>
              )}
              {!runsLoading && !runsError && (
                <section className="rounded-lg border border-slate-200">
                  <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">
                    Run History
                  </h3>
                  {!jobRuns.length ? (
                    <p className="px-3 py-3 text-xs text-slate-500">
                      No evaluation runs for this seed job.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {jobRuns.map((run) => {
                        const score =
                          run.qualityScore === undefined
                            ? undefined
                            : Math.round(
                                (run.qualityScore >= 0 && run.qualityScore <= 1
                                  ? run.qualityScore * 100
                                  : run.qualityScore) * 10,
                              ) / 10;
                        const scoreColor =
                          score === undefined
                            ? 'bg-slate-100 text-slate-600'
                            : score >= 90
                              ? 'bg-emerald-100 text-emerald-800'
                              : score >= 60
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800';
                        return (
                          <div
                            key={run.runId}
                            data-testid={`seed-run-row-${run.runId}`}
                            className="px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-slate-600">
                                {new Date(
                                  run.createdAt ||
                                    run.startedAt ||
                                    run.completedAt ||
                                    '',
                                ).toLocaleString()}{' '}
                                · {run.runStatus}
                              </span>
                              <span className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${scoreColor}`}
                                >
                                  {score === undefined ? '—' : `${score}/100`}
                                </span>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-cyan-800 underline"
                                  disabled={runDetailLoading}
                                  aria-expanded={runDetail?.runId === run.runId}
                                  onClick={() => void viewRun(run)}
                                >
                                  {runDetail?.runId === run.runId
                                    ? 'Viewing'
                                    : 'View'}
                                </button>
                              </span>
                            </div>
                            {runDetail?.runId === run.runId && (
                              <section className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50/50 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <h3 className="text-sm font-semibold">
                                      Evaluation run details
                                    </h3>
                                    <p className="break-all font-mono text-[11px] text-slate-500">
                                      {runDetail.runId}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className={buttonClass}
                                    onClick={() => setRunDetail(null)}
                                  >
                                    Close
                                  </button>
                                </div>
                                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                  <div>
                                    <dt className="text-slate-500">Status</dt>
                                    <dd>{runDetail.runStatus}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-slate-500">Score</dt>
                                    <dd>
                                      {runDetail.qualityScore === undefined
                                        ? '—'
                                        : `${Math.round((runDetail.qualityScore >= 0 && runDetail.qualityScore <= 1 ? runDetail.qualityScore * 100 : runDetail.qualityScore) * 10) / 10}/100`}
                                    </dd>
                                  </div>
                                </dl>
                                {[
                                  ['Question', runDetail.simulatedQuestion],
                                  [
                                    'Persona response',
                                    runDetail.personaResponse,
                                  ],
                                  [
                                    'Quality dimensions',
                                    runDetail.qualityDimensions,
                                  ],
                                  ['Replay trace', runDetail.replayTrace],
                                ].map(([label, content]) => (
                                  <details
                                    key={String(label)}
                                    className="mt-2 rounded border border-slate-200 bg-white p-2"
                                  >
                                    <summary className="cursor-pointer text-xs font-medium">
                                      {String(label)}
                                    </summary>
                                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                                      {content == null
                                        ? 'Not provided.'
                                        : typeof content === 'string'
                                          ? content
                                          : JSON.stringify(content, null, 2)}
                                    </pre>
                                  </details>
                                ))}
                              </section>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
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
      {showTeardownConfirmation && selected && (
        <ConfirmationDialog
          title="Tear down sandbox data?"
          message={`This permanently deletes all seeded FHIR data in ${selected.job.evalTenantId}. The seed job will be marked TORN_DOWN. To run this scenario again, create a fresh seed job.`}
          confirmLabel="Tear down sandbox"
          tone="danger"
          busy={tearingDown}
          onCancel={() => {
            if (!tearingDown) setShowTeardownConfirmation(false);
          }}
          onConfirm={teardown}
        />
      )}
    </section>
  );
};

export default PreviousEvalData;
