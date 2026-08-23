import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useSSESubscription,
  FHIREventNotification,
} from '../hooks/useSSESubscription';
import { NotificationContainer } from '../components/common/NotificationToast';
import { agentMissionService } from '../services/agentMissionService';
import { useGetResourceByIdQuery } from '../services/fhir/client';
import { AgentInterventionRequest, MissionExecutionResult } from '../types/agent';
import { CarePlan } from 'fhir/r5';

const PERSONA_ID = 'diabetic-care-assessment-manager';
const DEFAULT_GOAL =
  'Find every diabetic patient age 45+ missing an HbA1c in the last 6 months, draft care-gap notes and recommendations, and get sign-off.';
const DELEGATED_BY_STORAGE_KEY = 'careCoordinatorDelegatedBy';

const isCancellableStatus = (status: MissionExecutionResult['status']) =>
  status === 'PENDING' ||
  status === 'RUNNING' ||
  status === 'AWAITING_INTERVENTION';

const statusColor = (status: MissionExecutionResult['status']) => {
  switch (status) {
    case 'COMPLETED':
      return 'text-green-700 bg-green-50 border-green-200';
    case 'FAILED':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'RUNNING':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'AWAITING_INTERVENTION':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200';
  }
};

// Resolves a generated CarePlan's owning patient so we can deep-link into the
// existing patient-scoped CarePlan CRUD page for review/update.
const CarePlanReviewRow: React.FC<{ carePlanId: string; label?: string }> = ({
  carePlanId,
  label,
}) => {
  const { data: carePlanResource, isLoading } = useGetResourceByIdQuery(
    { resourceType: 'CarePlan', id: carePlanId },
    { skip: !carePlanId },
  );
  const carePlan = carePlanResource as CarePlan | undefined;

  const patientId = carePlan?.subject?.reference?.split('/').pop();

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-gray-800">
          {label || carePlan?.title || `CarePlan/${carePlanId}`}
        </p>
        <p className="text-xs text-gray-400 font-mono">{carePlanId}</p>
      </div>
      {isLoading ? (
        <span className="text-xs text-gray-400">Resolving…</span>
      ) : patientId ? (
        <Link
          to={`/patient/${patientId}/careplan/crud/${carePlanId}`}
          className="text-sm font-semibold text-amber-600 hover:text-amber-800"
        >
          Review / Update →
        </Link>
      ) : (
        <span className="text-xs text-red-500">Unable to resolve patient</span>
      )}
    </div>
  );
};

const riskClassColor = (riskClass: string) => {
  switch (riskClass) {
    case 'HIGH':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'MEDIUM':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// Full detail view of an AgentInterventionRequest (per the documented
// GET /api/agent/AgentInterventionRequest?status=PENDING contract) with
// inline approve/reject/etc. actions that PATCH a decision to resolve it.
const InterventionRequestRow: React.FC<{
  intervention: AgentInterventionRequest;
  onResolve: (intervention: AgentInterventionRequest, decision: string) => void;
  resolving: boolean;
}> = ({ intervention, onResolve, resolving }) => {
  const steps = intervention.context?.proposedPlan?.steps;

  return (
    <div className="px-4 py-4 border-b border-amber-100 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">
            {intervention.question}
          </p>
          <p className="text-xs text-gray-400 font-mono mt-1">
            {intervention.id} · mission {intervention.missionId}
          </p>
          {intervention.context?.hitlTriggerReason && (
            <p className="text-xs text-gray-500 mt-1">
              {intervention.context.hitlTriggerReason}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="px-2 py-1 text-xs font-semibold rounded-full border text-amber-700 bg-amber-50 border-amber-200">
            {intervention.type}
          </span>
          {intervention.assignee && (
            <span className="text-xs text-gray-500">
              Assigned to {intervention.assignee}
            </span>
          )}
          {intervention.expiresAt && (
            <span className="text-xs text-gray-400">
              Expires {new Date(intervention.expiresAt).toLocaleString()}
              {intervention.timeoutAction &&
                ` (${intervention.timeoutAction} on timeout)`}
            </span>
          )}
        </div>
      </div>

      {steps && steps.length > 0 && (
        <ol className="mt-3 space-y-1.5 list-decimal list-inside">
          {steps.map((step, idx) => (
            <li key={idx} className="text-sm text-gray-700">
              {step.description}{' '}
              <span
                className={`ml-1 px-1.5 py-0.5 text-xs font-semibold rounded-full border ${riskClassColor(
                  step.riskClass,
                )}`}
              >
                {step.riskClass}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {intervention.options.map((option) => (
          <button
            key={option}
            onClick={() => onResolve(intervention, option)}
            disabled={resolving}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            {resolving ? 'Submitting…' : option}
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
  const [missions, setMissions] = useState<MissionExecutionResult[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshingMissionId, setRefreshingMissionId] = useState<
    string | null
  >(null);
  const [cancellingMissionId, setCancellingMissionId] = useState<
    string | null
  >(null);
  const [interventions, setInterventions] = useState<
    AgentInterventionRequest[]
  >([]);
  const [resolvingInterventionId, setResolvingInterventionId] = useState<
    string | null
  >(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [carePlanEvents, setCarePlanEvents] = useState<
    FHIREventNotification[]
  >([]);

  const upsertEvent = (
    prev: FHIREventNotification[],
    event: FHIREventNotification,
  ) => [event, ...prev.filter((e) => e.resourceId !== event.resourceId)];

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

  const upsertMission = (
    prev: MissionExecutionResult[],
    mission: MissionExecutionResult,
  ) => [mission, ...prev.filter((m) => m.missionId !== mission.missionId)];

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
        setMissions((prev) => upsertMission(prev, mission));
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
      setInterventions((prev) =>
        prev.filter((i) => i.id !== intervention.id),
      );
      pollMissionUntilUnblocked(intervention.missionId);
    } catch (err: any) {
      setResolveError(err?.message || 'Failed to resolve intervention.');
    } finally {
      setResolvingInterventionId(null);
    }
  };

  // Load missions already known to the backend for this persona (e.g. ones
  // kicked off via the background/curl flow) and any interventions already
  // pending sign-off, so a fresh page load isn't starting from empty state.
  useEffect(() => {
    agentMissionService
      .getMissionsByPersona(PERSONA_ID)
      .then((loaded) =>
        setMissions((prev) => {
          let next = prev;
          for (const mission of loaded) next = upsertMission(next, mission);
          return next;
        }),
      )
      .catch(() => {
        // Non-fatal — the coordinator can still submit new missions.
      });

    refreshInterventions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backend does not yet emit an SSE event when an AgentInterventionRequest
  // is created (confirmed live — the SSE topic connects fine but no event
  // arrives), so a care coordinator with the page already open would
  // otherwise never see a new pending intervention without reloading. Poll
  // as a fallback until that's fixed server-side; the SSE listener above
  // stays wired too and will take over instantly once it starts firing.
  useEffect(() => {
    const intervalId = setInterval(refreshInterventions, 20000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isConnected, events, error, connect, disconnect } =
    useSSESubscription({
      topics: ['AgentInterventionRequest', 'CarePlan'],
      actions: ['create', 'update'],
      autoConnect: true,
      onEvent: (event) => {
        if (event.resourceType === 'AgentInterventionRequest') {
          refreshInterventions();
        } else if (event.resourceType === 'CarePlan') {
          setCarePlanEvents((prev) => upsertEvent(prev, event));
        }
      },
    });

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
      setMissions((prev) => upsertMission(prev, mission));
      setSelectedMissionId(mission.missionId);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit mission.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshMission = async (missionId: string) => {
    setRefreshingMissionId(missionId);
    try {
      const mission = await agentMissionService.getMissionStatus(missionId);
      setMissions((prev) => upsertMission(prev, mission));
    } catch {
      // Leave the last-known status in place on failure.
    } finally {
      setRefreshingMissionId(null);
    }
  };

  const handleCancelMission = async (missionId: string) => {
    setCancellingMissionId(missionId);
    try {
      await agentMissionService.cancelMission(missionId);
      await handleRefreshMission(missionId);
    } catch {
      // Leave the last-known status in place on failure.
    } finally {
      setCancellingMissionId(null);
    }
  };

  const selectedMission = missions.find(
    (m) => m.missionId === selectedMissionId,
  );
  const generatedCarePlans =
    selectedMission?.outputs?.sources?.filter(
      (s) => s.resourceType === 'CarePlan',
    ) || [];

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <NotificationContainer events={events} />

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Care Coordinator
        </h1>
        <p className="text-gray-600">
          Submit diabetic care assessment missions, track progress, and
          review generated care plans.
        </p>
      </div>

      {/* SSE connection status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className={`h-3 w-3 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="text-sm font-medium">
            {isConnected ? 'Live notifications connected' : 'Disconnected'}
          </span>
          {error && <span className="text-xs text-red-600">({error})</span>}
        </div>
        {isConnected ? (
          <button
            onClick={disconnect}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition"
          >
            Connect
          </button>
        )}
      </div>

      {/* Pending interventions — AgentInterventionRequest awaiting human review */}
      {interventions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-amber-300 mb-6">
          <div className="px-6 py-4 border-b border-amber-100">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Interventions
            </h2>
            <p className="text-xs text-gray-500">
              The agent is asking a care coordinator to review or act before
              continuing.
            </p>
            {resolveError && (
              <p className="text-xs text-red-600 mt-1">{resolveError}</p>
            )}
          </div>
          <div className="divide-y divide-amber-100">
            {interventions.map((intervention) => (
              <InterventionRequestRow
                key={intervention.id}
                intervention={intervention}
                onResolve={handleResolveIntervention}
                resolving={resolvingInterventionId === intervention.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Submit mission */}
      <form
        onSubmit={handleSubmitMission}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Run Diabetic Care Assessment
        </h2>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 text-sm mb-3"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Delegated by <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={delegatedBy}
          onChange={(e) => setDelegatedBy(e.target.value)}
          placeholder="Practitioner or system delegating this mission"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 text-sm mb-3"
        />
        {submitError && (
          <p className="text-sm text-red-600 mb-3">{submitError}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 font-medium text-sm transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit Mission'}
        </button>
      </form>

      {/* Mission history */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Missions</h2>
        </div>
        {missions.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">
            No missions submitted yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {missions.map((mission) => (
              <div
                key={mission.missionId}
                className={`flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors ${
                  selectedMissionId === mission.missionId ? 'bg-amber-50' : ''
                }`}
              >
                <button
                  onClick={() => setSelectedMissionId(mission.missionId)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-medium text-gray-800 font-mono">
                    {mission.missionId}
                  </p>
                  <p className="text-xs text-gray-500">{mission.goal}</p>
                </button>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusColor(
                      mission.status,
                    )}`}
                  >
                    {mission.status}
                  </span>
                  {isCancellableStatus(mission.status) && (
                    <button
                      onClick={() => handleCancelMission(mission.missionId)}
                      disabled={cancellingMissionId === mission.missionId}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {cancellingMissionId === mission.missionId
                        ? 'Cancelling…'
                        : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generated care plans — live, driven by CarePlan SSE events */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Generated Care Plans
          </h2>
        </div>
        {carePlanEvents.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">
            No care plans generated yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {carePlanEvents.map((event) => (
              <CarePlanReviewRow
                key={event.resourceId}
                carePlanId={event.resourceId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected mission detail */}
      {selectedMission && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Mission Detail
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleRefreshMission(selectedMission.missionId)}
                disabled={refreshingMissionId === selectedMission.missionId}
                className="text-xs font-semibold text-amber-600 hover:text-amber-800 disabled:opacity-50"
              >
                {refreshingMissionId === selectedMission.missionId
                  ? 'Refreshing…'
                  : 'Refresh'}
              </button>
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusColor(
                  selectedMission.status,
                )}`}
              >
                {selectedMission.status}
              </span>
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            {selectedMission.outputs?.response && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {selectedMission.outputs.response}
              </p>
            )}
            {selectedMission.failureReason && (
              <p className="text-sm text-red-600">
                {selectedMission.failureReason}
              </p>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Generated Care Plans
              </h3>
              {generatedCarePlans.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {selectedMission.status === 'COMPLETED'
                    ? 'No care plans were generated by this mission.'
                    : 'Care plans will appear here once the mission completes.'}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default CareCoordinatorPage;
