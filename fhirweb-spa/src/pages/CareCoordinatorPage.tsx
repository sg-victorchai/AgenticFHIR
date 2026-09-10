import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { NotificationContainer } from '../components/common/NotificationToast';
import { agentMissionService } from '../services/agentMissionService';
import { useFHIR } from '../contexts/FHIRContext';
import {
  AgentInterventionRequest,
  MissionExecutionResult,
  CarePlanCreated,
  PersonaParametersResponse,
  PersonaParameter,
  RequiredContextKey,
} from '../types/agent';
import {
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
import { CarePlanInterventionDisplay } from '../components/care-coordinator/CarePlanInterventionDisplay';
import { CarePlanModal } from '../components/care-coordinator/CarePlanModal';

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
  onResolve: (
    intervention: AgentInterventionRequest,
    decision: string,
    notes?: string,
  ) => void;
  resolving: boolean;
  error: string | null;
  onSelectCarePlan?: (carePlan: CarePlanCreated) => void;
}> = ({ intervention, onResolve, resolving, error, onSelectCarePlan }) => {
  const [requestChangesNotes, setRequestChangesNotes] = useState<string>('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const steps = intervention.context?.proposedPlan?.steps;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-2.5">
        <IconAlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {intervention.question.toLowerCase().includes('careplan') ? (
            <CarePlanInterventionDisplay
              message={intervention.question}
              onSelectCarePlan={onSelectCarePlan}
            />
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900">
                {intervention.question}
              </p>
              {intervention.context?.hitlTriggerReason && (
                <p className="text-xs text-amber-700/80 mt-1">
                  {intervention.context.hitlTriggerReason}
                </p>
              )}
            </>
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

      {selectedOption === 'request-changes' && (
        <div className="mt-3 ml-7 space-y-2">
          <label className="block text-xs font-semibold text-gray-700">
            Describe the changes needed
          </label>
          <textarea
            value={requestChangesNotes}
            onChange={(e) => setRequestChangesNotes(e.target.value)}
            placeholder="e.g., Please add a step to verify patient consent before drafting CarePlans"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-amber-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
          />
        </div>
      )}

      <div className="mt-4 ml-7 flex flex-wrap gap-2">
        {intervention.options.map((option) => {
          const isRequestChanges = option === 'request-changes';
          const isSelected = selectedOption === option;
          return isRequestChanges ? (
            <div
              key={option}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <button
                onClick={() => setSelectedOption(isSelected ? null : option)}
                disabled={resolving}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md border transition-colors capitalize ${
                  isSelected
                    ? 'border-amber-400 text-amber-900 bg-amber-100'
                    : 'border-amber-300 text-amber-800 bg-white hover:bg-amber-100'
                } disabled:opacity-50`}
              >
                {resolving ? 'Submitting…' : 'Request Changes'}
              </button>
              {isSelected && (
                <button
                  onClick={() => {
                    if (requestChangesNotes.trim()) {
                      onResolve(intervention, option, requestChangesNotes);
                    }
                  }}
                  disabled={resolving || !requestChangesNotes.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-md border border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  {resolving ? 'Submitting…' : 'Submit Changes'}
                </button>
              )}
            </div>
          ) : (
            <button
              key={option}
              onClick={() => onResolve(intervention, option)}
              disabled={resolving}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md border border-amber-300 text-amber-800 bg-white hover:bg-amber-100 disabled:opacity-50 transition-colors capitalize"
            >
              {resolving ? 'Submitting…' : option.replace(/-/g, ' ')}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const CareCoordinatorPage: React.FC = () => {
  const [goal, setGoal] = useState('');
  const [delegatedBy, setDelegatedBy] = useState(
    () => sessionStorage.getItem(DELEGATED_BY_STORAGE_KEY) || '',
  );
  const [personaConfig, setPersonaConfig] =
    useState<PersonaParametersResponse | null>(null);
  const [requiredContextValues, setRequiredContextValues] = useState<
    Record<string, any>
  >({});
  const [personaParamValues, setPersonaParamValues] = useState<
    Record<string, any>
  >({});
  const [personaParamsLoading, setPersonaParamsLoading] = useState(true);
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
  const [selectedCarePlan, setSelectedCarePlan] =
    useState<CarePlanCreated | null>(null);
  const [enrichedCarePlans, setEnrichedCarePlans] = useState<CarePlanCreated[]>(
    [],
  );

  const { client: fhirClient } = useFHIR();

  const updateRequiredContextValue = (key: string, value: any) => {
    setRequiredContextValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleDelegatedByChange = (value: string) => {
    setDelegatedBy(value);
    setRequiredContextValues((prev) => ({
      ...prev,
      delegatedBy: value,
    }));
  };

  const normalizeGoalText = (value?: string) =>
    (value || '')
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const buildGoalFromCurrentValues = () => {
    const baseGoal =
      normalizeGoalText(personaConfig?.description) || DEFAULT_GOAL;
    const paramEntries = Object.entries(personaParamValues).filter(
      ([, value]) => value !== '' && value !== null && value !== undefined,
    );

    if (paramEntries.length === 0) {
      return baseGoal;
    }

    const summary = paramEntries
      .map(([key, value]) => {
        const param = personaConfig?.params?.find(
          (candidate) => candidate.id === key,
        );
        const label = param?.label || key;
        const formattedValue =
          typeof value === 'boolean'
            ? value
              ? 'true'
              : 'false'
            : Array.isArray(value)
              ? value.join(', ')
              : String(value);
        return `${label}: ${formattedValue}`;
      })
      .join('; ');

    return `${baseGoal} Current parameters: ${summary}.`;
  };

  const updatePersonaParamValue = (paramId: string, value: any) => {
    setPersonaParamValues((prev) => ({
      ...prev,
      [paramId]: value,
    }));
  };

  const renderRequiredContextField = (key: RequiredContextKey) => {
    const id = key.key;
    const inputValue = requiredContextValues[id] ?? '';

    if (key.type === 'boolean') {
      return (
        <label
          key={id}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5"
        >
          <input
            type="checkbox"
            checked={Boolean(inputValue)}
            onChange={(e) => updateRequiredContextValue(id, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-sm text-gray-700">{key.label || id}</span>
        </label>
      );
    }

    if (key.type === 'number' || key.type === 'integer') {
      return (
        <div key={id}>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {key.label || id}
          </label>
          <input
            type="number"
            step={key.type === 'integer' ? '1' : 'any'}
            value={inputValue}
            onChange={(e) => {
              const nextValue =
                e.target.value === '' ? '' : Number(e.target.value);
              updateRequiredContextValue(id, nextValue);
            }}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800"
          />
        </div>
      );
    }

    return (
      <div key={id}>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {key.label || id}
        </label>
        <input
          type="text"
          value={String(inputValue ?? '')}
          onChange={(e) => updateRequiredContextValue(id, e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800"
        />
      </div>
    );
  };

  const renderPersonaParam = (param: PersonaParameter, index: number) => {
    const baseFieldClass =
      'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800';

    if (param.type === 'location-group') {
      return (
        <div
          key={param.id || index}
          className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            {param.label}
          </div>
          {(param.fields || []).map((field) => (
            <div key={field.id}>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {field.label}
              </label>
              <input
                type="text"
                value={personaParamValues[field.id] ?? field.default ?? ''}
                onChange={(e) =>
                  updatePersonaParamValue(field.id, e.target.value)
                }
                className={baseFieldClass}
              />
            </div>
          ))}
        </div>
      );
    }

    if (param.type === 'boolean') {
      return (
        <label
          key={param.id || index}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5"
        >
          <input
            type="checkbox"
            checked={Boolean(
              personaParamValues[param.id] ?? param.default ?? false,
            )}
            onChange={(e) =>
              updatePersonaParamValue(param.id, e.target.checked)
            }
            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-sm text-gray-700">{param.label}</span>
        </label>
      );
    }

    if (param.type === 'select') {
      return (
        <div key={param.id || index}>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {param.label}
          </label>
          <select
            value={personaParamValues[param.id] ?? param.default ?? ''}
            onChange={(e) => updatePersonaParamValue(param.id, e.target.value)}
            className={baseFieldClass}
          >
            <option value="">Select an option</option>
            {(param.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (param.type === 'integer' || param.type === 'number') {
      return (
        <div key={param.id || index}>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {param.label}
          </label>
          <input
            type="number"
            step={param.type === 'integer' ? '1' : 'any'}
            min={param.min}
            max={param.max}
            value={personaParamValues[param.id] ?? param.default ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              const nextValue = raw === '' ? '' : Number(raw);
              updatePersonaParamValue(param.id, nextValue);
            }}
            className={baseFieldClass}
          />
        </div>
      );
    }

    return (
      <div key={param.id || index}>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {param.label}
        </label>
        <input
          type="text"
          value={personaParamValues[param.id] ?? param.default ?? ''}
          onChange={(e) => updatePersonaParamValue(param.id, e.target.value)}
          className={baseFieldClass}
        />
      </div>
    );
  };

  useEffect(() => {
    setRequiredContextValues((prev) => ({
      ...prev,
      delegatedBy,
    }));
  }, [delegatedBy]);

  const visibleRequiredContext = (personaConfig?.requiredContext || []).filter(
    (contextKey) => contextKey.key !== 'delegatedBy',
  );

  useEffect(() => {
    setGoal(buildGoalFromCurrentValues());
  }, [personaConfig, personaParamValues]);

  useEffect(() => {
    let active = true;

    const loadPersonaParameters = async () => {
      try {
        const config =
          await agentMissionService.getPersonaParameters(PERSONA_ID);
        if (!active) return;
        setPersonaConfig(config);

        const contextDefaults: Record<string, any> = {
          delegatedBy,
        };
        (config.requiredContext || []).forEach((contextKey) => {
          if (contextKey.key && contextKey.key !== 'delegatedBy') {
            contextDefaults[contextKey.key] = '';
          }
        });
        setRequiredContextValues(contextDefaults);

        const defaults: Record<string, any> = {};
        (config.params || []).forEach((param) => {
          if (param.default !== undefined) {
            defaults[param.id] = param.default;
          }
          if (param.type === 'location-group') {
            (param.fields || []).forEach((field) => {
              if (field.default !== undefined) {
                defaults[field.id] = field.default;
              }
            });
          }
        });
        setPersonaParamValues(defaults);
      } catch (error) {
        console.error('Failed to load persona parameters:', error);
      } finally {
        if (active) {
          setPersonaParamsLoading(false);
        }
      }
    };

    loadPersonaParameters();
    return () => {
      active = false;
    };
  }, []);

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
      .then((interventions) => {
        // Enrich interventions with mission data (e.g., createdResourceIds)
        const enriched = interventions.map((intervention) => ({
          ...intervention,
          context: {
            ...intervention.context,
            // Add createdResourceIds from active mission if it matches this intervention
            ...(activeMission?.missionId === intervention.missionId &&
            activeMission?.outputs?.createdResourceIds
              ? {
                  createdResourceIds: activeMission.outputs.createdResourceIds,
                }
              : {}),
          },
        }));
        setInterventions(enriched);
      })
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
    notes?: string,
  ) => {
    setResolvingInterventionId(intervention.id);
    setResolveError(null);
    try {
      await agentMissionService.resolveIntervention(
        intervention.id,
        decision,
        notes,
      );
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

  // Fetch CarePlan details from FHIR to enrich care plan data with patient information
  useEffect(() => {
    if (!fhirClient || !activeMission?.outputs?.createdResourceIds) {
      return;
    }

    const enrichCarePlans = async () => {
      const planIds = (activeMission.outputs?.createdResourceIds || []).map(
        (id) => (id.includes('/') ? id.split('/').pop() || id : id),
      );

      const enriched: CarePlanCreated[] = [];

      for (const planId of planIds) {
        try {
          const carePlan = await fhirClient.read({
            resourceType: 'CarePlan',
            id: planId,
          });

          // Extract patient reference
          const patientRef = carePlan.subject?.reference;
          if (patientRef) {
            const patientId = patientRef.split('/').pop() || '';

            // Fetch Patient resource to get name, gender, MRN, DOB
            try {
              const patient = await fhirClient.read({
                resourceType: 'Patient',
                id: patientId,
              });

              const name =
                patient.name?.[0]?.given?.join(' ') && patient.name[0]?.family
                  ? `${patient.name[0].given.join(' ')} ${patient.name[0].family}`
                  : patient.name?.[0]?.text || '';

              const mrn =
                patient.identifier?.find(
                  (id: any) => id.type?.coding?.[0]?.code === 'MR',
                )?.value || '';

              const gender = patient.gender || '';
              const dob = patient.birthDate || '';

              enriched.push({
                patientId,
                mrn,
                name,
                gender,
                dob,
                carePlanId: planId,
              });
            } catch {
              // If patient fetch fails, use placeholder
              enriched.push({
                patientId,
                mrn: '',
                name: '',
                gender: '',
                dob: '',
                carePlanId: planId,
              });
            }
          } else {
            // No patient reference, use placeholder
            enriched.push({
              patientId: '',
              mrn: '',
              name: '',
              gender: '',
              dob: '',
              carePlanId: planId,
            });
          }
        } catch {
          // If CarePlan fetch fails, use placeholder
          enriched.push({
            patientId: '',
            mrn: '',
            name: '',
            gender: '',
            dob: '',
            carePlanId: planId,
          });
        }
      }

      setEnrichedCarePlans(enriched);
    };

    enrichCarePlans();
  }, [fhirClient, activeMission?.outputs?.createdResourceIds]);

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
      const submissionContext = {
        ...requiredContextValues,
        delegatedBy: trimmedDelegatedBy,
        ...personaParamValues,
      };

      const mission = await agentMissionService.submitMission(
        PERSONA_ID,
        normalizeGoalText(goal) ||
          normalizeGoalText(personaConfig?.description) ||
          DEFAULT_GOAL,
        trimmedDelegatedBy,
        submissionContext,
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

  // Use carePlansCreated if available, enriched from FHIR if available, otherwise create placeholder objects from createdResourceIds
  const generatedCarePlans = activeMission?.outputs?.carePlansCreated
    ? activeMission.outputs.carePlansCreated
    : enrichedCarePlans.length > 0
      ? enrichedCarePlans
      : (activeMission?.outputs?.createdResourceIds || []).map((id) => {
          // Extract just the ID part if it's in the format "CarePlan/id" or "CarePlan/type/id"
          const planId = id.includes('/') ? id.split('/').pop() || id : id;
          return {
            patientId: '',
            mrn: '',
            name: '',
            gender: '',
            dob: '',
            carePlanId: planId,
          };
        });

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
              <h1 className="text-2xl font-bold text-gray-900">Care Manager</h1>
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
                readOnly
                rows={5}
                className="w-full min-h-[120px] px-3.5 pt-2 pb-3 border border-gray-300 rounded-lg shadow-sm bg-gray-50 text-sm leading-7 text-gray-800 resize-none align-top"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Delegated by <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={delegatedBy}
                onChange={(e) => handleDelegatedByChange(e.target.value)}
                placeholder="Practitioner or system delegating this mission"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm text-gray-800"
              />
            </div>

            {personaParamsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <IconSpinner className="h-4 w-4 animate-spin" />
                Loading mission parameters…
              </div>
            ) : (
              <div className="space-y-4">
                {visibleRequiredContext.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                      Mission Context
                    </h3>
                    <div className="space-y-4">
                      {visibleRequiredContext.map((contextKey) =>
                        renderRequiredContextField(contextKey),
                      )}
                    </div>
                  </div>
                )}

                {personaConfig?.params && personaConfig.params.length > 0 ? (
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                      Persona Parameters
                    </h3>
                    <div className="space-y-4">
                      {personaConfig.params.map((param, index) =>
                        renderPersonaParam(param, index),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
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
              disabled={
                submitting ||
                !!(
                  activeMission &&
                  (activeMission.status === 'PENDING' ||
                    activeMission.status === 'RUNNING')
                )
              }
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
                    onSelectCarePlan={setSelectedCarePlan}
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
                    cohortMetrics={activeMission.outputs.cohortMetrics}
                  />
                </div>
              )}

              {(activeMission.status === 'COMPLETED' ||
                activeMission.status === 'AWAITING_INTERVENTION') &&
                generatedCarePlans.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      Generated Care Plans
                    </h3>
                    {generatedCarePlans.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No care plans were generated by this mission.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {generatedCarePlans.map((carePlan, idx) => (
                          <button
                            key={carePlan.carePlanId || idx}
                            onClick={() => setSelectedCarePlan(carePlan)}
                            className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all group"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {carePlan.name && carePlan.name.trim() ? (
                                  <>
                                    <p className="text-xs text-gray-700 font-medium mb-1">
                                      {carePlan.name}
                                    </p>
                                    <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                                      {carePlan.mrn && (
                                        <p>MRN: {carePlan.mrn}</p>
                                      )}
                                      {carePlan.gender && (
                                        <p>Gender: {carePlan.gender}</p>
                                      )}
                                      {carePlan.dob && (
                                        <p>DOB: {carePlan.dob}</p>
                                      )}
                                    </div>
                                    <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors text-sm">
                                      Care Plan
                                    </h4>
                                  </>
                                ) : (
                                  <h4 className="font-medium text-gray-900 text-sm mb-2">
                                    Care Plan
                                  </h4>
                                )}
                                <p className="text-xs text-gray-400 font-mono truncate">
                                  {carePlan.carePlanId}
                                </p>
                              </div>
                              <span className="inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                                View/Edit
                              </span>
                            </div>
                          </button>
                        ))}
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

        {/* Care Plan Modal */}
        {selectedCarePlan && (
          <CarePlanModal
            carePlanId={selectedCarePlan.carePlanId}
            patientName={selectedCarePlan.name}
            onClose={() => setSelectedCarePlan(null)}
          />
        )}
      </div>
    </div>
  );
};

export default CareCoordinatorPage;
