import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { NotificationContainer } from '../components/common/NotificationToast';
import { agentMissionService } from '../services/agentMissionService';
import {
  AgentInterventionRequest,
  MissionExecutionResult,
} from '../types/agent';
import {
  CarePlanReviewRow,
  IconAlertTriangle,
  IconArrowRight,
  IconClipboardList,
  IconClockHistory,
  IconInbox,
  IconRefresh,
  IconSend,
  IconSpinner,
  MissionStatusBadge,
  formatRelativeTime,
  isCancellableStatus,
  riskClassColor,
} from '../components/care-coordinator/missionUi';
import { MissionOutcomeDisplay } from '../components/care-coordinator/MissionOutcomeDisplay';

const PERSONA_ID = 'diabetic-care-assessment-manager';
const DEFAULT_GOAL =
  'Find every diabetic patient age 45+ missing an HbA1c in the last 6 months, draft care-gap notes and recommendations, and get sign-off.';
const DELEGATED_BY_STORAGE_KEY = 'careCoordinatorDelegatedBy';
const ACTIVE_MISSION_STORAGE_KEY = 'careCoordinatorActiveMissionId';

// Inline review card for an AgentInterventionRequest blocking the active
// mission — the plan detail and approve/reject/etc. actions live directly
// inside the Current Mission card rather than a separate global queue.
const InterventionReviewPanel: React.FC<{
  intervention: AgentInterventionRequest;
  onResolve: (intervention: AgentInterventionRequest, decision: string) => void;
  resolving: boolean;
  error: string | null;
}> = ({ intervention, onResolve, resolving, error }) => {
  const steps = intervention.context?.proposedPlan?.steps;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-2.5">
        <IconAlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {intervention.question}
          </p>
          {intervention.context?.hitlTriggerReason && (
            <p className="text-xs text-amber-700/80 mt-1">
              {intervention.context.hitlTriggerReason}
            </p>
          )}
        </div>
      </div>

      {steps && steps.length > 0 && (
        <ol className="mt-3 ml-7 space-y-1.5 list-decimal">
          {steps.map((step, idx) => (
            <li key={idx} className="text-sm text-gray-700">
              {step.description}{' '}
              <span
                className={`ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full border align-middle ${riskClassColor(
                  step.riskClass,
                )}`}
              >
                {step.riskClass}
              </span>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

      <div className="mt-4 ml-7 flex flex-wrap gap-2">
        {intervention.options.map((option) => (
          <button
            key={option}
            onClick={() => onResolve(intervention, option)}
            disabled={resolving}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md border border-amber-300 text-amber-800 bg-white hover:bg-amber-100 disabled:opacity-50 transition-colors capitalize"
          >
            {resolving ? 'Submitting…' : option.replace(/-/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  );
};

const CareCoordinatorPage: React.FC = () => {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [delegatedBy, setDelegatedBy] = useState(
    () => sessionStorage.getItem(DELEGATED_BY_STORAGE_KEY) || '',
  );
  const [activeMission, setActiveMission] =
    useState<MissionExecutionResult | null>(null);
  const [activeMissionLoading, setActiveMissionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [interventions, setInterventions] = useState<
    AgentInterventionRequest[]
  >([]);
  const [resolvingInterventionId, setResolvingInterventionId] = useState<
    string | null
  >(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const persistActiveMission = (mission: MissionExecutionResult) => {
    setActiveMission(mission);
    sessionStorage.setItem(ACTIVE_MISSION_STORAGE_KEY, mission.missionId);
  };

  // SSE only carries a lightweight change notification for
  // AgentInterventionRequest, never its content — the pending list is
  // JPA-authoritative, so any create/update event just triggers a refetch.
  const refreshInterventions = () => {
    agentMissionService
      .getPendingInterventions()
      .then(setInterventions)
      .catch(() => {
        // Non-fatal — the last-known pending list stays visible.
      });
  };

  // Resolving an intervention doesn't unblock the mission synchronously —
  // the backend keeps returning AWAITING_INTERVENTION for ~10-15s while it
  // resumes execution in the background, and there's no SSE event for it —
  // so poll this one mission's status for a bounded window until it moves
  // off AWAITING_INTERVENTION (or we give up and leave the last-known status).
  const pollMissionUntilUnblocked = async (missionId: string) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const mission = await agentMissionService.getMissionStatus(missionId);
        setActiveMission((prev) =>
          prev?.missionId === missionId ? mission : prev,
        );
        if (mission.status !== 'AWAITING_INTERVENTION') return;
      } catch {
        // Transient failure — keep trying until the attempt budget runs out.
      }
    }
  };

  const handleResolveIntervention = async (
    intervention: AgentInterventionRequest,
    decision: string,
  ) => {
    setResolvingInterventionId(intervention.id);
    setResolveError(null);
    try {
      await agentMissionService.resolveIntervention(intervention.id, decision);
      setInterventions((prev) => prev.filter((i) => i.id !== intervention.id));
      pollMissionUntilUnblocked(intervention.missionId);
    } catch (err: any) {
      setResolveError(err?.message || 'Failed to resolve intervention.');
    } finally {
      setResolvingInterventionId(null);
    }
  };

  // Restore whichever mission this browser tab last submitted/tracked, so a
  // reload doesn't lose sight of an in-flight assessment.
  useEffect(() => {
    const persistedId = sessionStorage.getItem(ACTIVE_MISSION_STORAGE_KEY);
    if (persistedId) {
      setActiveMissionLoading(true);
      agentMissionService
        .getMissionStatus(persistedId)
        .then(setActiveMission)
        .catch(() => sessionStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY))
        .finally(() => setActiveMissionLoading(false));
    }

    refreshInterventions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backend does not yet emit an SSE event when an AgentInterventionRequest
  // is created (confirmed live — the SSE topic connects fine but no event
  // arrives), so poll as a fallback until that's fixed server-side; the SSE
  // listener below stays wired too and will take over instantly once it
  // starts firing.
  useEffect(() => {
    const intervalId = setInterval(refreshInterventions, 20000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Not every mission passes through a HITL review — a trivial empty-cohort
  // run can go straight from PENDING to COMPLETED on its own. There's no SSE
  // signal for mission status either, so poll the active mission directly
  // while it's still in flight; this stops itself the moment it leaves
  // PENDING/RUNNING (AWAITING_INTERVENTION is handled by the resolve-time
  // poll instead, since that transition is tied to a user action here).
  useEffect(() => {
    if (
      !activeMission ||
      (activeMission.status !== 'PENDING' && activeMission.status !== 'RUNNING')
    ) {
      return;
    }
    const missionId = activeMission.missionId;
    const intervalId = setInterval(async () => {
      try {
        const mission = await agentMissionService.getMissionStatus(missionId);
        setActiveMission((prev) =>
          prev?.missionId === missionId ? mission : prev,
        );
      } catch {
        // Transient failure — try again next tick.
      }
    }, 5000);
    return () => clearInterval(intervalId);
  }, [activeMission?.missionId, activeMission?.status]);

  const { isConnected, events, disconnect } = useSSESubscription({
    topics: ['AgentInterventionRequest'],
    actions: ['create', 'update'],
    autoConnect: true,
    onEvent: (event) => {
      if (event.resourceType === 'AgentInterventionRequest') {
        refreshInterventions();
      }
    },
  });

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitMission = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedDelegatedBy = delegatedBy.trim();
    if (!trimmedDelegatedBy) {
      setSubmitError(
        'Delegated by is required — this persona rejects missions submitted without a delegator.',
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      sessionStorage.setItem(DELEGATED_BY_STORAGE_KEY, trimmedDelegatedBy);
      const mission = await agentMissionService.submitMission(
        PERSONA_ID,
        goal.trim() || DEFAULT_GOAL,
        trimmedDelegatedBy,
      );
      persistActiveMission(mission);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit mission.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshMission = async () => {
    if (!activeMission) return;
    setRefreshing(true);
    try {
      const mission = await agentMissionService.getMissionStatus(
        activeMission.missionId,
      );
      setActiveMission(mission);
    } catch {
      // Leave the last-known status in place on failure.
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelMission = async () => {
    if (!activeMission) return;
    setCancelling(true);
    try {
      await agentMissionService.cancelMission(activeMission.missionId);
      await handleRefreshMission();
    } catch {
      // Leave the last-known status in place on failure.
    } finally {
      setCancelling(false);
    }
  };

  const activeIntervention = interventions.find(
    (i) => i.missionId === activeMission?.missionId,
  );
  const generatedCarePlans =
    activeMission?.outputs?.sources?.filter(
      (s) => s.resourceType === 'CarePlan',
    ) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <NotificationContainer events={events} />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <IconClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Care Coordinator
              </h1>
              <p className="text-sm text-gray-500 mt-1 max-w-md">
                Submit a diabetic care-gap assessment and track it through to
                sign-off.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border ${
                isConnected
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-gray-500 bg-gray-50 border-gray-200'
              }`}
              title={isConnected ? 'Live updates connected' : 'Reconnecting…'}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              {isConnected ? 'Live' : 'Offline'}
            </span>
            <Link
              to="/care-coordinator/history"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
            >
              <IconClockHistory className="h-4 w-4" />
              Mission History
            </Link>
          </div>
        </div>

        {/* Submit mission */}
        <form
          onSubmit={handleSubmitMission}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
        >
          <h2 className="text-base font-semibold text-gray-900">
            Run a Diabetic Care Assessment
          </h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            The agent finds care gaps, drafts recommendations, and asks you to
            sign off before anything is written back.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Goal
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Delegated by <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={delegatedBy}
                onChange={(e) => setDelegatedBy(e.target.value)}
                placeholder="Practitioner or system delegating this mission"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800"
              />
            </div>
          </div>

          {submitError && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !!(activeMission && (activeMission.status === 'PENDING' || activeMission.status === 'RUNNING'))}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              {submitting ? (
                <IconSpinner className="h-4 w-4" />
              ) : (
                <IconSend className="h-4 w-4" />
              )}
              {submitting ? 'Submitting…' : 'Submit Mission'}
            </button>
            {activeMission && (
              <span className="text-xs text-gray-400">
                Submitting will replace the mission shown below.
              </span>
            )}
          </div>
        </form>

        {/* Active mission */}
        {activeMissionLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-14 flex items-center justify-center gap-2 text-sm text-gray-400">
            <IconSpinner className="h-4 w-4" />
            Loading your last mission…
          </div>
        ) : !activeMission ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 px-6 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
              <IconInbox className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">
              No active mission
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Submit an assessment above and its live status will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h2 className="text-base font-semibold text-gray-900">
                    Current Mission
                  </h2>
                  <MissionStatusBadge status={activeMission.status} />
                </div>
                <p className="text-sm text-gray-600">{activeMission.goal}</p>
                <p className="text-xs text-gray-400 mt-1.5 font-mono">
                  {activeMission.missionId}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Started {formatRelativeTime(activeMission.startedAt)}
                  {activeMission.completedAt &&
                    ` · Completed ${formatRelativeTime(activeMission.completedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRefreshMission}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <IconRefresh
                    className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
                {isCancellableStatus(activeMission.status) && (
                  <button
                    onClick={handleCancelMission}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {activeMission.status === 'AWAITING_INTERVENTION' &&
                (activeIntervention ? (
                  <InterventionReviewPanel
                    intervention={activeIntervention}
                    onResolve={handleResolveIntervention}
                    resolving={
                      resolvingInterventionId === activeIntervention.id
                    }
                    error={resolveError}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                    <IconSpinner className="h-4 w-4" />
                    Waiting for the review request to load…
                  </div>
                ))}

              {(activeMission.status === 'PENDING' ||
                activeMission.status === 'RUNNING') && (
                <div className="flex items-center gap-3 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                  <IconSpinner className="h-4 w-4" />
                  {activeMission.status === 'PENDING'
                    ? 'Queued — the agent will pick this up shortly.'
                    : 'The agent is working through this assessment…'}
                </div>
              )}

              {activeMission.status === 'FAILED' &&
                activeMission.failureReason && (
                  <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                    <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{activeMission.failureReason}</span>
                  </div>
                )}

              {activeMission.outputs?.response && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Outcome
                  </h3>
                  <MissionOutcomeDisplay
                    response={activeMission.outputs.response}
                  />
                </div>
              )}

              {activeMission.status === 'COMPLETED' && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Generated Care Plans
                  </h3>
                  {generatedCarePlans.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No care plans were generated by this mission.
                    </p>
                  ) : (
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      {generatedCarePlans.map((source, idx) => {
                        const carePlanId =
                          source.id || source.reference?.split('/').pop() || '';
                        return (
                          <CarePlanReviewRow
                            key={carePlanId || idx}
                            carePlanId={carePlanId}
                            label={source.display}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <Link
                to="/care-coordinator/history"
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                View all missions
                <IconArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CareCoordinatorPage;
