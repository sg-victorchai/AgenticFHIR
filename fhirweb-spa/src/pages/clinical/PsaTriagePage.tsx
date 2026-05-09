import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
} from '../../services/fhir/client';
import { Encounter } from 'fhir/r5';

const localNow = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const getLocId = (loc: any): string => loc?.location?.identifier?.value || '';
const nowISO = () => new Date().toISOString();

const PsaTriagePage: React.FC = () => {
  const { id: patientId, encounterId } = useParams<{ id: string; encounterId: string }>();
  const navigate = useNavigate();
  const { data: patient } = useGetPatientQuery(patientId!);
  const { data: encounterResource } = useGetResourceByIdQuery(
    { resourceType: 'Encounter', id: encounterId! },
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

  const isSaving = isCreating || isUpdating;

  const patientName = patient
    ? patient.name?.[0]?.text ||
      [patient.name?.[0]?.prefix?.join(' '), patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family]
        .filter(Boolean).join(' ')
    : '';

  const handleSave = async () => {
    setError('');
    const obsPayloads: any[] = [];
    const push = (code: string, display: string, value: string, unit: string, system: string) => {
      const num = parseFloat(value);
      if (!value || isNaN(num)) return;
      obsPayloads.push({
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
        code: { coding: [{ system, code, display }], text: display },
        subject: { reference: `Patient/${patientId}` },
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime: new Date(form.recordedAt).toISOString(),
        valueQuantity: { value: num, unit, system: 'http://unitsofmeasure.org', code: unit },
      });
    };
    push('59408-5', 'SpO2', form.spo2, '%', 'http://loinc.org');
    push('8867-4', 'Heart Rate', form.hr, '/min', 'http://loinc.org');
    push('8480-6', 'Systolic BP', form.sbp, 'mmHg', 'http://loinc.org');
    push('8462-4', 'Diastolic BP', form.dbp, 'mmHg', 'http://loinc.org');
    push('9279-1', 'Respiratory Rate', form.rr, '/min', 'http://loinc.org');
    push('8310-5', 'Body Temperature', form.temp, 'Cel', 'http://loinc.org');

    if (obsPayloads.length === 0) {
      setError('Please enter at least one vital sign.');
      return;
    }

    for (const obs of obsPayloads) {
      const res = await createResource({ resourceType: 'Observation', resource: obs });
      if ('error' in res) {
        setError('Failed to save vitals. Please retry.');
        return;
      }
    }

    const encounter = encounterResource as Encounter | undefined;
    if (!encounter) { setError('Encounter not found.'); return; }
    const locs = [...((encounter.location || []) as any[])];
    const triageIdx = locs.reduceRight((found, l, i) =>
      found === -1 && getLocId(l) === 'triage' ? i : found, -1);
    if (triageIdx >= 0) {
      const existing = locs[triageIdx];
      locs[triageIdx] = {
        ...existing,
        status: 'completed',
        period: { start: existing.period?.start || new Date(form.recordedAt).toISOString(), end: nowISO() },
      };
    }
    locs.push({ location: { identifier: { value: 'waiting-room' } }, status: 'active' });
    const updatedEnc = { ...encounter, location: locs };
    const res = await updateResource({ resourceType: 'Encounter', id: encounterId!, resource: updatedEnc as any });
    if ('error' in res) { setError('Failed to update triage status. Please retry.'); return; }
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
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-6 rounded-md disabled:opacity-50 transition-colors text-sm"
          >
            {isSaving ? 'Saving…' : 'Complete Triage'}
          </button>
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
