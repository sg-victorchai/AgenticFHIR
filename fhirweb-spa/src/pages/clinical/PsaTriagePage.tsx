import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useSearchByEncounterQuery,
} from '../../services/fhir/client';
import { Encounter, Observation } from 'fhir/r5';

const localNow = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const getLocId = (loc: any): string =>
  loc?.location?.identifier?.value ||
  (loc?.location?.reference ? (loc.location.reference as string).split('/').pop() ?? '' : '') ||
  '';
const nowISO = () => new Date().toISOString();

const COMP_TO_FIELD: Record<string, string> = {
  '59408-5': 'spo2',
  '8867-4': 'hr',
  '8480-6': 'sbp',
  '8462-4': 'dbp',
  '9279-1': 'rr',
  '8310-5': 'temp',
};

const PsaTriagePage: React.FC = () => {
  const { id: patientId, encounterId } = useParams<{ id: string; encounterId: string }>();
  const navigate = useNavigate();
  const { data: patient } = useGetPatientQuery(patientId!);
  const { data: encounterResource } = useGetResourceByIdQuery(
    { resourceType: 'Encounter', id: encounterId! },
    { skip: !encounterId },
  );
  const { data: obsBundle } = useSearchByEncounterQuery(
    { resourceType: 'Observation', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const [createResource, { isLoading: isCreating }] = useCreateResourceMutation();
  const [updateResource, { isLoading: isUpdating }] = useUpdateResourceMutation();

  const [form, setForm] = useState({
    spo2: '',
    hr: '',
    sbp: '',
    dbp: '',
    rr: '',
    temp: '',
    recordedAt: localNow(),
  });
  const [error, setError] = useState('');

  // Existing vital-signs panel observations for this encounter
  const existingPanelObs = (obsBundle?.entry ?? [])
    .map((e) => e.resource as Observation)
    .filter(
      (o) =>
        o?.status !== 'entered-in-error' &&
        o?.category?.some((c) => c.coding?.some((cd) => cd.code === 'vital-signs')) &&
        (o?.component?.length ?? 0) > 0,
    )
    .sort((a, b) => ((b.effectiveDateTime ?? '') > (a.effectiveDateTime ?? '') ? 1 : -1));

  const latestPanelObs = existingPanelObs[0] ?? null;

  // Pre-fill form when latest obs loads
  useEffect(() => {
    if (!latestPanelObs) return;
    const updates: Partial<typeof form> = {};
    latestPanelObs.component?.forEach((comp) => {
      const code = comp.code?.coding?.[0]?.code ?? '';
      const field = COMP_TO_FIELD[code];
      if (field && comp.valueQuantity?.value != null)
        updates[field as keyof typeof form] = String(comp.valueQuantity.value);
    });
    if (latestPanelObs.effectiveDateTime)
      updates.recordedAt = new Date(latestPanelObs.effectiveDateTime).toISOString().slice(0, 16);
    if (Object.keys(updates).length > 0) setForm((prev) => ({ ...prev, ...updates }));
  }, [latestPanelObs?.id]);

  const isSaving = isCreating || isUpdating;

  const patientName = patient
    ? patient.name?.[0]?.text ||
      [patient.name?.[0]?.prefix?.join(' '), patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family]
        .filter(Boolean).join(' ')
    : '';

  const buildComponents = () =>
    [
      { code: '59408-5', display: 'SpO₂',            value: form.spo2, unit: '%',           ucum: '%' },
      { code: '8867-4',  display: 'Heart Rate',       value: form.hr,   unit: 'beats/min',   ucum: '/min' },
      { code: '8480-6',  display: 'Systolic BP',      value: form.sbp,  unit: 'mmHg',        ucum: 'mm[Hg]' },
      { code: '8462-4',  display: 'Diastolic BP',     value: form.dbp,  unit: 'mmHg',        ucum: 'mm[Hg]' },
      { code: '9279-1',  display: 'Respiratory Rate', value: form.rr,   unit: 'breaths/min', ucum: '/min' },
      { code: '8310-5',  display: 'Body Temperature', value: form.temp, unit: '°C',          ucum: 'Cel' },
    ]
      .filter(({ value }) => value && !isNaN(parseFloat(value)))
      .map(({ code, display, value, unit, ucum }) => ({
        code: { coding: [{ system: 'http://loinc.org', code, display }] },
        valueQuantity: { value: parseFloat(value), unit, system: 'http://unitsofmeasure.org', code: ucum },
      }));

  const advanceEncounter = async () => {
    const encounter = encounterResource as Encounter | undefined;
    if (!encounter) return false;
    const locs = [...((encounter.location || []) as any[])];
    const triageIdx = locs.reduceRight(
      (found, l, i) => (found === -1 && getLocId(l) === 'triage' ? i : found),
      -1,
    );
    if (triageIdx >= 0) {
      const existing = locs[triageIdx];
      locs[triageIdx] = {
        ...existing,
        status: 'completed',
        period: { start: existing.period?.start || new Date(form.recordedAt).toISOString(), end: nowISO() },
      };
    }
    locs.push({ location: { identifier: { value: 'waiting-room' } }, status: 'active' });
    const res = await updateResource({ resourceType: 'Encounter', id: encounterId!, resource: { ...encounter, location: locs } as any });
    return !('error' in res);
  };

  /** First-time triage: POST new panel obs + advance encounter */
  const handleCompleteTriage = async () => {
    setError('');
    const components = buildComponents();
    if (components.length === 0) { setError('Please enter at least one vital sign.'); return; }
    const obsResult = await createResource({
      resourceType: 'Observation',
      resource: {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '85353-1', display: 'Vital signs panel' }], text: 'Vital Signs' },
        subject: { reference: `Patient/${patientId}` },
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime: new Date(form.recordedAt).toISOString(),
        component: components,
      } as any,
    });
    if ('error' in obsResult) { setError('Failed to save vitals. Please retry.'); return; }
    if (!(await advanceEncounter())) { setError('Failed to update triage status. Please retry.'); return; }
    navigate('/queue');
  };

  /** Update existing vitals: PUT latest panel obs + advance encounter */
  const handleUpdateVitals = async () => {
    setError('');
    if (!latestPanelObs) return;
    const components = buildComponents();
    if (components.length === 0) { setError('Please enter at least one vital sign.'); return; }
    const obsResult = await updateResource({
      resourceType: 'Observation',
      id: latestPanelObs.id!,
      resource: {
        ...latestPanelObs,
        effectiveDateTime: new Date(form.recordedAt).toISOString(),
        component: components,
      } as any,
    });
    if ('error' in obsResult) { setError('Failed to update vitals. Please retry.'); return; }
    if (!(await advanceEncounter())) { setError('Failed to update triage status. Please retry.'); return; }
    navigate('/queue');
  };


  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
        <Link to="/queue" className="hover:text-blue-600">Queue</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Triage — {patientName || patientId}</span>
      </nav>
      <h1 className="text-2xl font-bold mb-1 text-gray-800">Patient Triage</h1>
      <p className="text-sm text-gray-500 mb-6">Record vital signs and complete triage to send patient to consulting room.</p>

      <div className="bg-white shadow rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Vital Signs</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'SpO₂ (%)', key: 'spo2', placeholder: 'e.g. 98' },
            { label: 'Heart Rate (bpm)', key: 'hr', placeholder: 'e.g. 78' },
            { label: 'Systolic BP (mmHg)', key: 'sbp', placeholder: 'e.g. 120' },
            { label: 'Diastolic BP (mmHg)', key: 'dbp', placeholder: 'e.g. 80' },
            { label: 'Respiratory Rate (/min)', key: 'rr', placeholder: 'e.g. 16' },
            { label: 'Temperature (°C)', key: 'temp', placeholder: 'e.g. 37.0' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                step="any"
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Recorded At</label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.recordedAt}
              onChange={(e) => setForm((f) => ({ ...f, recordedAt: e.target.value }))}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          {latestPanelObs ? (
            <button
              onClick={handleUpdateVitals}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md disabled:opacity-50 transition-colors text-sm"
            >
              {isSaving ? 'Saving…' : 'Update Vital Sign'}
            </button>
          ) : (
            <button
              onClick={handleCompleteTriage}
              disabled={isSaving}
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-6 rounded-md disabled:opacity-50 transition-colors text-sm"
            >
              {isSaving ? 'Saving…' : 'Complete Triage'}
            </button>
          )}
          <Link
            to="/queue"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-md transition-colors text-sm inline-flex items-center"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PsaTriagePage;
