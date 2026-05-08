import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Encounter, Bundle, Resource } from 'fhir/r5';
import {
  useGetTodayEncountersQuery,
  useUpdateResourceMutation,
} from '../services/fhir/client';
import { RootState } from '../store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : '—';

const formatDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-SG', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

const SS_KEY_MODE = 'queue-mode';
const SS_KEY_FROM = 'queue-from';
const SS_KEY_TO   = 'queue-to';

const getPatientId = (encounter: Encounter): string => {
  const ref = encounter.subject?.reference;
  return ref ? ref.replace('Patient/', '') : '';
};

const getPatientName = (encounter: Encounter): string =>
  encounter.subject?.display || '(Unknown Patient)';

const getChiefComplaint = (encounter: Encounter): string =>
  (encounter as any)?.reason?.[0]?.value?.[0]?.concept?.text || '—';

const getEncounterClass = (encounter: Encounter): string =>
  encounter.class?.[0]?.coding?.[0]?.display || '—';

type QueueStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';

const PENDING_STATUSES = new Set(['planned', 'arrived', 'waitlist', 'triaged']);
const INPROGRESS_STATUSES = new Set(['in-progress']);
const COMPLETED_STATUSES = new Set(['finished', 'completed', 'discharged']);

const classifyStatus = (status: string): QueueStatus => {
  if (PENDING_STATUSES.has(status)) return 'pending';
  if (INPROGRESS_STATUSES.has(status)) return 'in-progress';
  if (COMPLETED_STATUSES.has(status)) return 'completed';
  return 'cancelled';
};

const STATUS_HEADER_CLS: Record<QueueStatus, string> = {
  pending: 'bg-amber-50 border-amber-200',
  'in-progress': 'bg-blue-50 border-blue-200',
  completed: 'bg-green-50 border-green-200',
  cancelled: 'bg-gray-50 border-gray-200',
};

const STATUS_BADGE_CLS: Record<string, string> = {
  planned: 'bg-amber-100 text-amber-800',
  arrived: 'bg-yellow-100 text-yellow-800',
  waitlist: 'bg-orange-100 text-orange-800',
  triaged: 'bg-orange-100 text-orange-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  finished: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  discharged: 'bg-teal-100 text-teal-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

// ─── Row component ────────────────────────────────────────────────────────────

interface QueueRowProps {
  encounter: Encounter;
  role: 'psa' | 'clinician';
  onStatusUpdate: (id: string, status: string) => void;
  isUpdating: boolean;
  showDate: boolean;
}

const QueueRow: React.FC<QueueRowProps> = ({
  encounter,
  role,
  onStatusUpdate,
  isUpdating,
  showDate,
}) => {
  const patientId = getPatientId(encounter);
  const encounterId = encounter.id!;
  const status = encounter.status;
  const queueStatus = classifyStatus(status);
  const badgeCls = STATUS_BADGE_CLS[status] || 'bg-gray-100 text-gray-600';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-800">
        {getPatientName(encounter)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {getChiefComplaint(encounter)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {showDate ? formatDateTime(encounter.actualPeriod?.start) : formatTime(encounter.actualPeriod?.start)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
        {getEncounterClass(encounter)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls}`}>
          {status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {/* ── Clinician actions ── */}
          {role === 'clinician' && (
            <>
              {queueStatus === 'completed' && (
                <Link
                  to={`/patient/${patientId}/encounter/${encounterId}/notes`}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  View Notes
                </Link>
              )}
              {queueStatus === 'pending' && (
                <Link
                  to={`/patient/${patientId}/encounter/${encounterId}/consult`}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                >
                  Start Consult
                </Link>
              )}
              {queueStatus === 'in-progress' && (
                <Link
                  to={`/patient/${patientId}/encounter/${encounterId}/notes`}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Resume Consult
                </Link>
              )}
            </>
          )}

          {/* ── PSA actions ── */}
          {role === 'psa' && (
            <>
              {queueStatus === 'pending' && (status as string) !== 'arrived' && (
                <button
                  onClick={() => onStatusUpdate(encounterId, 'arrived')}
                  disabled={isUpdating}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  Mark Arrived
                </button>
              )}
              {queueStatus !== 'completed' && queueStatus !== 'cancelled' && (
                <button
                  onClick={() => onStatusUpdate(encounterId, 'cancelled')}
                  disabled={isUpdating}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <Link
                to={`/patient/${patientId}/details`}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors"
              >
                View Patient
              </Link>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── Section ──────────────────────────────────────────────────────────────────

interface QueueSectionProps {
  label: string;
  queueStatus: QueueStatus;
  encounters: Encounter[];
  role: 'psa' | 'clinician';
  onStatusUpdate: (id: string, status: string) => void;
  isUpdating: boolean;
  showDate: boolean;
}

const QueueSection: React.FC<QueueSectionProps> = ({
  label,
  queueStatus,
  encounters,
  role,
  onStatusUpdate,
  isUpdating,
  showDate,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const headerCls = STATUS_HEADER_CLS[queueStatus];

  return (
    <div className="mb-6 border rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={`w-full flex items-center justify-between px-5 py-3 border-b font-semibold text-left ${headerCls}`}
      >
        <span className="flex items-center gap-2">
          {label}
          <span className="text-sm font-normal text-gray-500">
            ({encounters.length})
          </span>
        </span>
        <span className="text-gray-400 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto bg-white">
          {encounters.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-5 py-4">No encounters.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Patient', 'Chief Complaint', showDate ? 'Date & Time' : 'Time', 'Type', 'Status', 'Actions'].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === 'Type' ? 'hidden md:table-cell' : ''}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {encounters.map((enc) => (
                  <QueueRow
                    key={enc.id}
                    encounter={enc}
                    role={role}
                    onStatusUpdate={onStatusUpdate}
                    isUpdating={isUpdating}
                    showDate={showDate}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const PatientQueuePage: React.FC = () => {
  const role = useSelector((state: RootState) => state.ui.role);
  const todayISO = new Date().toISOString().split('T')[0];
  const currentYearMonth = todayISO.slice(0, 7);

  const [mode, setMode] = useState<'today' | 'range'>(
    () => (sessionStorage.getItem(SS_KEY_MODE) as 'today' | 'range') || 'today',
  );
  const [fromMonth, setFromMonth] = useState<string>(
    () => sessionStorage.getItem(SS_KEY_FROM) || currentYearMonth,
  );
  const [toMonth, setToMonth] = useState<string>(
    () => sessionStorage.getItem(SS_KEY_TO) || currentYearMonth,
  );

  const setModeAndSave = (m: 'today' | 'range') => {
    setMode(m);
    sessionStorage.setItem(SS_KEY_MODE, m);
  };
  const setFromMonthAndSave = (v: string) => {
    setFromMonth(v);
    sessionStorage.setItem(SS_KEY_FROM, v);
  };
  const setToMonthAndSave = (v: string) => {
    setToMonth(v);
    sessionStorage.setItem(SS_KEY_TO, v);
  };

  const showDate = mode === 'range';

  // In 'today' mode always query just today; in 'range' mode use month boundaries
  const fromISO = mode === 'today' ? todayISO : `${fromMonth}-01`;
  const toISO = mode === 'today' ? todayISO : (() => {
    const [y, m] = toMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const candidate = `${toMonth}-${String(lastDay).padStart(2, '0')}`;
    return candidate > todayISO ? todayISO : candidate;
  })();

  const { data: bundle, isLoading, error, refetch } = useGetTodayEncountersQuery({ from: fromISO, to: toISO });
  const [updateResource, { isLoading: isUpdating }] = useUpdateResourceMutation();

  const encounters: Encounter[] = (bundle as Bundle<Resource> | undefined)?.entry
    ?.filter((e) => e.resource?.resourceType === 'Encounter')
    .map((e) => e.resource as Encounter) ?? [];

  const pending = encounters.filter((e) => PENDING_STATUSES.has(e.status));
  const inProgress = encounters.filter((e) => INPROGRESS_STATUSES.has(e.status));
  const completed = encounters.filter((e) => COMPLETED_STATUSES.has(e.status));
  const cancelled = encounters.filter((e) => e.status === 'cancelled');

  const handleStatusUpdate = async (encounterId: string, newStatus: string) => {
    const encounter = encounters.find((e) => e.id === encounterId);
    if (!encounter) return;
    await updateResource({
      resourceType: 'Encounter',
      id: encounterId,
      resource: { ...encounter, status: newStatus } as unknown as Encounter,
    });
    refetch();
  };

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
  };
  const todayLabel = new Date(todayISO + 'T00:00:00').toLocaleDateString('en-SG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const rangeLabel = fromMonth === toMonth
    ? formatMonthLabel(fromMonth)
    : `${formatMonthLabel(fromMonth)} – ${formatMonthLabel(toMonth)}`;
  const subtitleLabel = mode === 'today' ? todayLabel : rangeLabel;

  return (
    <div className="container mx-auto px-4 max-w-6xl">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Patient Queue</h1>
            <p className="text-sm text-gray-500 mt-0.5">{subtitleLabel}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {role === 'psa' && (
              <Link
                to="/patients"
                className="inline-flex items-center px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                + Patient Search
              </Link>
            )}
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Today / Date Range toggle */}
        <div className="flex items-center gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <div className="flex rounded-md overflow-hidden border border-gray-200 text-sm font-medium shrink-0">
            <button
              onClick={() => setModeAndSave('today')}
              className={`px-4 py-1.5 transition-colors ${mode === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              Today
            </button>
            <button
              onClick={() => setModeAndSave('range')}
              className={`px-4 py-1.5 transition-colors ${mode === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              Date Range
            </button>
          </div>

          {mode === 'range' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="month"
                  value={fromMonth}
                  max={currentYearMonth}
                  onChange={(e) => {
                    setFromMonthAndSave(e.target.value);
                    if (e.target.value > toMonth) setToMonthAndSave(e.target.value);
                  }}
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="month"
                  value={toMonth}
                  min={fromMonth}
                  max={currentYearMonth}
                  onChange={(e) => setToMonthAndSave(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Pending', count: pending.length, cls: 'bg-amber-100 text-amber-800' },
          { label: 'In Progress', count: inProgress.length, cls: 'bg-blue-100 text-blue-800' },
          { label: 'Completed', count: completed.length, cls: 'bg-green-100 text-green-800' },
          { label: 'Cancelled', count: cancelled.length, cls: 'bg-gray-100 text-gray-600' },
        ].map((s) => (
          <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${s.cls}`}>
            {s.label} <span className="font-bold">{s.count}</span>
          </span>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <p className="ml-3 text-gray-500">Loading encounters…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-5 py-4 mb-6">
          Failed to load encounters. Please refresh.
        </div>
      )}

      {!isLoading && !error && (
        <>
          <QueueSection
            label="Pending"
            queueStatus="pending"
            encounters={pending}
            role={role ?? 'psa'}
            onStatusUpdate={handleStatusUpdate}
            isUpdating={isUpdating}
            showDate={showDate}
          />
          <QueueSection
            label="In Progress"
            queueStatus="in-progress"
            encounters={inProgress}
            role={role ?? 'psa'}
            onStatusUpdate={handleStatusUpdate}
            isUpdating={isUpdating}
            showDate={showDate}
          />
          <QueueSection
            label="Completed"
            queueStatus="completed"
            encounters={completed}
            role={role ?? 'psa'}
            onStatusUpdate={handleStatusUpdate}
            isUpdating={isUpdating}
            showDate={showDate}
          />
          {cancelled.length > 0 && (
            <QueueSection
              label="Cancelled"
              queueStatus="cancelled"
              encounters={cancelled}
              role={role ?? 'psa'}
              onStatusUpdate={handleStatusUpdate}
              isUpdating={isUpdating}
              showDate={showDate}
            />
          )}
        </>
      )}
    </div>
  );
};

export default PatientQueuePage;
