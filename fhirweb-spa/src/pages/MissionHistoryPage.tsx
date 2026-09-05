import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agentMissionService } from '../services/agentMissionService';
import { MissionExecutionResult } from '../types/agent';
import {
  CarePlanReviewRow,
  IconAlertTriangle,
  IconArrowLeft,
  IconClockHistory,
  IconInbox,
  IconRefresh,
  IconSpinner,
  MissionStatusBadge,
  formatDateTime,
  formatRelativeTime,
} from '../components/care-coordinator/missionUi';
import { MissionOutcomeDisplay } from '../components/care-coordinator/MissionOutcomeDisplay';

const PERSONA_ID = 'diabetic-care-assessment-manager';

type FilterKey = 'ALL' | MissionExecutionResult['status'];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'AWAITING_INTERVENTION', label: 'Awaiting Review' },
  { key: 'RUNNING', label: 'Running' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const MissionHistoryPage: React.FC = () => {
  const [missions, setMissions] = useState<MissionExecutionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    null,
  );

  const loadMissions = () => {
    setLoading(true);
    setLoadError(null);
    agentMissionService
      .getMissionsByPersona(PERSONA_ID)
      .then((loaded) => {
        const sorted = [...loaded].sort((a, b) =>
          (b.startedAt || '').localeCompare(a.startedAt || ''),
        );
        setMissions(sorted);
      })
      .catch((err) =>
        setLoadError(err?.message || 'Failed to load mission history.'),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMissions();
  }, []);

  const filteredMissions = useMemo(
    () =>
      filter === 'ALL' ? missions : missions.filter((m) => m.status === filter),
    [missions, filter],
  );

  const selectedMission = missions.find(
    (m) => m.missionId === selectedMissionId,
  );
  const generatedCarePlans =
    selectedMission?.outputs?.sources?.filter(
      (s) => s.resourceType === 'CarePlan',
    ) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
              <IconClockHistory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Mission History
              </h1>
              <p className="text-sm text-gray-500 mt-1 max-w-md">
                Every diabetic care-gap assessment submitted for this persona,
                with its full outcome.
              </p>
            </div>
          </div>
          <Link
            to="/care-coordinator"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            <IconArrowLeft className="h-4 w-4" />
            Back to Care Manager
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Mission list */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                      filter === f.key
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'text-gray-600 bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                onClick={loadMissions}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
              >
                <IconRefresh
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {loadError && (
              <div className="mx-5 mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
                <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {loading ? (
              <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
                <IconSpinner className="h-4 w-4" />
                Loading missions…
              </div>
            ) : filteredMissions.length === 0 ? (
              <div className="py-16 px-6 flex flex-col items-center text-center">
                <div className="h-11 w-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
                  <IconInbox className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-gray-700">
                  No missions found
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {filter === 'ALL'
                    ? 'Nothing has been submitted for this persona yet.'
                    : 'No missions match this filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-y-auto max-h-[70vh]">
                {filteredMissions.map((mission) => (
                  <button
                    key={mission.missionId}
                    onClick={() => setSelectedMissionId(mission.missionId)}
                    className={`w-full text-left px-5 py-3.5 hover:bg-gray-50 transition-colors ${
                      selectedMissionId === mission.missionId
                        ? 'bg-amber-50/70'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <MissionStatusBadge status={mission.status} />
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(
                          mission.completedAt || mission.startedAt,
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {mission.goal}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-1 truncate">
                      {mission.missionId}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mission detail */}
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {!selectedMission ? (
              <div className="h-full py-24 px-6 flex flex-col items-center text-center justify-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
                  <IconClockHistory className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Select a mission
                </h3>
                <p className="text-sm text-gray-500 max-w-xs">
                  Choose one from the list to see its full outcome and generated
                  care plans.
                </p>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h2 className="text-base font-semibold text-gray-900">
                      Mission Detail
                    </h2>
                    <MissionStatusBadge status={selectedMission.status} />
                  </div>
                  <p className="text-sm text-gray-600">
                    {selectedMission.goal}
                  </p>
                  <p className="text-xs text-gray-400 mt-1.5 font-mono">
                    {selectedMission.missionId}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Started {formatDateTime(selectedMission.startedAt)}
                    {selectedMission.completedAt &&
                      ` · Completed ${formatDateTime(selectedMission.completedAt)}`}
                  </p>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {selectedMission.failureReason && (
                    <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                      <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{selectedMission.failureReason}</span>
                    </div>
                  )}

                  {selectedMission.outputs?.response && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                        Outcome
                      </h3>
                      <MissionOutcomeDisplay
                        response={selectedMission.outputs.response}
                      />
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
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
                            source.id ||
                            source.reference?.split('/').pop() ||
                            '';
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionHistoryPage;
