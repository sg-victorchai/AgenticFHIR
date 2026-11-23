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
import { expectedWriteTypesFromBundle } from './ScenarioScoringEditor';
import {
  parseQualityDimensions,
  QualityDimensionsView,
  ReplayTraceView,
} from './EvalRunInsights';

type HitlOverride = {
  strategy: 'APPROVE' | 'REJECT' | 'REFINE';
  refineInstruction?: string;
  applyToCount?: number;
};

interface PreviousSeed {
  scenario: ScenarioSummary;
  job: SeedStatus;
}

const CreatedResourceDetails: React.FC<{
  runId: string;
  resource: { resourceType: string; resourceId: string; operation: string };
}> = ({ runId, resource }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResource, setRawResource] = useState<Record<
    string,
    unknown
  > | null>(null);

  const viewResource = async () => {
    setOpen(true);
    if (rawResource) return;
    setLoading(true);
    setError(null);
    try {
      setRawResource(
        await agentBuilderService.getCreatedEvalResource(
          runId,
          resource.resourceType,
          resource.resourceId,
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to load the raw resource JSON.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="break-all">
      <span className="font-semibold">{resource.resourceType}</span> ·{' '}
      {resource.operation} ·{' '}
      <span className="font-mono">{resource.resourceId}</span>{' '}
      <button
        type="button"
        className="ml-1 font-semibold text-cyan-800 underline underline-offset-2"
        onClick={() => void viewResource()}
      >
        View
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${resource.resourceType} raw FHIR resource`}
            className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">
                  {resource.resourceType}
                </h3>
                <p className="break-all font-mono text-[11px] text-slate-500">
                  {resource.resourceId}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {loading && <p role="status">Loading resource…</p>}
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              {rawResource && (
                <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
                  {JSON.stringify(rawResource, null, 2)}
                </pre>
              )}
            </div>
          </aside>
        </div>
      )}
    </li>
  );
};

const GOLD_RESOURCE_TYPES = [
  'CarePlan',
  'MedicationRequest',
  'ServiceRequest',
  'Observation',
  'Condition',
  'DiagnosticReport',
  'Procedure',
  'Encounter',
  'AllergyIntolerance',
];

const ExpectedWritesEditor: React.FC<{
  scenario: ScenarioDetail;
  onUpdated: (scenario: ScenarioDetail) => void;
}> = ({ scenario, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const types = expectedWriteTypesFromBundle(scenario.expectedWrites);

  const startEditing = () => {
    setSelectedTypes(types);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const uniqueTypes = [...new Set(selectedTypes)];
      const updated = await agentBuilderService.patchScenario(
        scenario.scenarioId,
        {
          expectedWrites: uniqueTypes.length
            ? {
                resourceType: 'Bundle',
                type: 'collection',
                entry: uniqueTypes.map((resourceType) => ({
                  resource: { resourceType },
                })),
              }
            : null,
        },
      );
      onUpdated(updated);
      setEditing(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to update the gold bundle.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold">
            Expected writes (gold bundle)
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            {types.length
              ? `Data Accuracy checks for at least one ${types.join(', ')} resource.`
              : 'Not set. Data Accuracy will be neutral until expected writes are defined.'}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            onClick={startEditing}
          >
            {types.length ? 'Edit' : 'Set expected writes'}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {GOLD_RESOURCE_TYPES.map((resourceType) => (
              <label
                key={resourceType}
                className="flex items-center gap-2 text-xs text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(resourceType)}
                  onChange={(event) =>
                    setSelectedTypes((current) =>
                      event.target.checked
                        ? [...current, resourceType]
                        : current.filter((type) => type !== resourceType),
                    )
                  }
                />
                {resourceType}
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-slate-200 px-3 py-1.5 text-xs"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save expected writes'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

const PreviousEvalData: React.FC<{
  personaId: string;
  personaVersion?: string;
  tenantId?: string;
  currentSystemPrompt?: string;
  canWrite?: boolean;
  onScenarioUpdated?: (scenario: ScenarioDetail) => void;
  refreshKey: string;
  disabled: boolean;
  submittedTenantId?: string;
  onSubmit: (scenario: ScenarioDetail, job: SeedStatus) => Promise<void>;
  onPromptApplied?: (version: string, systemPrompt: string) => Promise<void>;
}> = ({
  personaId,
  personaVersion = '',
  tenantId = '',
  currentSystemPrompt,
  canWrite = false,
  onScenarioUpdated,
  refreshKey,
  disabled,
  submittedTenantId,
  onSubmit,
  onPromptApplied = async () => undefined,
}) => {
  const [items, setItems] = useState<PreviousSeed[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobRuns, setJobRuns] = useState<EvalRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<EvalRun | null>(null);
  const [createdResources, setCreatedResources] = useState<
    Array<{ resourceType: string; resourceId: string; operation: string }>
  >([]);
  const [goldBundleSaving, setGoldBundleSaving] = useState(false);
  const [goldBundleError, setGoldBundleError] = useState<string | null>(null);
  const [goldBundleSaved, setGoldBundleSaved] = useState(false);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [refineGuidance, setRefineGuidance] = useState('');
  const [refinement, setRefinement] = useState<{
    runId: string;
    suggestedSystemPrompt: string;
    reasoning?: string;
    scores?: Record<string, number | string>;
  } | null>(null);
  const [refining, setRefining] = useState(false);
  const [applyingPrompt, setApplyingPrompt] = useState(false);
  const [comparisonRunIds, setComparisonRunIds] = useState<string[]>([]);
  const [submittingComparison, setSubmittingComparison] = useState(false);
  const [rerunStrategy, setRerunStrategy] =
    useState<HitlOverride['strategy']>('APPROVE');
  const [rerunInstruction, setRerunInstruction] = useState('');
  const [rerunCount, setRerunCount] = useState(10);
  const [rerunning, setRerunning] = useState(false);
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
  }, [selectedId, refreshKey]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void agentBuilderService.getScenario(selected.scenario.scenarioId).then(
      (scenario) => {
        if (active) setScenarioDetail(scenario);
      },
      () => {
        if (active) setScenarioDetail(null);
      },
    );
    return () => {
      active = false;
    };
  }, [selected?.scenario.scenarioId]);

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
    setRefinement(null);
    setCreatedResources([]);
    setGoldBundleError(null);
    setGoldBundleSaved(false);
    try {
      const detail = await agentBuilderService.getEval(run.runId);
      setRunDetail(detail);
      try {
        const resources = await agentBuilderService.getCreatedEvalResources(
          run.runId,
        );
        setCreatedResources(resources?.createdResources ?? []);
      } catch {
        setCreatedResources([]);
      }
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

  const setGoldBundleFromRun = async () => {
    if (!selected || !createdResources.length) return;
    const resourceTypes = [
      ...new Set(
        createdResources
          .map((resource) => resource.resourceType)
          .filter((resourceType) => resourceType && resourceType !== 'Bundle'),
      ),
    ];
    if (!resourceTypes.length) return;
    setGoldBundleSaving(true);
    setGoldBundleError(null);
    try {
      const updated = await agentBuilderService.patchScenario(
        selected.scenario.scenarioId,
        {
          expectedWrites: {
            resourceType: 'Bundle',
            type: 'collection',
            entry: resourceTypes.map((resourceType) => ({
              resource: { resourceType },
            })),
          },
        },
      );
      setScenarioDetail(updated);
      setGoldBundleSaved(true);
    } catch (failure) {
      setGoldBundleError(
        failure instanceof Error
          ? failure.message
          : 'Unable to set the expected-writes gold bundle.',
      );
    } finally {
      setGoldBundleSaving(false);
    }
  };

  const rerunWithHitl = async (override: HitlOverride) => {
    if (!selected || selected.job.seedStatus !== 'COMPLETED') return;
    setRerunning(true);
    setRunsError(null);
    try {
      const { runId } = await agentBuilderService.submitEval(
        {
          personaId,
          version: personaVersion,
          scenarioId: selected.scenario.scenarioId,
          tenantId,
          evalTenantId: selected.job.evalTenantId,
        },
        override,
      );
      setComparisonRunIds([runId]);
      setJobRuns((previous) => [
        {
          runId,
          personaId,
          personaVersion,
          scenarioId: selected.scenario.scenarioId,
          evalTenantId: selected.job.evalTenantId,
          runStatus: 'PENDING',
          hitlSimStrategy: override.strategy,
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ]);
      setRunDetail(null);
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to re-run the evaluation.',
      );
    } finally {
      setRerunning(false);
    }
  };

  const startHitlComparison = async () => {
    if (!selected || selected.job.seedStatus !== 'COMPLETED') return;
    setSubmittingComparison(true);
    setRunsError(null);
    try {
      const scenario = await agentBuilderService.getScenario(
        selected.scenario.scenarioId,
      );
      if (!scenario.hitlSimConfig)
        throw new Error(
          'This scenario has no HITL simulation settings. Create a revised scenario with the settings enabled.',
        );
      const result = await agentBuilderService.submitHitlComparison({
        personaId,
        version: personaVersion,
        scenarioId: scenario.scenarioId,
        tenantId,
        evalTenantId: selected.job.evalTenantId,
      });
      setComparisonRunIds(result.runIds);
      setJobRuns((previous) => [
        ...result.runIds.map((runId, index) => ({
          runId,
          personaId,
          personaVersion,
          scenarioId: selected.scenario.scenarioId,
          evalTenantId: selected.job.evalTenantId,
          runStatus: 'PENDING',
          hitlSimStrategy: ['APPROVE', 'REJECT', 'REFINE'][index],
          hitlComparisonGroup: result.comparisonGroup,
          createdAt: new Date().toISOString(),
        })),
        ...previous,
      ]);
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to submit HITL comparison.',
      );
    } finally {
      setSubmittingComparison(false);
    }
  };

  useEffect(() => {
    if (!comparisonRunIds.length) return;
    let active = true;
    const poll = async () => {
      try {
        const refreshed = await Promise.all(
          comparisonRunIds.map((runId) => agentBuilderService.getEval(runId)),
        );
        if (!active) return;
        setJobRuns((previous) =>
          previous.map(
            (run) => refreshed.find((item) => item.runId === run.runId) || run,
          ),
        );
        if (
          refreshed.every((run) =>
            ['COMPLETED', 'FAILED'].includes(run.runStatus),
          )
        )
          setComparisonRunIds([]);
      } catch (failure) {
        if (active)
          setRunsError(
            failure instanceof Error
              ? failure.message
              : 'Unable to poll HITL comparison runs.',
          );
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [comparisonRunIds]);

  const refinePromptFromRun = async () => {
    if (!runDetail) return;
    setRefining(true);
    setRunsError(null);
    try {
      const result = await agentBuilderService.refineSystemPrompt(
        personaId,
        runDetail.personaVersion,
        tenantId,
        runDetail.runId,
        refineGuidance,
      );
      setRefinement({ runId: runDetail.runId, ...result });
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to refine the system prompt.',
      );
    } finally {
      setRefining(false);
    }
  };

  const applyRefinedPrompt = async () => {
    if (!refinement) return;
    setApplyingPrompt(true);
    setRunsError(null);
    try {
      await onPromptApplied(
        runDetail?.personaVersion || personaVersion,
        refinement.suggestedSystemPrompt,
      );
      setRefinement(null);
    } catch (failure) {
      setRunsError(
        failure instanceof Error
          ? failure.message
          : 'Unable to apply the refined system prompt.',
      );
    } finally {
      setApplyingPrompt(false);
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
  const comparisonGroups = Array.from(
    new Set(
      jobRuns.flatMap((run) =>
        run.hitlComparisonGroup ? [run.hitlComparisonGroup] : [],
      ),
    ),
  ).map((group) => ({
    group,
    runs: jobRuns.filter((run) => run.hitlComparisonGroup === group),
  }));

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
                  disabled={
                    submittingComparison ||
                    disabled ||
                    !scenarioDetail?.hitlSimConfig ||
                    selected.job.seedStatus !== 'COMPLETED'
                  }
                  title={
                    !scenarioDetail?.hitlSimConfig
                      ? 'Create a revised scenario with HITL settings to enable comparison'
                      : undefined
                  }
                  onClick={() => void startHitlComparison()}
                >
                  {submittingComparison
                    ? 'Submitting comparison…'
                    : 'Compare HITL strategies'}
                </button>
                <details className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Re-run on this data with a HITL response
                  </summary>
                  <p className="mt-2 text-xs text-slate-500">
                    Runs the same scenario against this seeded data with the
                    reviewer response below. The saved scenario is not changed.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-slate-600">
                      Reviewer response
                      <select
                        value={rerunStrategy}
                        onChange={(event) =>
                          setRerunStrategy(
                            event.target.value as HitlOverride['strategy'],
                          )
                        }
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="APPROVE">Approve every plan</option>
                        <option value="REJECT">Reject every plan</option>
                        <option value="REFINE">Ask for refinement</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">
                      Review steps to answer
                      <input
                        type="number"
                        min={1}
                        value={rerunCount}
                        onChange={(event) =>
                          setRerunCount(Number(event.target.value))
                        }
                        className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    {rerunStrategy === 'REFINE' && (
                      <label className="text-xs text-slate-600 sm:col-span-3">
                        Refinement instruction
                        <textarea
                          rows={2}
                          value={rerunInstruction}
                          onChange={(event) =>
                            setRerunInstruction(event.target.value)
                          }
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                        />
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={
                      rerunning ||
                      disabled ||
                      selected.job.seedStatus !== 'COMPLETED' ||
                      rerunCount < 1 ||
                      (rerunStrategy === 'REFINE' && !rerunInstruction.trim())
                    }
                    onClick={() =>
                      void rerunWithHitl({
                        strategy: rerunStrategy,
                        applyToCount: rerunCount,
                        ...(rerunStrategy === 'REFINE'
                          ? { refineInstruction: rerunInstruction.trim() }
                          : {}),
                      })
                    }
                  >
                    {rerunning ? 'Submitting…' : 'Re-run evaluation'}
                  </button>
                </details>
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
                        ['Expected writes', scenarioDetail.expectedWrites],
                        [
                          'Expected query patterns',
                          scenarioDetail.expectedQueryPatterns,
                        ],
                        ['HITL simulation', scenarioDetail.hitlSimConfig],
                        [
                          'HITL strategy gold sets',
                          scenarioDetail.hitlStrategyGoldSets,
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
                  {(canWrite || scenarioDetail.expectedWrites) && (
                    <ExpectedWritesEditor
                      scenario={scenarioDetail}
                      onUpdated={(updated) => {
                        setScenarioDetail(updated);
                        onScenarioUpdated?.(updated);
                      }}
                    />
                  )}
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
                      {comparisonGroups.map(({ group, runs }) => {
                        const completedRuns = runs.filter(
                          (run) =>
                            run.runStatus === 'COMPLETED' &&
                            run.qualityScore !== undefined,
                        );
                        const score = (run?: EvalRun) => {
                          if (run?.qualityScore === undefined) return undefined;
                          return run.qualityScore >= 0 && run.qualityScore <= 1
                            ? run.qualityScore * 100
                            : run.qualityScore;
                        };
                        const best = completedRuns.reduce<EvalRun | null>(
                          (top, run) =>
                            !top || (score(run) ?? -1) > (score(top) ?? -1)
                              ? run
                              : top,
                          null,
                        );
                        const baseline = jobRuns.find(
                          (run) =>
                            !run.hitlComparisonGroup &&
                            run.scenarioId === selected?.scenario.scenarioId,
                        );
                        return (
                          <section key={group} className="bg-cyan-50/60 p-3">
                            <h4 className="text-xs font-semibold text-slate-800">
                              HITL strategy comparison · {group}
                            </h4>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              {(['APPROVE', 'REJECT', 'REFINE'] as const).map(
                                (strategy) => {
                                  const run = runs.find(
                                    (item) => item.hitlSimStrategy === strategy,
                                  );
                                  return (
                                    <div
                                      key={strategy}
                                      className={`rounded border bg-white p-2 text-xs ${run && best?.runId === run.runId ? 'border-emerald-400' : 'border-slate-200'}`}
                                    >
                                      <p className="font-semibold">
                                        {strategy}
                                        {best?.runId === run?.runId
                                          ? ' · Best'
                                          : ''}
                                      </p>
                                      <p className="mt-1 text-slate-600">
                                        {run?.runStatus || 'Waiting'} ·{' '}
                                        {score(run) === undefined
                                          ? '—'
                                          : `${Math.round(score(run)! * 10) / 10}/100`}
                                      </p>
                                      {run && (
                                        <button
                                          type="button"
                                          className="mt-1 font-semibold text-cyan-800 underline"
                                          onClick={() => void viewRun(run)}
                                        >
                                          View run
                                        </button>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                            {baseline && (
                              <p className="mt-2 text-xs text-slate-600">
                                Baseline:{' '}
                                {score(baseline) === undefined
                                  ? baseline.runStatus
                                  : `${Math.round(score(baseline)! * 10) / 10}/100`}
                              </p>
                            )}
                          </section>
                        );
                      })}
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
                                {run.hitlSimStrategy
                                  ? ` · HITL ${run.hitlSimStrategy}`
                                  : ''}
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
                                    className="rounded-lg border border-cyan-700 bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
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
                                  ['Test input', runDetail.testInput],
                                  ['Question', runDetail.simulatedQuestion],
                                  [
                                    'Persona response',
                                    runDetail.personaResponse,
                                  ],
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
                                <QualityDimensionsView
                                  value={runDetail.qualityDimensions}
                                  overallScore={runDetail.qualityScore}
                                />
                                {(() => {
                                  const dimensions = parseQualityDimensions(
                                    runDetail.qualityDimensions,
                                  );
                                  const suspended =
                                    dimensions?.dataAccuracy === 0 &&
                                    /suspended|HITL|plan.review/i.test(
                                      dimensions.dataAccuracyExplanation || '',
                                    );
                                  return suspended &&
                                    selected?.job.seedStatus === 'COMPLETED' ? (
                                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                      <p>
                                        This run stopped at a human plan review,
                                        so no writes were scored.
                                      </p>
                                      <button
                                        type="button"
                                        className="mt-2 rounded bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
                                        disabled={rerunning || disabled}
                                        onClick={() =>
                                          void rerunWithHitl({
                                            strategy: 'APPROVE',
                                          })
                                        }
                                      >
                                        {rerunning
                                          ? 'Submitting…'
                                          : 'Re-run with HITL Approval'}
                                      </button>
                                    </div>
                                  ) : null;
                                })()}
                                <ReplayTraceView
                                  value={runDetail.replayTrace}
                                />
                                <section className="mt-3 rounded border border-slate-200 bg-white p-2">
                                  <h4 className="text-xs font-semibold">
                                    Agent-created resources
                                  </h4>
                                  {!createdResources.length ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      No created resources were reported for
                                      this run.
                                    </p>
                                  ) : (
                                    <ul className="mt-2 space-y-1 text-xs">
                                      {createdResources.map(
                                        (resource, index) => (
                                          <CreatedResourceDetails
                                            key={`${resource.resourceType}:${resource.resourceId}:${index}`}
                                            runId={runDetail.runId}
                                            resource={resource}
                                          />
                                        ),
                                      )}
                                    </ul>
                                  )}
                                  {runDetail.runStatus === 'COMPLETED' &&
                                    createdResources.length > 0 &&
                                    scenarioDetail &&
                                    (goldBundleSaved ? (
                                      <p
                                        role="status"
                                        className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900"
                                      >
                                        Gold bundle set. Future runs will score
                                        Data Accuracy against{' '}
                                        {expectedWriteTypesFromBundle(
                                          scenarioDetail.expectedWrites,
                                        ).join(', ')}{' '}
                                        (one required resource per type).
                                      </p>
                                    ) : !expectedWriteTypesFromBundle(
                                        scenarioDetail.expectedWrites,
                                      ).length ? (
                                      <div className="mt-3 rounded border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
                                        <p className="font-semibold">
                                          No gold bundle is set for this
                                          scenario.
                                        </p>
                                        <p className="mt-1">
                                          Use the unique resource types created
                                          in this run as the expected output.
                                          This enables Data Accuracy scoring on
                                          future runs.
                                        </p>
                                        {goldBundleError && (
                                          <p
                                            role="alert"
                                            className="mt-2 text-rose-700"
                                          >
                                            {goldBundleError}
                                          </p>
                                        )}
                                        <button
                                          type="button"
                                          className="mt-2 rounded bg-cyan-800 px-3 py-2 font-semibold text-white disabled:opacity-50"
                                          disabled={
                                            goldBundleSaving || disabled
                                          }
                                          onClick={() =>
                                            void setGoldBundleFromRun()
                                          }
                                        >
                                          {goldBundleSaving
                                            ? 'Saving…'
                                            : `Set ${[...new Set(createdResources.map((resource) => resource.resourceType))].join(' and ')} as expected output`}
                                        </button>
                                      </div>
                                    ) : null)}
                                </section>
                                {runDetail.runStatus === 'COMPLETED' && (
                                  <section className="mt-3 space-y-2 rounded border border-slate-200 bg-white p-3">
                                    <h4 className="text-xs font-semibold">
                                      Refine system prompt from this run
                                    </h4>
                                    <label className="block text-xs text-slate-600">
                                      Guidance (optional)
                                      <textarea
                                        value={refineGuidance}
                                        onChange={(event) =>
                                          setRefineGuidance(event.target.value)
                                        }
                                        rows={2}
                                        className="mt-1 w-full rounded border border-slate-200 p-2"
                                        placeholder="e.g. Ensure the agent queries Conditions before creating interventions."
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={buttonClass}
                                      disabled={refining || applyingPrompt}
                                      onClick={() => void refinePromptFromRun()}
                                    >
                                      {refining
                                        ? 'Analyzing run…'
                                        : 'Suggest prompt refinement'}
                                    </button>
                                    {refinement?.runId === runDetail.runId && (
                                      <>
                                        {refinement.reasoning && (
                                          <p className="text-xs text-slate-600">
                                            {refinement.reasoning}
                                          </p>
                                        )}
                                        {refinement.scores && (
                                          <p className="text-xs text-slate-600">
                                            Run scores:{' '}
                                            {JSON.stringify(refinement.scores)}
                                          </p>
                                        )}
                                        <div className="grid gap-2 md:grid-cols-2">
                                          <div>
                                            <p className="text-[10px] font-semibold uppercase text-slate-500">
                                              Current prompt
                                            </p>
                                            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-[10px] text-slate-100">
                                              {currentSystemPrompt ||
                                                'No current prompt returned.'}
                                            </pre>
                                          </div>
                                          <div>
                                            <p className="text-[10px] font-semibold uppercase text-slate-500">
                                              Suggested prompt
                                            </p>
                                            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-[10px] text-slate-100">
                                              {refinement.suggestedSystemPrompt}
                                            </pre>
                                          </div>
                                        </div>
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            className="rounded bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                            disabled={applyingPrompt}
                                            onClick={() =>
                                              void applyRefinedPrompt()
                                            }
                                          >
                                            {applyingPrompt
                                              ? 'Applying…'
                                              : 'Apply suggested prompt'}
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </section>
                                )}
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
