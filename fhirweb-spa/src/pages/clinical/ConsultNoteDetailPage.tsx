import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useGetResourceByIdQuery,
  useSearchByEncounterQuery,
  useSearchChildEncountersQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
} from '../../services/fhir/client';
import {
  Encounter,
  Observation,
  Condition,
  MedicationRequest,
  MedicationDispense,
  MedicationStatement,
  CarePlan,
  Procedure,
  Bundle,
  Resource,
  ServiceRequest,
  DiagnosticReport,
} from 'fhir/r5';

// ─── Constants ────────────────────────────────────────────────────────────────

const BODY_SYSTEMS = [
  { code: '113255004', display: 'Respiratory' },
  { code: '80891009', display: 'Cardiovascular' },
  { code: '818983003', display: 'Abdomen' },
  { code: '25938000', display: 'Neurological' },
  { code: '387784004', display: 'Musculoskeletal' },
  { code: '39937001', display: 'Skin' },
  { code: '53127002', display: 'Genitourinary' },
  { code: '265581004', display: 'HEENT' },
  { code: '74728003', display: 'General / Other' },
];

const INVESTIGATION_CATEGORIES = [
  { display: 'Haematology', code: '252275004' },
  { display: 'Biochemistry', code: '59524001' },
  { display: 'Radiology / Imaging', code: '394914008' },
  { display: 'Cardiology', code: '394579002' },
  { display: 'Microbiology', code: '19851009' },
  { display: 'Other', code: '74728003' },
];

const ROUTE_SNOMED: Record<string, { code: string; display: string }> = {
  oral: { code: '26643006', display: 'Oral route' },
  IV: { code: '47625008', display: 'Intravenous route' },
  IM: { code: '78421000', display: 'Intramuscular route' },
  SC: { code: '34206005', display: 'Subcutaneous route' },
  inhaled: { code: '18679011000001101', display: 'Inhalation route' },
};

const SEVERITY_SNOMED = {
  mild: { code: '255604002', display: 'Mild' },
  moderate: { code: '6736007', display: 'Moderate' },
  severe: { code: '24484000', display: 'Severe' },
};

const VITAL_LOINC_NAMES: Record<string, string> = {
  '2708-6': 'SpO₂',
  '8867-4': 'Heart Rate',
  '8480-6': 'Systolic BP',
  '8462-4': 'Diastolic BP',
  '9279-1': 'Resp. Rate',
  '8310-5': 'Temperature',
};

const SECTION_ACCENT: Record<string, string> = {
  vitals: 'bg-sky-600',
  exam: 'bg-teal-600',
  investigations: 'bg-violet-600',
  assessment: 'bg-rose-600',
  management: 'bg-emerald-600',
  admission: 'bg-orange-600',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDT = (s?: string) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return s;
  }
};

const formatDate = (s?: string) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-SG', { dateStyle: 'medium' });
  } catch {
    return s;
  }
};

const extractResources = <T,>(bundle?: Bundle<Resource>): T[] => {
  if (!bundle?.entry) return [];
  return bundle.entry
    .filter((e) => e.resource)
    .map((e) => e.resource as unknown as T);
};

const nowFHIR = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const h = String(Math.abs(Math.floor(off / 60))).padStart(2, '0');
  const m = String(Math.abs(off % 60)).padStart(2, '0');
  return d.toISOString().slice(0, 19) + `${sign}${h}:${m}`;
};

const localNow = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const localDatePlusDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const toFHIRDateTime = (local: string): string => {
  const d = new Date(local);
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const h = String(Math.abs(Math.floor(off / 60))).padStart(2, '0');
  const m = String(Math.abs(off % 60)).padStart(2, '0');
  return `${local}:00${sign}${h}:${m}`;
};

type VitalTrend = 'critical' | 'abnormal' | 'normal';

const interpretVital = (loincCode: string, value: number): VitalTrend => {
  switch (loincCode) {
    case '2708-6':
      return value < 90 ? 'critical' : value < 95 ? 'abnormal' : 'normal';
    case '8867-4':
      return value < 40 || value > 150
        ? 'critical'
        : value < 60 || value > 100
          ? 'abnormal'
          : 'normal';
    case '8480-6':
      return value < 80 || value > 200
        ? 'critical'
        : value >= 140
          ? 'abnormal'
          : 'normal';
    case '8462-4':
      return value >= 90 || value < 50 ? 'abnormal' : 'normal';
    case '9279-1':
      return value < 8 || value > 30
        ? 'critical'
        : value < 12 || value > 20
          ? 'abnormal'
          : 'normal';
    case '8310-5':
      return value < 35 || value > 40
        ? 'critical'
        : value >= 38 || value < 36.0
          ? 'abnormal'
          : 'normal';
    default:
      return 'normal';
  }
};

const vitalCardCls = (t: VitalTrend) =>
  t === 'critical'
    ? 'border-red-400 bg-red-50'
    : t === 'abnormal'
      ? 'border-amber-400 bg-amber-50'
      : 'border-gray-200 bg-white';
const vitalValCls = (t: VitalTrend) =>
  t === 'critical'
    ? 'text-red-700'
    : t === 'abnormal'
      ? 'text-amber-700'
      : 'text-gray-800';

const fieldCls =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const labelCls =
  'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

// ─── UI primitives ────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    final: 'bg-green-100 text-green-800',
    active: 'bg-blue-100 text-blue-700',
    'on-hold': 'bg-gray-100 text-gray-600',
    confirmed: 'bg-green-100 text-green-800',
    provisional: 'bg-yellow-100 text-yellow-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    finished: 'bg-gray-100 text-gray-600',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    preliminary: 'bg-yellow-100 text-yellow-800',
    stat: 'bg-red-100 text-red-700',
    urgent: 'bg-orange-100 text-orange-700',
    routine: 'bg-gray-100 text-gray-600',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
};


// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section: React.FC<{
  sectionKey: string;
  icon: string;
  title: string;
  count: number;
  isEditable: boolean;
  addLabel: string;
  children: React.ReactNode;
  addForm: React.ReactNode;
}> = ({
  sectionKey,
  icon,
  title,
  count,
  isEditable,
  addLabel,
  children,
  addForm,
}) => {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const accent = SECTION_ACCENT[sectionKey] || 'bg-gray-500';
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4 shadow-sm">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`${accent} rounded-lg h-7 w-7 flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}
          >
            {icon}
          </div>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          {count > 0 ? (
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {count} recorded
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">none recorded</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditable && open && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowForm((f) => !f);
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded-md px-2 py-1 transition-colors bg-white"
            >
              {showForm ? '✕ Cancel' : `+ ${addLabel}`}
            </button>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="bg-white">
          <div className="px-5 py-4">{children}</div>
          {isEditable && showForm && (
            <div className="border-t border-blue-100 bg-blue-50/40 px-5 py-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">
                Add to {title}
              </p>
              {React.cloneElement(addForm as React.ReactElement, {
                onDone: () => setShowForm(false),
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EmptyNote: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-sm text-gray-400 italic">{label}</p>
);

const FilterBar = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="mb-4">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Filter records..."
      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  </div>
);

// ─── Inline add forms ─────────────────────────────────────────────────────────

interface AddFormProps {
  patientId: string;
  patientName: string;
  encounterId: string;
  createResource: (arg: {
    resourceType: string;
    resource: Resource;
  }) => Promise<any>;
  isSaving: boolean;
  onDone?: () => void;
}

const AddVitalsForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({
    spo2: '',
    hr: '',
    sbp: '',
    dbp: '',
    rr: '',
    temp: '',
    recordedAt: localNow(),
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    const entries: Array<{
      code: string;
      display: string;
      value: number;
      unit: string;
      ucum: string;
    }> = [];
    if (form.spo2)
      entries.push({
        code: '2708-6',
        display: 'Oxygen saturation',
        value: +form.spo2,
        unit: '%',
        ucum: '%',
      });
    if (form.hr)
      entries.push({
        code: '8867-4',
        display: 'Heart rate',
        value: +form.hr,
        unit: 'beats/min',
        ucum: '/min',
      });
    if (form.sbp)
      entries.push({
        code: '8480-6',
        display: 'Systolic blood pressure',
        value: +form.sbp,
        unit: 'mmHg',
        ucum: 'mm[Hg]',
      });
    if (form.dbp)
      entries.push({
        code: '8462-4',
        display: 'Diastolic blood pressure',
        value: +form.dbp,
        unit: 'mmHg',
        ucum: 'mm[Hg]',
      });
    if (form.rr)
      entries.push({
        code: '9279-1',
        display: 'Respiratory rate',
        value: +form.rr,
        unit: 'breaths/min',
        ucum: '/min',
      });
    if (form.temp)
      entries.push({
        code: '8310-5',
        display: 'Body temperature',
        value: +form.temp,
        unit: '°C',
        ucum: 'Cel',
      });
    if (entries.length === 0) {
      setErr('Enter at least one value.');
      return;
    }
    let allOk = true;
    for (const v of entries) {
      const obs = {
        resourceType: 'Observation' as const,
        status: 'final' as const,
        category: [
          {
            coding: [
              {
                system:
                  'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs',
              },
            ],
          },
        ],
        code: {
          coding: [
            { system: 'http://loinc.org', code: v.code, display: v.display },
          ],
        },
        subject: { reference: `Patient/${patientId}`, display: patientName },
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime: toFHIRDateTime(form.recordedAt),
        valueQuantity: {
          value: v.value,
          unit: v.unit,
          system: 'http://unitsofmeasure.org',
          code: v.ucum,
        },
      };
      const res = await createResource({
        resourceType: 'Observation',
        resource: obs as any,
      });
      if (!('data' in res)) allOk = false;
    }
    if (allOk) {
      onDone?.();
    } else {
      setErr('Some values failed to save. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { id: 'spo2', label: 'SpO₂ (%)', ph: '98' },
          { id: 'hr', label: 'Heart Rate (bpm)', ph: '72' },
          { id: 'sbp', label: 'Systolic BP', ph: '120' },
          { id: 'dbp', label: 'Diastolic BP', ph: '80' },
          { id: 'rr', label: 'Resp. Rate (/min)', ph: '16' },
          { id: 'temp', label: 'Temp (°C)', ph: '36.8' },
        ].map((f) => (
          <div key={f.id}>
            <label className={labelCls}>{f.label}</label>
            <input
              type="number"
              placeholder={f.ph}
              className={fieldCls}
              value={(form as any)[f.id]}
              onChange={(e) =>
                setForm((s) => ({ ...s, [f.id]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div>
        <label className={labelCls}>Recorded At</label>
        <input
          type="datetime-local"
          className={`${fieldCls} max-w-xs`}
          value={form.recordedAt}
          onChange={(e) =>
            setForm((s) => ({ ...s, recordedAt: e.target.value }))
          }
        />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Save Vitals'}
      </button>
    </div>
  );
};

const AddExamForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({
    bodySystem: BODY_SYSTEMS[0].code,
    finding: '',
    isNormal: true,
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.finding.trim()) {
      setErr('Enter the examination finding.');
      return;
    }
    const sys = BODY_SYSTEMS.find((s) => s.code === form.bodySystem)!;
    const obs = {
      resourceType: 'Observation' as const,
      status: 'final' as const,
      category: [
        {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'exam',
              display: 'Exam',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: sys.code,
            display: sys.display,
          },
        ],
        text: sys.display,
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: nowFHIR(),
      interpretation: form.isNormal
        ? [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'N',
                  display: 'Normal',
                },
              ],
            },
          ]
        : [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'A',
                  display: 'Abnormal',
                },
              ],
            },
          ],
      valueString: form.finding.trim(),
    };
    const res = await createResource({
      resourceType: 'Observation',
      resource: obs as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to save. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Body System</label>
          <select
            className={fieldCls}
            value={form.bodySystem}
            onChange={(e) =>
              setForm((s) => ({ ...s, bodySystem: e.target.value }))
            }
          >
            {BODY_SYSTEMS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.display}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Finding</label>
          <input
            type="text"
            placeholder="Describe finding…"
            className={fieldCls}
            value={form.finding}
            onChange={(e) =>
              setForm((s) => ({ ...s, finding: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="flex gap-4">
        {[
          { label: 'Normal', val: true, cls: 'text-green-700' },
          { label: 'Abnormal', val: false, cls: 'text-red-600' },
        ].map((o) => (
          <label
            key={o.label}
            className={`flex items-center gap-2 cursor-pointer text-sm ${o.cls}`}
          >
            <input
              type="radio"
              checked={form.isNormal === o.val}
              onChange={() => setForm((s) => ({ ...s, isNormal: o.val }))}
            />
            {o.label}
          </label>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Add Finding'}
      </button>
    </div>
  );
};

const AddOrderForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({
    category: INVESTIGATION_CATEGORIES[0].code,
    testName: '',
    priority: 'routine',
    notes: '',
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.testName.trim()) {
      setErr('Enter the test name.');
      return;
    }
    const cat = INVESTIGATION_CATEGORIES.find((c) => c.code === form.category)!;
    const sr = {
      resourceType: 'ServiceRequest' as const,
      status: 'active' as const,
      intent: 'order' as const,
      priority: form.priority as any,
      code: {
        concept: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: cat.code,
              display: cat.display,
            },
          ],
          text: form.testName.trim(),
        },
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      authoredOn: nowFHIR(),
      ...(form.notes ? { note: [{ text: form.notes }] } : {}),
    };
    const res = await createResource({
      resourceType: 'ServiceRequest',
      resource: sr as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to place order. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Category</label>
          <select
            className={fieldCls}
            value={form.category}
            onChange={(e) =>
              setForm((s) => ({ ...s, category: e.target.value }))
            }
          >
            {INVESTIGATION_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.display}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Test Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Full Blood Count, ECG…"
            className={fieldCls}
            value={form.testName}
            onChange={(e) =>
              setForm((s) => ({ ...s, testName: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelCls}>Priority</label>
          <select
            className={fieldCls}
            value={form.priority}
            onChange={(e) =>
              setForm((s) => ({ ...s, priority: e.target.value }))
            }
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Clinical Indication</label>
          <input
            type="text"
            placeholder="Optional note…"
            className={fieldCls}
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Place Order'}
      </button>
    </div>
  );
};

const AddDiagnosisForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({
    diagnosis: '',
    snomedCode: '',
    severity: 'moderate',
    verification: 'confirmed',
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.diagnosis.trim()) {
      setErr('Enter a diagnosis.');
      return;
    }
    const sev = SEVERITY_SNOMED[form.severity as keyof typeof SEVERITY_SNOMED];
    const cond = {
      resourceType: 'Condition' as const,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: form.verification,
            display:
              form.verification === 'confirmed' ? 'Confirmed' : 'Provisional',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'encounter-diagnosis',
              display: 'Encounter Diagnosis',
            },
          ],
        },
      ],
      severity: { coding: [{ system: 'http://snomed.info/sct', ...sev }] },
      code: {
        coding: form.snomedCode
          ? [
              {
                system: 'http://snomed.info/sct',
                code: form.snomedCode,
                display: form.diagnosis.trim(),
              },
            ]
          : [],
        text: form.diagnosis.trim(),
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      onsetDateTime: nowFHIR(),
      recordedDate: nowFHIR().slice(0, 10),
    };
    const res = await createResource({
      resourceType: 'Condition',
      resource: cond as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to save. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>
            Diagnosis <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Acute decompensated heart failure"
            className={fieldCls}
            value={form.diagnosis}
            onChange={(e) =>
              setForm((s) => ({ ...s, diagnosis: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelCls}>SNOMED Code (optional)</label>
          <input
            type="text"
            placeholder="e.g. 703328004"
            className={fieldCls}
            value={form.snomedCode}
            onChange={(e) =>
              setForm((s) => ({ ...s, snomedCode: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelCls}>Severity</label>
          <select
            className={fieldCls}
            value={form.severity}
            onChange={(e) =>
              setForm((s) => ({ ...s, severity: e.target.value }))
            }
          >
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Verification</label>
          <select
            className={fieldCls}
            value={form.verification}
            onChange={(e) =>
              setForm((s) => ({ ...s, verification: e.target.value }))
            }
          >
            <option value="confirmed">Confirmed</option>
            <option value="provisional">Provisional</option>
          </select>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Save Diagnosis'}
      </button>
    </div>
  );
};

const AddMedicationForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({
    drugName: '',
    dose: '',
    unit: 'mg',
    route: 'oral',
    frequency: '',
    instructions: '',
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.drugName.trim()) {
      setErr('Enter a drug name.');
      return;
    }
    const parts = [
      form.dose ? `${form.dose} ${form.unit}` : '',
      form.route,
      form.frequency,
      form.instructions,
    ]
      .filter(Boolean)
      .join(' · ');
    const med = {
      resourceType: 'MedicationRequest' as const,
      status: 'active' as const,
      intent: 'order' as const,
      medication: { concept: { text: form.drugName.trim() } },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      authoredOn: nowFHIR(),
      dosageInstruction: [
        {
          text: parts || form.drugName.trim(),
          route: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                ...ROUTE_SNOMED[form.route as keyof typeof ROUTE_SNOMED],
              },
            ],
          },
          ...(form.dose
            ? {
                doseAndRate: [
                  {
                    doseQuantity: {
                      value: +form.dose,
                      unit: form.unit,
                      system: 'http://unitsofmeasure.org',
                      code: form.unit,
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    };
    const res = await createResource({
      resourceType: 'MedicationRequest',
      resource: med as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to save. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Drug Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Furosemide"
            className={fieldCls}
            value={form.drugName}
            onChange={(e) =>
              setForm((s) => ({ ...s, drugName: e.target.value }))
            }
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>Dose</label>
            <input
              type="text"
              placeholder="40"
              className={fieldCls}
              value={form.dose}
              onChange={(e) => setForm((s) => ({ ...s, dose: e.target.value }))}
            />
          </div>
          <div className="w-20">
            <label className={labelCls}>Unit</label>
            <select
              className={fieldCls}
              value={form.unit}
              onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
            >
              {['mg', 'mcg', 'g', 'mL', 'units'].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Route</label>
          <select
            className={fieldCls}
            value={form.route}
            onChange={(e) => setForm((s) => ({ ...s, route: e.target.value }))}
          >
            {Object.keys(ROUTE_SNOMED).map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Frequency</label>
          <select
            className={fieldCls}
            value={form.frequency}
            onChange={(e) =>
              setForm((s) => ({ ...s, frequency: e.target.value }))
            }
          >
            <option value="">— Select —</option>
            {[
              'OD (once daily)',
              'BD (twice daily)',
              'TDS',
              'QDS',
              'Q6H',
              'Q8H',
              'STAT',
              'PRN',
            ].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Special Instructions</label>
          <input
            type="text"
            placeholder="e.g. With food, monitor K⁺…"
            className={fieldCls}
            value={form.instructions}
            onChange={(e) =>
              setForm((s) => ({ ...s, instructions: e.target.value }))
            }
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Add Medication'}
      </button>
    </div>
  );
};

const AddCarePlanForm: React.FC<AddFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  onDone,
}) => {
  const [form, setForm] = useState({ title: '', description: '' });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.description.trim()) {
      setErr('Enter the care plan description.');
      return;
    }
    const cp = {
      resourceType: 'CarePlan' as const,
      status: 'active' as const,
      intent: 'order' as const,
      title: form.title.trim() || 'Care Plan',
      description: form.description.trim(),
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      created: nowFHIR().slice(0, 10),
      period: { start: nowFHIR() },
    };
    const res = await createResource({
      resourceType: 'CarePlan',
      resource: cp as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to save. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Plan Title</label>
        <input
          type="text"
          placeholder="e.g. HFrEF Management Plan"
          className={fieldCls}
          value={form.title}
          onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
        />
      </div>
      <div>
        <label className={labelCls}>
          Description / Goals <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          placeholder="Outline management goals, plan, referrals, follow-up…"
          className={fieldCls}
          value={form.description}
          onChange={(e) =>
            setForm((s) => ({ ...s, description: e.target.value }))
          }
        />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving…' : 'Save Care Plan'}
      </button>
    </div>
  );
};

interface AddAdmissionFormProps extends AddFormProps {
  diagnosisItems: Array<{ id: string; display: string }>;
}

const AddAdmissionForm: React.FC<AddAdmissionFormProps> = ({
  patientId,
  patientName,
  encounterId,
  createResource,
  isSaving,
  diagnosisItems,
  onDone,
}) => {
  const [form, setForm] = useState({
    admDate: localNow(),
    disDate: localDatePlusDays(5),
    stayDays: '5',
    reason: '',
  });
  const [err, setErr] = useState('');
  const handleSave = async () => {
    setErr('');
    if (!form.reason.trim()) {
      setErr('Enter the reason for admission.');
      return;
    }
    const enc = {
      resourceType: 'Encounter' as const,
      status: 'in-progress' as const,
      class: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'IMP',
              display: 'inpatient encounter',
            },
          ],
        },
      ],
      type: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '32485007',
              display: 'Hospital admission (procedure)',
            },
          ],
          text: 'Inpatient hospital admission',
        },
      ],
      subject: { reference: `Patient/${patientId}`, display: patientName },
      partOf: { reference: `Encounter/${encounterId}` },
      actualPeriod: {
        start: toFHIRDateTime(form.admDate),
        end: toFHIRDateTime(form.disDate),
      },
      reason: [{ value: [{ concept: { text: form.reason.trim() } }] }],
      ...(diagnosisItems.length > 0
        ? {
            diagnosis: diagnosisItems.map((d) => ({
              condition: [
                {
                  reference: {
                    reference: `Condition/${d.id}`,
                    display: d.display,
                  },
                },
              ],
              use: [
                {
                  coding: [
                    {
                      system:
                        'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                      code: 'AD',
                      display: 'Admission diagnosis',
                    },
                  ],
                },
              ],
            })),
          }
        : {}),
    };
    const res = await createResource({
      resourceType: 'Encounter',
      resource: enc as any,
    });
    if ('data' in res) {
      onDone?.();
    } else {
      setErr('Failed to create admission. Please retry.');
    }
  };
  return (
    <div className="space-y-3">
      {diagnosisItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-700">
          <strong>Admission diagnoses:</strong>{' '}
          {diagnosisItems.map((d) => d.display).join(', ')}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Admission Date & Time</label>
          <input
            type="datetime-local"
            className={fieldCls}
            value={form.admDate}
            onChange={(e) =>
              setForm((s) => ({ ...s, admDate: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelCls}>Planned Discharge</label>
          <input
            type="datetime-local"
            className={fieldCls}
            value={form.disDate}
            onChange={(e) =>
              setForm((s) => ({ ...s, disDate: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelCls}>Stay Duration</label>
          <select
            className={fieldCls}
            value={form.stayDays}
            onChange={(e) => {
              const days = parseInt(e.target.value);
              setForm((s) => ({
                ...s,
                stayDays: e.target.value,
                disDate: localDatePlusDays(days),
              }));
            }}
          >
            {['1', '2', '3', '5', '7', '10', '14', '21'].map((d) => (
              <option key={d} value={d}>
                {d} day{parseInt(d) !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Reason for Admission <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Acute decompensated HF"
            className={fieldCls}
            value={form.reason}
            onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium py-1.5 px-5 rounded-md disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Admitting…' : 'Confirm Admission'}
      </button>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ConsultNoteDetailPage: React.FC = () => {
  const { id: patientId, encounterId } = useParams<{
    id: string;
    encounterId: string;
  }>();
  const [createResource, { isLoading: isSaving }] = useCreateResourceMutation();
  const [updateResource] = useUpdateResourceMutation();
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const { data: patient } = useGetPatientQuery(patientId!);
  const { data: encounterResource, isLoading: encounterLoading } =
    useGetResourceByIdQuery(
      { resourceType: 'Encounter', id: encounterId! },
      { skip: !encounterId },
    );
  const { data: obsBundle, isLoading: obsLoading } = useSearchByEncounterQuery(
    { resourceType: 'Observation', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: srBundle, isLoading: srLoading } = useSearchByEncounterQuery(
    { resourceType: 'ServiceRequest', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: condBundle, isLoading: condLoading } =
    useSearchByEncounterQuery(
      { resourceType: 'Condition', encounterId: encounterId! },
      { skip: !encounterId },
    );
  const { data: medBundle, isLoading: medLoading } = useSearchByEncounterQuery(
    { resourceType: 'MedicationRequest', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: cpBundle, isLoading: cpLoading } = useSearchByEncounterQuery(
    { resourceType: 'CarePlan', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: childEncBundle, isLoading: childEncLoading } =
    useSearchChildEncountersQuery(encounterId!, { skip: !encounterId });
  const { data: drBundle, isLoading: drLoading } = useSearchByEncounterQuery(
    { resourceType: 'DiagnosticReport', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: medDispBundle, isLoading: medDispLoading } = useSearchByEncounterQuery(
    { resourceType: 'MedicationDispense', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: medStatBundle, isLoading: medStatLoading } = useSearchByEncounterQuery(
    { resourceType: 'MedicationStatement', encounterId: encounterId! },
    { skip: !encounterId },
  );
  const { data: procBundle, isLoading: procLoading } = useSearchByEncounterQuery(
    { resourceType: 'Procedure', encounterId: encounterId! },
    { skip: !encounterId },
  );

  const encounter = encounterResource as Encounter | undefined;
  const allObs = extractResources<Observation>(obsBundle);
  const serviceRequests = extractResources<ServiceRequest>(srBundle);
  const conditions = extractResources<Condition>(condBundle);
  const medications = extractResources<MedicationRequest>(medBundle);
  const carePlans = extractResources<CarePlan>(cpBundle);
  const childEncounters = extractResources<Encounter>(childEncBundle);
  const diagnosticReports = extractResources<DiagnosticReport>(drBundle);
  const medicationDispenses = extractResources<MedicationDispense>(medDispBundle);
  const medicationStatements = extractResources<MedicationStatement>(medStatBundle);
  const procedures = extractResources<Procedure>(procBundle);

  const RAD_SNOMED = '394914008';
  const labOrders = serviceRequests.filter(
    (sr) => !((sr.code as any)?.concept?.coding?.[0]?.code === RAD_SNOMED),
  );
  const radOrders = serviceRequests.filter(
    (sr) => (sr.code as any)?.concept?.coding?.[0]?.code === RAD_SNOMED,
  );

  const LAB_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0074';
  const labReports = diagnosticReports.filter((dr) =>
    dr.category?.some((cat) =>
      cat.coding?.some((cd) => cd.system === LAB_SYSTEM && cd.code === 'LAB'),
    ),
  );
  const radReports = diagnosticReports.filter((dr) =>
    dr.category?.some((cat) =>
      cat.coding?.some((cd) => cd.system === LAB_SYSTEM && cd.code === 'RAD'),
    ),
  );

  const vitals = allObs.filter((o) =>
    o.category?.some((c) => c.coding?.some((cd) => cd.code === 'vital-signs')),
  );
  const examFindings = allObs.filter((o) =>
    o.category?.some((c) => c.coding?.some((cd) => cd.code === 'exam')),
  );

  const patientName = patient
    ? patient.name?.[0]?.text ||
      [
        patient.name?.[0]?.prefix?.join(' '),
        patient.name?.[0]?.given?.join(' '),
        patient.name?.[0]?.family,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const encounterReason =
    (encounter as any)?.reason?.[0]?.value?.[0]?.concept?.text ||
    encounter?.type?.[0]?.text ||
    'Encounter';
  const isEditable = encounter?.status === 'in-progress';
  const inpatientAdmission = childEncounters.find((e) =>
    e.class?.some((c) => c.coding?.some((cd) => cd.code === 'IMP')),
  );
  const diagnosisItemsForAdmission = conditions.map((c) => ({
    id: c.id || '',
    display: c.code?.text || c.code?.coding?.[0]?.display || 'Diagnosis',
  }));

  const isLoading =
    encounterLoading ||
    obsLoading ||
    srLoading ||
    condLoading ||
    medLoading ||
    cpLoading ||
    childEncLoading ||
    drLoading ||
    medDispLoading ||
    medStatLoading ||
    procLoading;

  useEffect(() => {
    if ((encounterResource as any)?.note?.[0]?.text) {
      setNoteText((encounterResource as any).note[0].text);
    }
  }, [(encounterResource as any)?.id]);

  const handleSaveNote = async () => {
    setNoteError('');
    setIsSavingNote(true);
    const updated = {
      ...(encounterResource as Encounter),
      note: [{ text: noteText }],
    };
    const result = await updateResource({
      resourceType: 'Encounter',
      id: encounterId!,
      resource: updated as unknown as Encounter,
    });
    setIsSavingNote(false);
    if (!('data' in result)) {
      setNoteError('Failed to save notes. Please try again.');
    }
  };

  const formProps: Omit<AddFormProps, 'onDone'> = {
    patientId: patientId!,
    patientName,
    encounterId: encounterId!,
    createResource,
    isSaving,
  };

  // ── Sidebar sections ──────────────────────────────────────────────────────
  const SIDEBAR_SECTIONS = [
    { id: 'notes', label: 'Patient Notes', icon: '📋' },
    { id: 'vitals', label: 'Vital Signs', icon: '♥' },
    { id: 'exam', label: 'Physical Exam', icon: 'E' },
    { id: 'investigations', label: 'Investigations', icon: 'Ix' },
    { id: 'lab-orders', label: 'Lab Orders', icon: '🔬', indent: true },
    { id: 'rad-orders', label: 'Rad Orders', icon: '📷', indent: true },
    { id: 'lab-results', label: 'Lab Results', icon: '🧪', indent: true },
    { id: 'rad-reports', label: 'Rad Reports', icon: '📡', indent: true },
    { id: 'assessment', label: 'Assessment', icon: 'Dx' },
    { id: 'medications', label: 'Medications', icon: 'Rx' },
    { id: 'medication-request', label: 'Medication Request', icon: '💊', indent: true },
    { id: 'medication-dispense', label: 'Medication Dispense', icon: '💊', indent: true },
    { id: 'medication-statement', label: 'Medication Statement', icon: '💊', indent: true },
    { id: 'procedure', label: 'Procedure', icon: '⚕️' },
    { id: 'care-plan', label: 'Care Plan', icon: '📝' },
    { id: 'admission', label: 'Admission', icon: '🏥' },
  ];

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('notes');
  const [filterText, setFilterText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { setFilterText(''); setExpandedId(null); }, [activeSection]);

  return (
    // Escape the container's px-4 py-8 padding to go full-width
    <div className="-mx-4 -mt-8 flex flex-col min-h-screen">

      {/* ── Sticky demographic bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-slate-700 rounded-full h-9 w-9 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {patientName.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 text-base leading-tight block truncate">
              {patientName || '—'}
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs text-gray-500">
              {patient?.birthDate && <span>DOB: <strong className="text-gray-700">{patient.birthDate}</strong></span>}
              {patient?.gender && (
                <span>Sex: <strong className="text-gray-700 capitalize">{patient.gender}</strong></span>
              )}
              {patient?.identifier?.[0]?.value && (
                <span>ID: <strong className="text-gray-700 font-mono">{patient.identifier[0].value}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-8 border-l border-gray-200 mx-1" />

        {/* Encounter info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-600">
          <span className="font-medium text-gray-800">{encounterReason}</span>
          {encounter && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                encounter.status === 'in-progress'
                  ? 'bg-blue-100 text-blue-800'
                  : (encounter.status as string) === 'finished' || encounter.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {encounter.status}
            </span>
          )}
          {encounter?.actualPeriod?.start && (
            <span className="text-xs text-gray-400">{formatDT(encounter.actualPeriod.start)}</span>
          )}
        </div>

        {/* Actions on the right */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {isEditable && (
            <Link
              to={`/patient/${patientId}/encounter/${encounterId}/consult`}
              className="text-xs bg-amber-500 text-white font-semibold px-3 py-1.5 rounded-md hover:bg-amber-600 transition-colors"
            >
              Open Consult Wizard →
            </Link>
          )}
          <Link
            to="/queue"
            className="text-xs bg-gray-100 text-gray-700 font-medium px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
          >
            ← Queue
          </Link>
        </div>
      </div>

      {/* ── Body: sidebar + content ────────────────────────────────────────── */}
      <div className="flex flex-1">

        {/* Left sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-10' : 'w-52'} flex-shrink-0 border-r border-gray-200 bg-gray-50 sticky top-[52px] self-start h-[calc(100vh-52px)] overflow-y-auto hidden md:flex flex-col transition-all duration-200`}>
          <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'} p-1.5`}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded text-sm leading-none"
              title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>
          {!sidebarCollapsed && (
            <nav className="py-1 flex-1 overflow-y-auto">
              {SIDEBAR_SECTIONS.map(({ id, label, icon, indent }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-2.5 ${indent ? 'pl-8 pr-4' : 'px-4'} py-2 text-sm text-left transition-colors ${
                    activeSection === id
                      ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600'
                      : indent
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                >
                  <span className="text-xs w-5 text-center flex-shrink-0 opacity-70">{icon}</span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </nav>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-5 py-5">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* ── Patient Notes ── */}
              {activeSection === 'notes' && (
                <div>
                  <div className="mb-5">
                    <h2 className="text-lg font-bold text-gray-800">Consultation Notes</h2>
                    <p className="text-sm text-gray-500 mt-1">{encounterReason}</p>
                  </div>

                  {isEditable ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Clinical Notes</label>
                        <textarea
                          rows={12}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Document your consultation notes here (SOAP format, clinical findings, plan...)..."
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                      </div>
                      {noteError && <p className="text-sm text-red-600">{noteError}</p>}
                      <button
                        onClick={handleSaveNote}
                        disabled={isSavingNote}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {isSavingNote ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                  ) : (() => {
                    const hasAnyData = !!(noteText || vitals.length || examFindings.length || conditions.length ||
                      labOrders.length || radOrders.length || labReports.length || radReports.length ||
                      medications.length || procedures.length || carePlans.length);
                    const NotesSectionHeading = ({ children }: { children: React.ReactNode }) => (
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-100 pb-1">{children}</h3>
                    );
                    if (!hasAnyData) {
                      return <EmptyNote label="No consultation notes recorded." />;
                    }
                    return (
                      <div className="space-y-8">
                        {/* Notes header */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
                          <div>
                            <div className="font-semibold text-gray-800">{encounterReason}</div>
                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                              <span>{formatDT(encounter?.actualPeriod?.start)}</span>
                              {encounter?.status && <StatusPill status={encounter.status} />}
                            </div>
                          </div>
                        </div>

                        {/* Doctor's free-text notes */}
                        <div>
                          <NotesSectionHeading>Doctor's Notes</NotesSectionHeading>
                          {noteText ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{noteText}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">No consultation notes recorded.</p>
                          )}
                        </div>

                        {/* Vitals */}
                        {vitals.length > 0 && (
                          <div>
                            <NotesSectionHeading>Vital Signs</NotesSectionHeading>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {vitals.map((obs) => {
                                const code = obs.code?.coding?.[0]?.code || '';
                                const name = VITAL_LOINC_NAMES[code] || obs.code?.text || obs.code?.coding?.[0]?.display || 'Observation';
                                const val = obs.valueQuantity?.value ?? null;
                                const unit = obs.valueQuantity?.unit || obs.valueString || '';
                                const trend = val !== null ? interpretVital(code, val) : 'normal';
                                return (
                                  <div key={obs.id} className={`border rounded-lg p-3 ${vitalCardCls(trend)}`}>
                                    <div className="text-xs text-gray-500 font-medium mb-1">{name}</div>
                                    <div className={`text-xl font-bold tabular-nums ${vitalValCls(trend)}`}>
                                      {val !== null ? val : obs.valueString || '—'}
                                      <span className="text-sm font-normal ml-1">{obs.valueQuantity ? unit : ''}</span>
                                      {trend === 'critical' && <span className="ml-1 text-red-600 text-sm">!</span>}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">{formatDT(obs.effectiveDateTime)}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Physical Examination */}
                        {examFindings.length > 0 && (
                          <div>
                            <NotesSectionHeading>Physical Examination</NotesSectionHeading>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 border-b border-gray-100">
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">System</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Finding</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Result</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {examFindings.map((obs) => {
                                  const isNormal = obs.interpretation?.[0]?.coding?.[0]?.code === 'N';
                                  return (
                                    <tr key={obs.id}>
                                      <td className="py-2.5 pr-4 font-semibold text-gray-700 whitespace-nowrap w-36">{obs.code?.text || obs.code?.coding?.[0]?.display || '—'}</td>
                                      <td className="py-2.5 pr-4 text-gray-800">{obs.valueString || '—'}</td>
                                      <td className="py-2.5 pr-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isNormal ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {isNormal ? '✓ Normal' : '! Abnormal'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 text-xs text-gray-400">{formatDT(obs.effectiveDateTime)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Assessment / Diagnosis */}
                        {conditions.length > 0 && (
                          <div>
                            <NotesSectionHeading>Assessment / Diagnosis</NotesSectionHeading>
                            <div className="space-y-2">
                              {conditions.map((cond, i) => {
                                const diagText = cond.code?.text || cond.code?.coding?.[0]?.display || '—';
                                const sevCode = cond.severity?.coding?.[0]?.code;
                                const sevText = sevCode === '24484000' ? 'Severe' : sevCode === '6736007' ? 'Moderate' : sevCode === '255604002' ? 'Mild' : undefined;
                                const verifCode = cond.verificationStatus?.coding?.[0]?.code;
                                const clinCode = cond.clinicalStatus?.coding?.[0]?.code;
                                const accCls = sevText === 'Severe' ? 'border-l-4 border-red-500' : sevText === 'Moderate' ? 'border-l-4 border-amber-400' : 'border-l-4 border-gray-200';
                                return (
                                  <div key={cond.id} className={`bg-gray-50 rounded-lg px-4 py-3 ${accCls}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <span className="text-xs font-semibold text-gray-400 mr-2">{i + 1}.</span>
                                        <span className="font-semibold text-gray-900 text-sm">{diagText}</span>
                                        {cond.code?.coding?.[0]?.code && (
                                          <span className="ml-2 text-xs font-mono text-gray-400">[{cond.code.coding[0].code}]</span>
                                        )}
                                      </div>
                                      <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                        {sevText && (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sevText === 'Severe' ? 'bg-red-100 text-red-700' : sevText === 'Moderate' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {sevText}
                                          </span>
                                        )}
                                        {verifCode && <StatusPill status={verifCode} />}
                                        {clinCode && <StatusPill status={clinCode} />}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1 ml-4">Onset: {formatDate(cond.onsetDateTime)}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Lab Orders */}
                        {labOrders.length > 0 && (
                          <div>
                            <NotesSectionHeading>Lab Orders</NotesSectionHeading>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 border-b border-gray-100">
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Test</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Category</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Priority</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {labOrders.map((sr) => (
                                  <tr key={sr.id}>
                                    <td className="py-2.5 pr-4 font-semibold text-gray-800">{(sr.code as any)?.concept?.text || '—'}</td>
                                    <td className="py-2.5 pr-4 text-xs text-gray-500">{(sr.code as any)?.concept?.coding?.[0]?.display || '—'}</td>
                                    <td className="py-2.5 pr-4"><StatusPill status={sr.priority || 'routine'} /></td>
                                    <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(sr.authoredOn)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Radiology Orders */}
                        {radOrders.length > 0 && (
                          <div>
                            <NotesSectionHeading>Radiology Orders</NotesSectionHeading>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 border-b border-gray-100">
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Study</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Priority</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {radOrders.map((sr) => (
                                  <tr key={sr.id}>
                                    <td className="py-2.5 pr-4 font-semibold text-gray-800">{(sr.code as any)?.concept?.text || '—'}</td>
                                    <td className="py-2.5 pr-4"><StatusPill status={sr.priority || 'routine'} /></td>
                                    <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(sr.authoredOn)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Lab Results */}
                        {labReports.length > 0 && (
                          <div>
                            <NotesSectionHeading>Lab Results</NotesSectionHeading>
                            <div className="space-y-3">
                              {labReports.map((dr) => (
                                <div key={dr.id} className="border border-gray-200 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-800 text-sm">{dr.code?.text || dr.code?.coding?.[0]?.display || 'Lab Report'}</span>
                                    <div className="flex items-center gap-2">
                                      <StatusPill status={dr.status} />
                                      <span className="text-xs text-gray-400">{formatDT(dr.issued)}</span>
                                    </div>
                                  </div>
                                  {dr.conclusion && <p className="text-sm text-gray-700 mt-1">{dr.conclusion}</p>}
                                  {dr.result && dr.result.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-1">{dr.result.length} observation(s) linked</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Radiology Reports */}
                        {radReports.length > 0 && (
                          <div>
                            <NotesSectionHeading>Radiology Reports</NotesSectionHeading>
                            <div className="space-y-3">
                              {radReports.map((dr) => (
                                <div key={dr.id} className="border border-gray-200 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-800 text-sm">{dr.code?.text || dr.code?.coding?.[0]?.display || 'Radiology Report'}</span>
                                    <div className="flex items-center gap-2">
                                      <StatusPill status={dr.status} />
                                      <span className="text-xs text-gray-400">{formatDT(dr.issued)}</span>
                                    </div>
                                  </div>
                                  {dr.conclusion && <p className="text-sm text-gray-700 mt-1">{dr.conclusion}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Medications */}
                        {medications.length > 0 && (
                          <div>
                            <NotesSectionHeading>Medications</NotesSectionHeading>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 border-b border-gray-100">
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Drug</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Dosage</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {medications.map((med) => (
                                  <tr key={med.id}>
                                    <td className="py-2.5 pr-4 font-semibold text-gray-800">{(med.medication as any)?.concept?.text || (med.medication as any)?.concept?.coding?.[0]?.display || '—'}</td>
                                    <td className="py-2.5 pr-4 text-xs text-gray-600">{med.dosageInstruction?.[0]?.text || '—'}</td>
                                    <td className="py-2.5 pr-4"><StatusPill status={med.status} /></td>
                                    <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(med.authoredOn)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Procedures */}
                        {procedures.length > 0 && (
                          <div>
                            <NotesSectionHeading>Procedures</NotesSectionHeading>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 border-b border-gray-100">
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Procedure</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Performed</th>
                                  <th className="text-left pb-2 font-semibold uppercase tracking-wider">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {procedures.map((proc) => (
                                  <tr key={proc.id}>
                                    <td className="py-2.5 pr-4 font-semibold text-gray-800">{proc.code?.text || proc.code?.coding?.[0]?.display || '—'}</td>
                                    <td className="py-2.5 pr-4"><StatusPill status={proc.status} /></td>
                                    <td className="py-2.5 pr-4 text-xs text-gray-400 whitespace-nowrap">{formatDT((proc as any).occurrenceDateTime || proc.occurrencePeriod?.start)}</td>
                                    <td className="py-2.5 text-xs text-gray-600">{proc.note?.[0]?.text || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Care Plan */}
                        {carePlans.length > 0 && (
                          <div>
                            <NotesSectionHeading>Care Plan</NotesSectionHeading>
                            <div className="space-y-3">
                              {carePlans.map((cp) => (
                                <div key={cp.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-gray-900 text-sm">{cp.title || 'Care Plan'}</span>
                                    <div className="flex items-center gap-2">
                                      <StatusPill status={cp.status} />
                                      <span className="text-xs text-gray-400">{formatDate(cp.created)}</span>
                                    </div>
                                  </div>
                                  {cp.description && <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{cp.description}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Vital Signs ── */}
              {activeSection === 'vitals' && (
                <Section
                  sectionKey="vitals"
                  icon="V"
                  title="Vital Signs"
                  count={vitals.length}
                  isEditable={isEditable}
                  addLabel="Record Vitals"
                  addForm={<AddVitalsForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = vitals.filter((obs) => {
                      const code = obs.code?.coding?.[0]?.code || '';
                      const name = VITAL_LOINC_NAMES[code] || obs.code?.text || obs.code?.coding?.[0]?.display || '';
                      return name.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No vital signs recorded for this encounter." />
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {filtered.map((obs) => {
                          const code = obs.code?.coding?.[0]?.code || '';
                          const name = VITAL_LOINC_NAMES[code] || obs.code?.text || obs.code?.coding?.[0]?.display || 'Observation';
                          const val = obs.valueQuantity?.value ?? null;
                          const unit = obs.valueQuantity?.unit || obs.valueString || '';
                          const trend = val !== null ? interpretVital(code, val) : 'normal';
                          return (
                            <div key={obs.id} className={`border rounded-lg p-3 ${vitalCardCls(trend)}`}>
                              <div className="text-xs text-gray-500 font-medium mb-1">{name}</div>
                              <div className={`text-xl font-bold tabular-nums ${vitalValCls(trend)}`}>
                                {val !== null ? val : obs.valueString || '—'}
                                <span className="text-sm font-normal ml-1">{obs.valueQuantity ? unit : ''}</span>
                                {trend === 'critical' && <span className="ml-1 text-red-600 text-sm">!</span>}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">{formatDT(obs.effectiveDateTime)}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Section>
              )}

              {/* ── Physical Examination ── */}
              {activeSection === 'exam' && (
                <Section
                  sectionKey="exam"
                  icon="E"
                  title="Physical Examination"
                  count={examFindings.length}
                  isEditable={isEditable}
                  addLabel="Add Finding"
                  addForm={<AddExamForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = examFindings.filter((obs) => {
                      const text = obs.code?.text || obs.code?.coding?.[0]?.display || obs.valueString || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No examination findings recorded." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">System</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Finding</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Result</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Time</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((obs) => {
                            const system = obs.code?.text || obs.code?.coding?.[0]?.display || '—';
                            const finding = obs.valueString || '—';
                            const isNormal = obs.interpretation?.[0]?.coding?.[0]?.code === 'N';
                            const loincCode = obs.code?.coding?.[0]?.code;
                            const interpCode = obs.interpretation?.[0]?.coding?.[0]?.code;
                            return (
                              <React.Fragment key={obs.id}>
                                <tr
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => setExpandedId(expandedId === obs.id ? null : (obs.id ?? null))}
                                >
                                  <td className="py-2.5 pr-4 font-semibold text-gray-700 whitespace-nowrap w-36">{system}</td>
                                  <td className="py-2.5 pr-4 text-gray-800">{finding}</td>
                                  <td className="py-2.5 pr-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isNormal ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {isNormal ? '✓ Normal' : '! Abnormal'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(obs.effectiveDateTime)}</td>
                                  <td className="py-2.5 text-xs text-gray-400">{expandedId === obs.id ? '▲' : '▼'}</td>
                                </tr>
                                {expandedId === obs.id && (
                                  <tr>
                                    <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                        {loincCode && <div><span className="text-gray-500 font-medium">LOINC:</span> <span className="font-mono">{loincCode}</span></div>}
                                        {interpCode && <div><span className="text-gray-500 font-medium">Interpretation Code:</span> {interpCode}</div>}
                                        <div><span className="text-gray-500 font-medium">Date/Time:</span> {formatDT(obs.effectiveDateTime)}</div>
                                        {obs.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {obs.note[0].text}</div>}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Investigations (parent overview) ── */}
              {activeSection === 'investigations' && (
                <Section
                  sectionKey="investigations"
                  icon="Ix"
                  title="Investigations"
                  count={serviceRequests.length + labReports.length + radReports.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Lab Orders', count: labOrders.length, section: 'lab-orders', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                      { label: 'Rad Orders', count: radOrders.length, section: 'rad-orders', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                      { label: 'Lab Results', count: labReports.length, section: 'lab-results', color: 'bg-green-50 border-green-200 text-green-700' },
                      { label: 'Rad Reports', count: radReports.length, section: 'rad-reports', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                    ].map(({ label, count, section, color }) => (
                      <button
                        key={label}
                        onClick={() => setActiveSection(section)}
                        className={`border rounded-lg p-3 text-left hover:opacity-80 transition-opacity ${color}`}
                      >
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-xs font-medium mt-0.5">{label}</div>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Lab Orders ── */}
              {activeSection === 'lab-orders' && (
                <Section
                  sectionKey="investigations"
                  icon="🔬"
                  title="Lab Orders"
                  count={labOrders.length}
                  isEditable={isEditable}
                  addLabel="Place Lab Order"
                  addForm={<AddOrderForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = labOrders.filter((sr) => {
                      const text = (sr.code as any)?.concept?.text || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No lab orders placed for this encounter." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Test</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Category</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Priority</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((sr) => (
                            <React.Fragment key={sr.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === sr.id ? null : (sr.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">{(sr.code as any)?.concept?.text || '—'}</td>
                                <td className="py-2.5 pr-4 text-xs text-gray-500">{(sr.code as any)?.concept?.coding?.[0]?.display || '—'}</td>
                                <td className="py-2.5 pr-4"><StatusPill status={sr.priority || 'routine'} /></td>
                                <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(sr.authoredOn)}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === sr.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === sr.id && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      <div><span className="text-gray-500 font-medium">Authored On:</span> {formatDT(sr.authoredOn)}</div>
                                      <div><span className="text-gray-500 font-medium">Priority:</span> {sr.priority || 'routine'}</div>
                                      {sr.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Notes:</span> {sr.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Rad Orders ── */}
              {activeSection === 'rad-orders' && (
                <Section
                  sectionKey="investigations"
                  icon="📷"
                  title="Radiology Orders"
                  count={radOrders.length}
                  isEditable={isEditable}
                  addLabel="Place Radiology Order"
                  addForm={<AddOrderForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = radOrders.filter((sr) => {
                      const text = (sr.code as any)?.concept?.text || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No radiology orders placed for this encounter." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Study</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Priority</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((sr) => (
                            <React.Fragment key={sr.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === sr.id ? null : (sr.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">{(sr.code as any)?.concept?.text || '—'}</td>
                                <td className="py-2.5 pr-4"><StatusPill status={sr.priority || 'routine'} /></td>
                                <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(sr.authoredOn)}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === sr.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === sr.id && (
                                <tr>
                                  <td colSpan={4} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      <div><span className="text-gray-500 font-medium">Authored On:</span> {formatDT(sr.authoredOn)}</div>
                                      {sr.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Notes:</span> {sr.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Lab Results ── */}
              {activeSection === 'lab-results' && (
                <Section
                  sectionKey="investigations"
                  icon="🧪"
                  title="Lab Results"
                  count={labReports.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = labReports.filter((dr) => {
                      const text = dr.code?.text || dr.code?.coding?.[0]?.display || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No lab results available for this encounter." />
                    ) : (
                      <div className="space-y-3">
                        {filtered.map((dr) => (
                          <div
                            key={dr.id}
                            className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-300 transition-colors"
                            onClick={() => setExpandedId(expandedId === dr.id ? null : (dr.id ?? null))}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-gray-800 text-sm">
                                {dr.code?.text || dr.code?.coding?.[0]?.display || 'Lab Report'}
                              </span>
                              <div className="flex items-center gap-2">
                                <StatusPill status={dr.status} />
                                <span className="text-xs text-gray-400">{formatDT(dr.issued)}</span>
                                <span className="text-xs text-gray-400">{expandedId === dr.id ? '▲' : '▼'}</span>
                              </div>
                            </div>
                            {dr.conclusion && <p className="text-sm text-gray-700 mt-1">{dr.conclusion}</p>}
                            {dr.result && dr.result.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">{dr.result.length} observation(s) linked</div>
                            )}
                            {expandedId === dr.id && (
                              <div className="mt-3 pt-3 border-t border-blue-100 bg-blue-50 -mx-4 -mb-4 px-4 pb-3 rounded-b-lg">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                  {dr.result && <div><span className="text-gray-500 font-medium">Result References:</span> {dr.result.length}</div>}
                                  {dr.performer?.[0]?.display && <div><span className="text-gray-500 font-medium">Presenter:</span> {dr.performer[0].display}</div>}
                                  {dr.category?.[0]?.text && <div><span className="text-gray-500 font-medium">Category:</span> {dr.category[0].text}</div>}
                                  {(dr.effectivePeriod?.start || dr.effectivePeriod?.end) && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500 font-medium">Effective Period:</span>{' '}
                                      {formatDT(dr.effectivePeriod?.start)} – {formatDT(dr.effectivePeriod?.end)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </Section>
              )}

              {/* ── Rad Reports ── */}
              {activeSection === 'rad-reports' && (
                <Section
                  sectionKey="investigations"
                  icon="📡"
                  title="Radiology Reports"
                  count={radReports.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = radReports.filter((dr) => {
                      const text = dr.code?.text || dr.code?.coding?.[0]?.display || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No radiology reports available for this encounter." />
                    ) : (
                      <div className="space-y-3">
                        {filtered.map((dr) => (
                          <div
                            key={dr.id}
                            className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-300 transition-colors"
                            onClick={() => setExpandedId(expandedId === dr.id ? null : (dr.id ?? null))}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-gray-800 text-sm">
                                {dr.code?.text || dr.code?.coding?.[0]?.display || 'Radiology Report'}
                              </span>
                              <div className="flex items-center gap-2">
                                <StatusPill status={dr.status} />
                                <span className="text-xs text-gray-400">{formatDT(dr.issued)}</span>
                                <span className="text-xs text-gray-400">{expandedId === dr.id ? '▲' : '▼'}</span>
                              </div>
                            </div>
                            {dr.conclusion && <p className="text-sm text-gray-700 mt-1">{dr.conclusion}</p>}
                            {expandedId === dr.id && (
                              <div className="mt-3 pt-3 border-t border-blue-100 bg-blue-50 -mx-4 -mb-4 px-4 pb-3 rounded-b-lg">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                  {dr.performer?.[0]?.display && <div><span className="text-gray-500 font-medium">Performer:</span> {dr.performer[0].display}</div>}
                                  {(dr.effectivePeriod?.start || dr.effectivePeriod?.end) && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500 font-medium">Effective Period:</span>{' '}
                                      {formatDT(dr.effectivePeriod?.start)} – {formatDT(dr.effectivePeriod?.end)}
                                    </div>
                                  )}
                                  {dr.conclusion && <div className="col-span-2"><span className="text-gray-500 font-medium">Conclusion:</span> {dr.conclusion}</div>}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </Section>
              )}

              {/* ── Assessment ── */}
              {activeSection === 'assessment' && (
                <Section
                  sectionKey="assessment"
                  icon="Dx"
                  title="Assessment / Diagnosis"
                  count={conditions.length}
                  isEditable={isEditable}
                  addLabel="Add Diagnosis"
                  addForm={<AddDiagnosisForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = conditions.filter((cond) => {
                      const text = cond.code?.text || cond.code?.coding?.[0]?.display || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No diagnoses recorded." />
                    ) : (
                      <div className="space-y-2">
                        {filtered.map((cond, i) => {
                          const diagText = cond.code?.text || cond.code?.coding?.[0]?.display || '—';
                          const sevCode = cond.severity?.coding?.[0]?.code;
                          const sevText = sevCode === '24484000' ? 'Severe' : sevCode === '6736007' ? 'Moderate' : sevCode === '255604002' ? 'Mild' : undefined;
                          const verifCode = cond.verificationStatus?.coding?.[0]?.code;
                          const clinCode = cond.clinicalStatus?.coding?.[0]?.code;
                          const accCls = sevText === 'Severe' ? 'border-l-4 border-red-500' : sevText === 'Moderate' ? 'border-l-4 border-amber-400' : 'border-l-4 border-gray-200';
                          return (
                            <div
                              key={cond.id}
                              className={`bg-gray-50 rounded-lg px-4 py-3 ${accCls} cursor-pointer hover:bg-gray-100 transition-colors`}
                              onClick={() => setExpandedId(expandedId === cond.id ? null : (cond.id ?? null))}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-xs font-semibold text-gray-400 mr-2">{i + 1}.</span>
                                  <span className="font-semibold text-gray-900 text-sm">{diagText}</span>
                                  {cond.code?.coding?.[0]?.code && (
                                    <span className="ml-2 text-xs font-mono text-gray-400">[{cond.code.coding[0].code}]</span>
                                  )}
                                </div>
                                <div className="flex gap-1.5 flex-shrink-0 flex-wrap items-center justify-end">
                                  {sevText && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sevText === 'Severe' ? 'bg-red-100 text-red-700' : sevText === 'Moderate' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                      {sevText}
                                    </span>
                                  )}
                                  {verifCode && <StatusPill status={verifCode} />}
                                  {clinCode && <StatusPill status={clinCode} />}
                                  <span className="text-xs text-gray-400 ml-1">{expandedId === cond.id ? '▲' : '▼'}</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-400 mt-1 ml-4">Onset: {formatDate(cond.onsetDateTime)}</div>
                              {expandedId === cond.id && (
                                <div className="mt-3 pt-3 border-t border-blue-100 bg-blue-50 -mx-4 -mb-3 px-4 pb-3 rounded-b-lg">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                    {cond.code?.coding?.[0]?.code && <div><span className="text-gray-500 font-medium">Code:</span> <span className="font-mono">{cond.code.coding[0].system?.includes('snomed') ? 'SNOMED ' : ''}{cond.code.coding[0].code}</span></div>}
                                    {cond.onsetDateTime && <div><span className="text-gray-500 font-medium">Onset:</span> {formatDate(cond.onsetDateTime)}</div>}
                                    {(cond as any).recorder?.display && <div><span className="text-gray-500 font-medium">Recorder:</span> {(cond as any).recorder.display}</div>}
                                    {cond.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {cond.note[0].text}</div>}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Section>
              )}

              {/* ── Medications (parent overview) ── */}
              {activeSection === 'medications' && (
                <Section
                  sectionKey="medications"
                  icon="Rx"
                  title="Medications"
                  count={medications.length + medicationDispenses.length + medicationStatements.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Medication Requests', count: medications.length, section: 'medication-request', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                      { label: 'Medication Dispenses', count: medicationDispenses.length, section: 'medication-dispense', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                      { label: 'Medication Statements', count: medicationStatements.length, section: 'medication-statement', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                    ].map(({ label, count, section, color }) => (
                      <button
                        key={label}
                        onClick={() => setActiveSection(section)}
                        className={`border rounded-lg p-3 text-left hover:opacity-80 transition-opacity ${color}`}
                      >
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-xs font-medium mt-0.5">{label}</div>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Medication Request ── */}
              {activeSection === 'medication-request' && (
                <Section
                  sectionKey="management"
                  icon="💊"
                  title="Medication Requests"
                  count={medications.length}
                  isEditable={isEditable}
                  addLabel="Add Medication"
                  addForm={<AddMedicationForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = medications.filter((med) => {
                      const text = (med.medication as any)?.concept?.text || (med.medication as any)?.concept?.coding?.[0]?.display || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No medication requests recorded." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Drug</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Dosage</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ordered</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((med) => (
                            <React.Fragment key={med.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === med.id ? null : (med.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">
                                  {(med.medication as any)?.concept?.text || (med.medication as any)?.concept?.coding?.[0]?.display || '—'}
                                </td>
                                <td className="py-2.5 pr-4 text-xs text-gray-600">{med.dosageInstruction?.[0]?.text || '—'}</td>
                                <td className="py-2.5 pr-4"><StatusPill status={med.status} /></td>
                                <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(med.authoredOn)}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === med.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === med.id && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      {med.dosageInstruction?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Full Dosage:</span> {med.dosageInstruction[0].text}</div>}
                                      {med.dosageInstruction?.[0]?.route?.coding?.[0]?.display && <div><span className="text-gray-500 font-medium">Route:</span> {med.dosageInstruction[0].route.coding[0].display}</div>}
                                      {med.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity && (
                                        <div>
                                          <span className="text-gray-500 font-medium">Dose:</span>{' '}
                                          {med.dosageInstruction[0].doseAndRate[0].doseQuantity.value} {med.dosageInstruction[0].doseAndRate[0].doseQuantity.unit}
                                        </div>
                                      )}
                                      {med.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {med.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Medication Dispense ── */}
              {activeSection === 'medication-dispense' && (
                <Section
                  sectionKey="management"
                  icon="💊"
                  title="Medication Dispenses"
                  count={medicationDispenses.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = medicationDispenses.filter((disp) => {
                      const text = (disp.medication as any)?.concept?.text || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No medication dispenses recorded." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Drug</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Quantity</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Date</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((disp) => (
                            <React.Fragment key={disp.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === disp.id ? null : (disp.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">
                                  {(disp.medication as any)?.concept?.text || (disp.medication as any)?.concept?.coding?.[0]?.display || '—'}
                                </td>
                                <td className="py-2.5 pr-4 text-xs text-gray-600">
                                  {disp.quantity?.value ? `${disp.quantity.value} ${disp.quantity.unit || ''}` : '—'}
                                </td>
                                <td className="py-2.5 pr-4"><StatusPill status={disp.status} /></td>
                                <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT(disp.whenHandedOver)}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === disp.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === disp.id && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      {disp.quantity && <div><span className="text-gray-500 font-medium">Quantity:</span> {disp.quantity.value} {disp.quantity.unit}</div>}
                                      {(disp as any).daysSupply?.value && <div><span className="text-gray-500 font-medium">Days Supply:</span> {(disp as any).daysSupply.value}</div>}
                                      {disp.whenHandedOver && <div><span className="text-gray-500 font-medium">When Handed Over:</span> {formatDT(disp.whenHandedOver)}</div>}
                                      {disp.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {disp.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Medication Statement ── */}
              {activeSection === 'medication-statement' && (
                <Section
                  sectionKey="management"
                  icon="💊"
                  title="Medication Statements"
                  count={medicationStatements.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = medicationStatements.filter((stmt) => {
                      const text = (stmt.medication as any)?.concept?.text || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No medication statements recorded." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Drug</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Dosage</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Date</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((stmt) => (
                            <React.Fragment key={stmt.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === stmt.id ? null : (stmt.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">
                                  {(stmt.medication as any)?.concept?.text || (stmt.medication as any)?.concept?.coding?.[0]?.display || '—'}
                                </td>
                                <td className="py-2.5 pr-4 text-xs text-gray-600">{stmt.dosage?.[0]?.text || '—'}</td>
                                <td className="py-2.5 pr-4"><StatusPill status={stmt.status} /></td>
                                <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDT((stmt as any).dateAsserted)}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === stmt.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === stmt.id && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      {stmt.dosage?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Dosage:</span> {stmt.dosage[0].text}</div>}
                                      {(stmt as any).effectivePeriod?.start && <div><span className="text-gray-500 font-medium">Effective Start:</span> {formatDate((stmt as any).effectivePeriod.start)}</div>}
                                      {(stmt as any).effectivePeriod?.end && <div><span className="text-gray-500 font-medium">Effective End:</span> {formatDate((stmt as any).effectivePeriod.end)}</div>}
                                      {stmt.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {stmt.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Procedure ── */}
              {activeSection === 'procedure' && (
                <Section
                  sectionKey="procedure"
                  icon="⚕️"
                  title="Procedures"
                  count={procedures.length}
                  isEditable={false}
                  addLabel=""
                  addForm={null}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = procedures.filter((proc) => {
                      const text = proc.code?.text || proc.code?.coding?.[0]?.display || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No procedures recorded for this encounter." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Procedure</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Status</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Performed</th>
                            <th className="text-left pb-2 font-semibold uppercase tracking-wider">Notes</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((proc) => (
                            <React.Fragment key={proc.id}>
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === proc.id ? null : (proc.id ?? null))}
                              >
                                <td className="py-2.5 pr-4 font-semibold text-gray-800">
                                  {proc.code?.text || proc.code?.coding?.[0]?.display || '—'}
                                </td>
                                <td className="py-2.5 pr-4"><StatusPill status={proc.status} /></td>
                                <td className="py-2.5 pr-4 text-xs text-gray-400 whitespace-nowrap">
                                  {formatDT((proc as any).occurrenceDateTime || proc.occurrencePeriod?.start)}
                                </td>
                                <td className="py-2.5 text-xs text-gray-600">{proc.note?.[0]?.text || '—'}</td>
                                <td className="py-2.5 text-xs text-gray-400">{expandedId === proc.id ? '▲' : '▼'}</td>
                              </tr>
                              {expandedId === proc.id && (
                                <tr>
                                  <td colSpan={5} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                      {proc.code?.coding?.[0]?.code && <div><span className="text-gray-500 font-medium">SNOMED Code:</span> <span className="font-mono">{proc.code.coding[0].code}</span></div>}
                                      {(proc as any).location?.display && <div><span className="text-gray-500 font-medium">Location:</span> {(proc as any).location.display}</div>}
                                      {proc.performer?.[0]?.actor?.display && <div><span className="text-gray-500 font-medium">Performer:</span> {proc.performer[0].actor.display}</div>}
                                      {proc.note?.[0]?.text && <div className="col-span-2"><span className="text-gray-500 font-medium">Note:</span> {proc.note[0].text}</div>}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </Section>
              )}

              {/* ── Care Plan ── */}
              {activeSection === 'care-plan' && (
                <Section
                  sectionKey="care-plan"
                  icon="📝"
                  title="Care Plan"
                  count={carePlans.length}
                  isEditable={isEditable}
                  addLabel="Add Care Plan"
                  addForm={<AddCarePlanForm {...formProps} />}
                >
                  <FilterBar value={filterText} onChange={setFilterText} />
                  {(() => {
                    const filtered = carePlans.filter((cp) => {
                      const text = cp.title || cp.description || '';
                      return text.toLowerCase().includes(filterText.toLowerCase());
                    });
                    return filtered.length === 0 ? (
                      <EmptyNote label="No care plan recorded for this encounter." />
                    ) : (
                      <div className="space-y-3">
                        {filtered.map((cp) => (
                          <div key={cp.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-gray-900 text-sm">{cp.title || 'Care Plan'}</span>
                              <div className="flex items-center gap-2">
                                <StatusPill status={cp.status} />
                                <span className="text-xs text-gray-400">{formatDate(cp.created)}</span>
                              </div>
                            </div>
                            {cp.description && <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{cp.description}</p>}
                            {cp.note?.[0]?.text && (
                              <div className="mt-2 border-t border-emerald-100 pt-2">
                                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{cp.note[0].text}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </Section>
              )}

              {/* ── Inpatient Admission ── */}
              {activeSection === 'admission' && (
                <Section
                  sectionKey="admission"
                  icon="Adm"
                  title="Inpatient Admission"
                  count={inpatientAdmission ? 1 : 0}
                  isEditable={isEditable && !inpatientAdmission}
                  addLabel="Admit Patient"
                  addForm={<AddAdmissionForm {...formProps} diagnosisItems={diagnosisItemsForAdmission} />}
                >
                  {!inpatientAdmission ? (
                    <EmptyNote label="No inpatient admission linked to this encounter." />
                  ) : (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-200 text-orange-800 uppercase tracking-wide">Inpatient</span>
                        <StatusPill status={inpatientAdmission.status} />
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Admission</div>
                          <div className="font-medium text-gray-800">{formatDT(inpatientAdmission.actualPeriod?.start)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Planned Discharge</div>
                          <div className="font-medium text-gray-800">{formatDT(inpatientAdmission.actualPeriod?.end)}</div>
                        </div>
                        {(inpatientAdmission as any).reason?.[0]?.value?.[0]?.concept?.text && (
                          <div className="col-span-2">
                            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Reason for Admission</div>
                            <div className="text-gray-800">{(inpatientAdmission as any).reason[0].value[0].concept.text}</div>
                          </div>
                        )}
                        {inpatientAdmission.diagnosis?.[0]?.condition?.[0]?.reference?.display && (
                          <div className="col-span-2">
                            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Admission Diagnosis</div>
                            <div className="text-gray-800">{inpatientAdmission.diagnosis[0].condition[0].reference.display}</div>
                          </div>
                        )}
                        <div className="col-span-2 text-xs font-mono text-gray-400">Encounter ID: {inpatientAdmission.id}</div>
                      </div>
                    </div>
                  )}
                </Section>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between pb-8">
            <div className="flex gap-2">
              <Link to="/queue" className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-5 rounded-md transition-colors text-sm">
                ← Queue
              </Link>
              <Link to={`/patient/${patientId}/encounter`} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-5 rounded-md transition-colors text-sm">
                Visit History
              </Link>
            </div>
            {isEditable && (
              <Link to={`/patient/${patientId}/encounter/${encounterId}/consult`} className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-5 rounded-md transition-colors text-sm">
                Open Full Consult Wizard →
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};


export default ConsultNoteDetailPage;
