import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Encounter, Bundle, Resource, Patient } from 'fhir/r5';
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

const resolvePatientName = (encounter: Encounter, patientMap: Map<string, Patient>): string => {
  const p = patientMap.get(getPatientId(encounter));
  if (p) {
    const n = p.name?.[0];
    if (n) return n.text || [n.prefix?.join(' '), n.given?.join(' '), n.family].filter(Boolean).join(' ') || '(Unknown)';
  }
  return encounter.subject?.display || '(Unknown Patient)';
};

const resolvePatientIdentifier = (encounter: Encounter, patientMap: Map<string, Patient>): string => {
  const p = patientMap.get(getPatientId(encounter));
  if (!p?.identifier?.length) return '—';
  const id = p.identifier[0];
  return id.value || '—';
};

const getChiefComplaint = (encounter: Encounter): string =>
  (encounter as any)?.reason?.[0]?.value?.[0]?.concept?.text || '—';

const getEncounterClass = (encounter: Encounter): string =>
  encounter.class?.[0]?.coding?.[0]?.display || '—';

// ─── Location-based stage logic ───────────────────────────────────────────────

type QueueStage = 'awaiting-triage' | 'awaiting-clinician' | 'in-consultation' | 'awaiting-billing' | 'completed' | 'cancelled';

const getLocId = (loc: any): string => loc?.location?.identifier?.value || '';

const getCurrentLocation = (enc: Encounter): any => {
  const locs = (enc.location || []) as any[];
  const active = locs.find((l) => l.status === 'active');
  if (active) return active;
  for (let i = locs.length - 1; i >= 0; i--) {
    if (locs[i].status === 'planned') return locs[i];
  }
  return locs[locs.length - 1] ?? null;
};

const classifyEncounter = (enc: Encounter): QueueStage => {
  if (enc.status === 'cancelled') return 'cancelled';
  if (['completed', 'finished', 'discharged'].includes(enc.status as string)) return 'completed';
  const loc = getCurrentLocation(enc);
  if (!loc) return 'awaiting-triage';
  const id = getLocId(loc);
  if (id === 'triage') return 'awaiting-triage';
  if (id === 'consulting-room') return loc.status === 'active' ? 'in-consultation' : 'awaiting-clinician';
  if (id === 'billing') return 'awaiting-billing';
  return 'awaiting-triage';
};

const STAGE_HEADER_CLS: Record<QueueStage, string> = {
  'awaiting-triage': 'bg-amber-50 border-amber-200',
  'awaiting-clinician': 'bg-yellow-50 border-yellow-200',
  'in-consultation': 'bg-blue-50 border-blue-200',
  'awaiting-billing': 'bg-purple-50 border-purple-200',
  completed: 'bg-green-50 border-green-200',
  cancelled: 'bg-gray-50 border-gray-200',
};

const STAGE_BADGE_CLS: Record<QueueStage, string> = {
  'awaiting-triage': 'bg-amber-100 text-amber-800',
  'awaiting-clinician': 'bg-yellow-100 text-yellow-800',
  'in-consultation': 'bg-blue-100 text-blue-800',
  'awaiting-billing': 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STAGE_LABEL: Record<QueueStage, string> = {
  'awaiting-triage': 'Awaiting Triage',
  'awaiting-clinician': 'Awaiting Clinician',
  'in-consultation': 'In Consultation',
  'awaiting-billing': 'Awaiting Billing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const nowISO = () => new Date().toISOString();

const applyCallPatient = (enc: Encounter): Encounter => {
  const locs = [...((enc.location || []) as any[])];
  const idx = locs.reduceRight((found, l, i) =>
    found === -1 && getLocId(l) === 'consulting-room' && l.status === 'planned' ? i : found, -1);
  if (idx >= 0) locs[idx] = { ...locs[idx], status: 'active', period: { start: nowISO() } };
  return { ...enc, location: locs as any };
};

const applyCompleteConsult = (enc: Encounter): Encounter => {
  const locs = [...((enc.location || []) as any[])];
  const idx = locs.reduceRight((found, l, i) =>
    found === -1 && getLocId(l) === 'consulting-room' && l.status === 'active' ? i : found, -1);
  if (idx >= 0) {
    const existing = locs[idx];
    locs[idx] = { ...existing, status: 'completed', period: { ...(existing.period || {}), end: nowISO() } };
  }
  locs.push({ location: { identifier: { value: 'billing' } }, status: 'planned' });
  return { ...enc, location: locs as any };
};

const applyCollectPayment = (enc: Encounter): Encounter => {
  const locs = [...((enc.location || []) as any[])];
  const idx = locs.reduceRight((found, l, i) =>
    found === -1 && getLocId(l) === 'billing' && l.status === 'planned' ? i : found, -1);
  if (idx >= 0) locs[idx] = { ...locs[idx], status: 'completed', period: { start: nowISO(), end: nowISO() } };
  return { ...enc, status: 'completed', location: locs as any } as Encounter;
};

// ─── Row component ────────────────────────────────────────────────────────────

interface QueueRowProps {
  encounter: Encounter;
  role: 'psa' | 'clinician';
  onEncounterAction: (enc: Encounter, action: 'call-patient' | 'complete-consult' | 'collect-payment' | 'cancel') => void;
  isUpdating: boolean;
  showDate: boolean;
  patientMap: Map<string, Patient>;
}

const QueueRow: React.FC<QueueRowProps> = ({
  encounter,
  role,
  onEncounterAction,
  isUpdating,
  showDate,
  patientMap,
}) => {
  const patientId = getPatientId(encounter);
  const encounterId = encounter.id!;
  const stage = classifyEncounter(encounter);
  const badgeCls = STAGE_BADGE_CLS[stage];

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
        {resolvePatientIdentifier(encounter, patientMap)}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-800">
        {resolvePatientName(encounter, patientMap)}
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
          {STAGE_LABEL[stage]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {/* ── Clinician actions ── */}
          {role === 'clinician' && (
            <>
              {stage === 'awaiting-clinician' && (
                <button
                  onClick={() => onEncounterAction(encounter, 'call-patient')}
                  disabled={isUpdating}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors disabled:opacity-50"
                >
                  Call Patient
                </button>
              )}
              {stage === 'in-consultation' && (
                <>
                  <Link
                    to={`/patient/${patientId}/encounter/${encounterId}/notes`}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Start Consult
                  </Link>
                  <button
                    onClick={() => onEncounterAction(encounter, 'complete-consult')}
                    disabled={isUpdating}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Complete Consult
                  </button>
                </>
              )}
              {stage === 'completed' && (
                <Link
                  to={`/patient/${patientId}/encounter/${encounterId}/notes`}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  View Notes
                </Link>
              )}
            </>
          )}

          {/* ── PSA actions ── */}
          {role === 'psa' && (
            <>
              {stage === 'awaiting-triage' && (
                <Link
                  to={`/patient/${patientId}/encounter/${encounterId}/triage`}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Triage
                </Link>
              )}
              {stage === 'awaiting-billing' && (
                <button
                  onClick={() => onEncounterAction(encounter, 'collect-payment')}
                  disabled={isUpdating}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  Collect Payment
                </button>
              )}
              {stage !== 'completed' && stage !== 'cancelled' && (
                <button
                  onClick={() => onEncounterAction(encounter, 'cancel')}
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
  stage: QueueStage;
  encounters: Encounter[];
  role: 'psa' | 'clinician';
  onEncounterAction: (enc: Encounter, action: 'call-patient' | 'complete-consult' | 'collect-payment' | 'cancel') => void;
  isUpdating: boolean;
  showDate: boolean;
  patientMap: Map<string, Patient>;
}

const QueueSection: React.FC<QueueSectionProps> = ({
  stage,
  encounters,
  role,
  onEncounterAction,
  isUpdating,
  showDate,
  patientMap,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const headerCls = STAGE_HEADER_CLS[stage];
  const label = STAGE_LABEL[stage];

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
                  {['ID', 'Patient', 'Chief Complaint', showDate ? 'Date & Time' : 'Time', 'Type', 'Status', 'Actions'].map(
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
                    onEncounterAction={onEncounterAction}
                    isUpdating={isUpdating}
                    showDate={showDate}
                    patientMap={patientMap}
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

  const fromISO = mode === 'today' ? todayISO : `${fromMonth}-01`;
  const toISO = mode === 'today' ? todayISO : (() => {
    const [y, m] = toMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const candidate = `${toMonth}-${String(lastDay).padStart(2, '0')}`;
    return candidate > todayISO ? todayISO : candidate;
  })();

  const { data: bundle, isLoading, error, refetch } = useGetTodayEncountersQuery({ from: fromISO, to: toISO });
  const [updateResource, { isLoading: isUpdating }] = useUpdateResourceMutation();

  const patientMap = new Map<string, Patient>();
  ((bundle as Bundle<Resource> | undefined)?.entry ?? []).forEach((e) => {
    if (e.resource?.resourceType === 'Patient') {
      const p = e.resource as Patient;
      if (p.id) patientMap.set(p.id, p);
    }
  });

  const encounters: Encounter[] = ((bundle as Bundle<Resource> | undefined)?.entry
    ?.filter((e) => e.resource?.resourceType === 'Encounter')
    .map((e) => e.resource as Encounter) ?? [])
    .filter((enc) => {
      const start = enc.actualPeriod?.start ?? (enc as any).period?.start;
      if (!start) return false;
      const encDate = start.split('T')[0];
      return encDate >= fromISO && encDate <= toISO;
    });

  const awaitingTriage = encounters.filter((e) => classifyEncounter(e) === 'awaiting-triage');
  const awaitingClinician = encounters.filter((e) => classifyEncounter(e) === 'awaiting-clinician');
  const inConsultation = encounters.filter((e) => classifyEncounter(e) === 'in-consultation');
  const awaitingBilling = encounters.filter((e) => classifyEncounter(e) === 'awaiting-billing');
  const completed = encounters.filter((e) => classifyEncounter(e) === 'completed');
  const cancelled = encounters.filter((e) => classifyEncounter(e) === 'cancelled');

  const handleEncounterAction = async (
    encounter: Encounter,
    action: 'call-patient' | 'complete-consult' | 'collect-payment' | 'cancel',
  ) => {
    let updated: Encounter;
    if (action === 'call-patient') updated = applyCallPatient(encounter);
    else if (action === 'complete-consult') updated = applyCompleteConsult(encounter);
    else if (action === 'collect-payment') updated = applyCollectPayment(encounter);
    else updated = { ...encounter, status: 'cancelled' } as Encounter;
    await updateResource({ resourceType: 'Encounter', id: encounter.id!, resource: updated as any });
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
          { label: 'Awaiting Triage', count: awaitingTriage.length, cls: 'bg-amber-100 text-amber-800' },
          { label: 'Awaiting Clinician', count: awaitingClinician.length, cls: 'bg-yellow-100 text-yellow-800' },
          { label: 'In Consultation', count: inConsultation.length, cls: 'bg-blue-100 text-blue-800' },
          { label: 'Awaiting Billing', count: awaitingBilling.length, cls: 'bg-purple-100 text-purple-800' },
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
            stage="awaiting-triage"
            encounters={awaitingTriage}
            role={role ?? 'psa'}
            onEncounterAction={handleEncounterAction}
            isUpdating={isUpdating}
            showDate={showDate}
            patientMap={patientMap}
          />
          <QueueSection
            stage="awaiting-clinician"
            encounters={awaitingClinician}
            role={role ?? 'psa'}
            onEncounterAction={handleEncounterAction}
            isUpdating={isUpdating}
            showDate={showDate}
            patientMap={patientMap}
          />
          <QueueSection
            stage="in-consultation"
            encounters={inConsultation}
            role={role ?? 'psa'}
            onEncounterAction={handleEncounterAction}
            isUpdating={isUpdating}
            showDate={showDate}
            patientMap={patientMap}
          />
          <QueueSection
            stage="awaiting-billing"
            encounters={awaitingBilling}
            role={role ?? 'psa'}
            onEncounterAction={handleEncounterAction}
            isUpdating={isUpdating}
            showDate={showDate}
            patientMap={patientMap}
          />
          <QueueSection
            stage="completed"
            encounters={completed}
            role={role ?? 'psa'}
            onEncounterAction={handleEncounterAction}
            isUpdating={isUpdating}
            showDate={showDate}
            patientMap={patientMap}
          />
          {cancelled.length > 0 && (
            <QueueSection
              stage="cancelled"
              encounters={cancelled}
              role={role ?? 'psa'}
              onEncounterAction={handleEncounterAction}
              isUpdating={isUpdating}
              showDate={showDate}
              patientMap={patientMap}
            />
          )}
        </>
      )}
    </div>
  );
};

export default PatientQueuePage;
