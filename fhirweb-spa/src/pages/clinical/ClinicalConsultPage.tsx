import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useGetPatientQuery,
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useSearchByEncounterQuery,
} from '../../services/fhir/client';
import { Encounter } from 'fhir/r5';
import type { Observation, ServiceRequest, Condition, MedicationRequest, CarePlan } from 'fhir/r5';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId =
  | 'vitals'
  | 'exam'
  | 'lab'
  | 'rad'
  | 'assessment'
  | 'management';

interface RecordedItem {
  id: string;
  display: string;
  note?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: { id: TabId; label: string; step: number; icon: string }[] = [
  { id: 'vitals', label: 'Vital Signs', step: 1, icon: '♥' },
  { id: 'exam', label: 'Physical Exam', step: 2, icon: 'E' },
  { id: 'lab', label: 'Lab Investigations', step: 3, icon: '🧪' },
  { id: 'rad', label: 'Radiology Orders', step: 4, icon: '📡' },
  { id: 'assessment', label: 'Assessment', step: 5, icon: 'Dx' },
  { id: 'management', label: 'Management', step: 6, icon: 'Rx' },
];

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

const LAB_CATEGORIES = [
  { display: 'Haematology', code: '252275004' },
  { display: 'Biochemistry', code: '59524001' },
  { display: 'Immunology / Serology', code: '252276003' },
  { display: 'Microbiology', code: '19851009' },
  { display: 'Cardiology', code: '394579002' },
  { display: 'Pulmonology', code: '394607009' },
  { display: 'Other', code: '74728003' },
];

const RAD_CATEGORIES = [
  { display: 'Radiology / Imaging', code: '394914008' },
];

const INVESTIGATION_CATEGORIES = [...LAB_CATEGORIES, ...RAD_CATEGORIES];

const VITALS_PANEL_LOINC = '85353-1';

const VITAL_CODE_TO_FIELD: Record<string, string> = {
  '59408-5': 'spo2',
  '2708-6': 'spo2',  // backward compat
  '8867-4': 'hr',
  '8480-6': 'sbp',
  '8462-4': 'dbp',
  '9279-1': 'rr',
  '8310-5': 'temp',
};

const SEVERITY_SNOMED = {
  mild: { code: '255604002', display: 'Mild' },
  moderate: { code: '6736007', display: 'Moderate' },
  severe: { code: '24484000', display: 'Severe' },
};

const ROUTE_SNOMED: Record<string, { code: string; display: string }> = {
  oral: { code: '26643006', display: 'Oral route' },
  IV: { code: '47625008', display: 'Intravenous route' },
  IM: { code: '78421000', display: 'Intramuscular route' },
  SC: { code: '34206005', display: 'Subcutaneous route' },
  topical: { code: '6064005', display: 'Topical route' },
  inhaled: { code: '18679011000001101', display: 'Inhalation route' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const toFHIRDateTime = (localDT: string): string => {
  const d = new Date(localDT);
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const h = String(Math.abs(Math.floor(off / 60))).padStart(2, '0');
  const m = String(Math.abs(off % 60)).padStart(2, '0');
  return `${localDT}:00${sign}${h}:${m}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ExistingRecords: React.FC<{
  items: RecordedItem[];
  label: string;
  onAddMore: () => void;
}> = ({ items, label, onAddMore }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label} ({items.length})
      </h4>
      <button
        onClick={onAddMore}
        className="text-xs font-semibold text-blue-600 border border-blue-300 px-3 py-1 rounded-md hover:bg-blue-50 transition-colors"
      >
        + Add More
      </button>
    </div>
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2">
          <span className="font-medium text-gray-700">{item.display}</span>
          {item.note && <span className="text-gray-500 text-xs flex-shrink-0">{item.note}</span>}
        </li>
      ))}
    </ul>
  </div>
);

const RecordedList: React.FC<{ items: RecordedItem[]; emptyLabel: string }> = ({
  items,
  emptyLabel,
}) => (
  <div className="mt-5 border-t border-gray-100 pt-4">
    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
      Recorded this session ({items.length})
    </h4>
    {items.length === 0 ? (
      <p className="text-sm text-gray-400 italic">{emptyLabel}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2"
          >
            <span className="font-medium text-gray-700">{item.display}</span>
            {item.note && (
              <span className="text-gray-500 text-xs flex-shrink-0">
                {item.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const ErrorBox: React.FC<{ msg: string }> = ({ msg }) =>
  msg ? (
    <div className="bg-red-50 border border-red-300 text-red-700 rounded-md p-3 text-sm mt-3">
      {msg}
    </div>
  ) : null;

const fieldCls =
  'w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

// ─── Main Component ───────────────────────────────────────────────────────────

const ClinicalConsultPage: React.FC = () => {
  const { id: patientId, encounterId } = useParams<{
    id: string;
    encounterId: string;
  }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('vitals');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createResource, { isLoading: isCreating }] =
    useCreateResourceMutation();
  const [updateResource, { isLoading: isFinishing }] =
    useUpdateResourceMutation();

  const { data: patient } = useGetPatientQuery(patientId!);
  const { data: encounterResource } = useGetResourceByIdQuery(
    { resourceType: 'Encounter', id: encounterId! },
    { skip: !encounterId },
  );
  const encounter = encounterResource as Encounter | undefined;

  const { data: obsBundle, isLoading: obsLoading } = useSearchByEncounterQuery(
    { resourceType: 'Observation', encounterId: encounterId! },
    { skip: !encounterId }
  );
  const { data: srBundle, isLoading: srLoading } = useSearchByEncounterQuery(
    { resourceType: 'ServiceRequest', encounterId: encounterId! },
    { skip: !encounterId }
  );
  const { data: condBundle, isLoading: condLoading } = useSearchByEncounterQuery(
    { resourceType: 'Condition', encounterId: encounterId! },
    { skip: !encounterId }
  );
  const { data: medBundle, isLoading: medLoading } = useSearchByEncounterQuery(
    { resourceType: 'MedicationRequest', encounterId: encounterId! },
    { skip: !encounterId }
  );
  const { data: cpBundle, isLoading: cpLoading } = useSearchByEncounterQuery(
    { resourceType: 'CarePlan', encounterId: encounterId! },
    { skip: !encounterId }
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
    'Outpatient Visit';
  const encounterStart = encounter?.actualPeriod?.start
    ? new Date(encounter.actualPeriod.start).toLocaleString()
    : '';

  // Created item state per step
  const [vitalsItems, setVitalsItems] = useState<RecordedItem[]>([]);
  const [examItems, setExamItems] = useState<RecordedItem[]>([]);
  const [labOrderItems, setLabOrderItems] = useState<RecordedItem[]>([]);
  const [radOrderItems, setRadOrderItems] = useState<RecordedItem[]>([]);
  const [diagnosisItems, setDiagnosisItems] = useState<RecordedItem[]>([]);
  const [medicationItems, setMedicationItems] = useState<RecordedItem[]>([]);
  const [carePlanItem, setCarePlanItem] = useState<RecordedItem | null>(null);
  const [rawVitals, setRawVitals] = useState<Observation[]>([]);
  const [isEditingVitals, setIsEditingVitals] = useState(false);

  const preloadedRef = React.useRef(false);

  useEffect(() => {
    if (preloadedRef.current) return;
    if (obsLoading || srLoading || condLoading || medLoading || cpLoading) return;
    preloadedRef.current = true;

    const observations = (obsBundle?.entry?.map((e: any) => e.resource).filter(Boolean) as Observation[]) || [];
    const vitalsFromFHIR = observations.filter(
      (o) => o.category?.[0]?.coding?.[0]?.code === 'vital-signs'
    );
    const examFromFHIR = observations.filter(
      (o) => o.category?.[0]?.coding?.[0]?.code === 'exam'
    );

    const vitalsLoaded: RecordedItem[] = [];
    vitalsFromFHIR.forEach((o) => {
      if (o.component?.length) {
        o.component.forEach((comp) => {
          const name = comp.code?.coding?.[0]?.display || '?';
          const val = comp.valueQuantity?.value ?? '—';
          const unit = comp.valueQuantity?.unit || '';
          vitalsLoaded.push({ id: `${o.id!}-${name}`, display: `${name}: ${val} ${unit}`.trim() });
        });
      } else {
        const name = o.code?.coding?.[0]?.display || o.code?.text || 'Vital';
        const val = o.valueQuantity?.value ?? o.valueString ?? '—';
        const unit = o.valueQuantity?.unit || '';
        vitalsLoaded.push({ id: o.id!, display: `${name}: ${val} ${unit}`.trim() });
      }
    });
    if (vitalsLoaded.length > 0) setVitalsItems(vitalsLoaded);
    setRawVitals(vitalsFromFHIR);

    const examLoaded: RecordedItem[] = examFromFHIR.map((o) => {
      const system = o.code?.text || o.code?.coding?.[0]?.display || 'System';
      const finding = o.valueString || '—';
      const isNormal = o.interpretation?.[0]?.coding?.[0]?.code === 'N';
      return { id: o.id!, display: `[${system}] ${finding}`, note: isNormal ? 'Normal' : 'Abnormal' };
    });
    if (examLoaded.length > 0) setExamItems(examLoaded);

    const serviceRequests = (srBundle?.entry?.map((e: any) => e.resource).filter(Boolean) as ServiceRequest[]) || [];
    const labLoaded: RecordedItem[] = [];
    const radLoaded: RecordedItem[] = [];
    const RAD_SR_CODES = new Set(['394914008', '310061009']);
    const SNOMED_SYS = 'http://snomed.info/sct';
    serviceRequests.forEach((sr) => {
      const catCode =
        sr.category?.[0]?.coding?.find((cd: any) => cd.system === SNOMED_SYS)?.code ??
        (sr.code as any)?.concept?.coding?.[0]?.code ?? '';
      const catDisplay =
        sr.category?.[0]?.coding?.[0]?.display ||
        sr.category?.[0]?.text ||
        (sr.code as any)?.concept?.coding?.[0]?.display || '';
      const testName = (sr.code as any)?.concept?.text || catDisplay || 'Order';
      const item: RecordedItem = {
        id: sr.id!,
        display: testName,
        note: `${catDisplay} · ${sr.priority || 'routine'}`.toUpperCase(),
      };
      if (RAD_SR_CODES.has(catCode)) {
        radLoaded.push(item);
      } else {
        labLoaded.push(item);
      }
    });
    if (labLoaded.length > 0) setLabOrderItems(labLoaded);
    if (radLoaded.length > 0) setRadOrderItems(radLoaded);

    const conditions = (condBundle?.entry?.map((e: any) => e.resource).filter(Boolean) as Condition[]) || [];
    const diagLoaded: RecordedItem[] = conditions.map((c) => {
      const text = c.code?.text || c.code?.coding?.[0]?.display || 'Diagnosis';
      const severity = c.severity?.coding?.[0]?.display || '';
      const verif = c.verificationStatus?.coding?.[0]?.code || '';
      return { id: c.id!, display: text, note: `${severity} · ${verif}`.replace(/^ · | · $/, '') };
    });
    if (diagLoaded.length > 0) setDiagnosisItems(diagLoaded);

    const medReqs = (medBundle?.entry?.map((e: any) => e.resource).filter(Boolean) as MedicationRequest[]) || [];
    const medLoaded: RecordedItem[] = medReqs.map((mr) => {
      const drug = (mr.medication as any)?.concept?.text || 'Medication';
      const dosage = mr.dosageInstruction?.[0]?.text || '';
      return { id: mr.id!, display: drug, note: dosage };
    });
    if (medLoaded.length > 0) setMedicationItems(medLoaded);

    const carePlans = (cpBundle?.entry?.map((e: any) => e.resource).filter(Boolean) as CarePlan[]) || [];
    if (carePlans.length > 0) {
      const cp = carePlans[0];
      setCarePlanItem({ id: cp.id!, display: cp.title || 'Care Plan', note: cp.description || '' });
    }

  }, [obsLoading, srLoading, condLoading, medLoading, cpLoading, obsBundle, srBundle, condBundle, medBundle, cpBundle]);

  const [isAddingMore, setIsAddingMore] = useState<Record<TabId, boolean>>({
    vitals: false, exam: false, lab: false, rad: false, assessment: false, management: false,
  });

  // ── VITALS ────────────────────────────────────────────────────────────────

  const [vitalsForm, setVitalsForm] = useState({
    spo2: '',
    hr: '',
    sbp: '',
    dbp: '',
    rr: '',
    temp: '',
    recordedAt: localNow(),
  });
  const [vitalsError, setVitalsError] = useState('');

  const handleSaveVitals = async () => {
    setVitalsError('');
    const { spo2, hr, sbp, dbp, rr, temp, recordedAt } = vitalsForm;

    const vitalDefs = [
      { code: '59408-5', display: 'SpO₂',             value: spo2, unit: '%',           ucum: '%' },
      { code: '8867-4',  display: 'Heart Rate',        value: hr,   unit: 'beats/min',   ucum: '/min' },
      { code: '8480-6',  display: 'Systolic BP',       value: sbp,  unit: 'mmHg',        ucum: 'mm[Hg]' },
      { code: '8462-4',  display: 'Diastolic BP',      value: dbp,  unit: 'mmHg',        ucum: 'mm[Hg]' },
      { code: '9279-1',  display: 'Respiratory Rate',  value: rr,   unit: 'breaths/min', ucum: '/min' },
      { code: '8310-5',  display: 'Body Temperature',  value: temp, unit: '°C',          ucum: 'Cel' },
    ];

    const components = vitalDefs
      .filter(({ value }) => value && !isNaN(parseFloat(value)))
      .map(({ code, display, value, unit, ucum }) => ({
        code: { coding: [{ system: 'http://loinc.org', code, display }] },
        valueQuantity: { value: parseFloat(value), unit, system: 'http://unitsofmeasure.org', code: ucum },
      }));

    if (components.length === 0) {
      setVitalsError('Enter at least one vital sign value.');
      return;
    }

    const effectiveDateTime = toFHIRDateTime(recordedAt);
    const panelObs = rawVitals.find((o) => o.component?.length);
    let savedObs: any;

    if (panelObs?.id) {
      const updated = { ...panelObs, effectiveDateTime, component: components };
      const result = await updateResource({ resourceType: 'Observation', id: panelObs.id, resource: updated as any });
      if ('data' in result && result.data) {
        savedObs = result.data;
        setRawVitals((prev) => prev.map((o) => (o.id === panelObs.id ? (result.data as Observation) : o)));
      }
    } else {
      const obs = {
        resourceType: 'Observation' as const,
        status: 'final' as const,
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: VITALS_PANEL_LOINC, display: 'Vital signs panel' }], text: 'Vital Signs' },
        subject: { reference: `Patient/${patientId}`, display: patientName },
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime,
        component: components,
      };
      const result = await createResource({ resourceType: 'Observation', resource: obs as any });
      if ('data' in result && result.data) savedObs = result.data;
    }

    if (savedObs) {
      const displayItems: RecordedItem[] = (savedObs.component || components).map((comp: any) => {
        const name = comp.code?.coding?.[0]?.display || '?';
        const val = comp.valueQuantity?.value ?? '—';
        const unit = comp.valueQuantity?.unit || '';
        return { id: `${savedObs.id || 'new'}-${name}`, display: `${name}: ${val} ${unit}`.trim() };
      });
      setVitalsItems(displayItems);
      setVitalsForm((f) => ({ ...f, spo2: '', hr: '', sbp: '', dbp: '', rr: '', temp: '' }));
      setIsEditingVitals(false);
    } else {
      setVitalsError('Failed to save vital signs. Please try again.');
    }
  };

  // ── PHYSICAL EXAM ─────────────────────────────────────────────────────────

  const prepareVitalsEdit = () => {
    const newForm = { ...vitalsForm };
    const panelObs = rawVitals.find((o) => o.component?.length);
    if (panelObs) {
      panelObs.component?.forEach((comp) => {
        const code = comp.code?.coding?.[0]?.code || '';
        const field = VITAL_CODE_TO_FIELD[code];
        if (field && comp.valueQuantity?.value != null) {
          (newForm as any)[field] = String(comp.valueQuantity.value);
        }
      });
    } else {
      // backward compat: old individual observations
      rawVitals.forEach((obs) => {
        const code = obs.code?.coding?.[0]?.code || '';
        const field = VITAL_CODE_TO_FIELD[code];
        if (field && obs.valueQuantity?.value != null) {
          (newForm as any)[field] = String(obs.valueQuantity.value);
        }
      });
    }
    setVitalsForm(newForm);
    setIsEditingVitals(true);
  };

  // ── PHYSICAL EXAM ─────────────────────────────────────────────────────────

  const [examForm, setExamForm] = useState({
    bodySystem: BODY_SYSTEMS[0].code,
    finding: '',
    isNormal: true,
  });
  const [examError, setExamError] = useState('');

  const handleSaveExam = async () => {
    setExamError('');
    if (!examForm.finding.trim()) {
      setExamError('Describe the examination finding.');
      return;
    }
    const system = BODY_SYSTEMS.find((s) => s.code === examForm.bodySystem)!;
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
            code: system.code,
            display: system.display,
          },
        ],
        text: system.display,
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: nowFHIR(),
      interpretation: examForm.isNormal
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
      valueString: examForm.finding.trim(),
    };
    const result = await createResource({
      resourceType: 'Observation',
      resource: obs as any,
    });
    if ('data' in result && result.data?.id) {
      setExamItems((prev) => [
        ...prev,
        {
          id: result.data!.id!,
          display: `[${system.display}] ${examForm.finding}`,
          note: examForm.isNormal ? 'Normal' : 'Abnormal',
        },
      ]);
      setExamForm((f) => ({ ...f, finding: '' }));
    } else {
      setExamError('Failed to save examination finding. Please try again.');
    }
  };

  // ── INVESTIGATIONS ────────────────────────────────────────────────────────

  const [orderForm, setOrderForm] = useState({
    category: LAB_CATEGORIES[0].code,
    testName: '',
    priority: 'routine' as 'routine' | 'urgent' | 'stat',
    notes: '',
  });
  const [ordersError, setOrdersError] = useState('');

  // Reset category when switching between lab/rad steps
  useEffect(() => {
    if (activeTab === 'lab') setOrderForm((f) => ({ ...f, category: LAB_CATEGORIES[0].code }));
    if (activeTab === 'rad') setOrderForm((f) => ({ ...f, category: RAD_CATEGORIES[0].code }));
  }, [activeTab]);

  const handleSaveOrder = async () => {
    setOrdersError('');
    if (!orderForm.testName.trim()) {
      setOrdersError('Enter the test or investigation name.');
      return;
    }
    const cat = INVESTIGATION_CATEGORIES.find(
      (c) => c.code === orderForm.category,
    )!;
    const order = {
      resourceType: 'ServiceRequest' as const,
      status: 'active' as const,
      intent: 'order' as const,
      priority: orderForm.priority as any,
      category: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: cat.code,
              display: cat.display,
            },
          ],
          text: cat.display,
        },
      ],
      code: {
        concept: {
          text: orderForm.testName.trim(),
        },
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      authoredOn: nowFHIR(),
      ...(orderForm.notes ? { note: [{ text: orderForm.notes }] } : {}),
    };
    const result = await createResource({
      resourceType: 'ServiceRequest',
      resource: order as any,
    });
    if ('data' in result && result.data?.id) {
      const item = {
        id: result.data!.id!,
        display: orderForm.testName.trim(),
        note: `${cat.display} · ${orderForm.priority.toUpperCase()}`,
      };
      if (activeTab === 'rad') {
        setRadOrderItems((prev) => [...prev, item]);
      } else {
        setLabOrderItems((prev) => [...prev, item]);
      }
      setOrderForm((f) => ({ ...f, testName: '', notes: '' }));
    } else {
      setOrdersError('Failed to place order. Please try again.');
    }
  };

  // ── ASSESSMENT ────────────────────────────────────────────────────────────

  const [diagForm, setDiagForm] = useState({
    diagnosis: '',
    snomedCode: '',
    severity: 'moderate' as 'mild' | 'moderate' | 'severe',
    verification: 'confirmed' as 'confirmed' | 'provisional',
  });
  const [diagError, setDiagError] = useState('');

  const handleSaveDiagnosis = async () => {
    setDiagError('');
    if (!diagForm.diagnosis.trim()) {
      setDiagError('Enter a diagnosis.');
      return;
    }
    const condition = {
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
            code: diagForm.verification,
            display:
              diagForm.verification === 'confirmed'
                ? 'Confirmed'
                : 'Provisional',
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
      severity: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            ...SEVERITY_SNOMED[diagForm.severity],
          },
        ],
      },
      code: {
        coding: diagForm.snomedCode
          ? [
              {
                system: 'http://snomed.info/sct',
                code: diagForm.snomedCode,
                display: diagForm.diagnosis.trim(),
              },
            ]
          : [],
        text: diagForm.diagnosis.trim(),
      },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      onsetDateTime: nowFHIR(),
      recordedDate: nowFHIR().slice(0, 10),
    };
    const result = await createResource({
      resourceType: 'Condition',
      resource: condition as any,
    });
    if ('data' in result && result.data?.id) {
      setDiagnosisItems((prev) => [
        ...prev,
        {
          id: result.data!.id!,
          display: diagForm.diagnosis.trim(),
          note: `${SEVERITY_SNOMED[diagForm.severity].display} · ${diagForm.verification}`,
        },
      ]);
      setDiagForm((f) => ({ ...f, diagnosis: '', snomedCode: '' }));
    } else {
      setDiagError('Failed to save diagnosis. Please try again.');
    }
  };

  // ── MANAGEMENT ────────────────────────────────────────────────────────────

  const [medForm, setMedForm] = useState({
    drugName: '',
    dose: '',
    unit: 'mg',
    route: 'oral' as keyof typeof ROUTE_SNOMED,
    frequency: '',
    instructions: '',
  });
  const [medError, setMedError] = useState('');

  const [carePlanForm, setCarePlanForm] = useState({
    title: '',
    description: '',
  });
  const [carePlanError, setCarePlanError] = useState('');

  const handleSaveMedication = async () => {
    setMedError('');
    if (!medForm.drugName.trim()) {
      setMedError('Enter a drug name.');
      return;
    }
    const dosageParts = [
      medForm.dose ? `${medForm.dose} ${medForm.unit}` : '',
      medForm.route ? `${medForm.route}` : '',
      medForm.frequency || '',
      medForm.instructions || '',
    ].filter(Boolean);
    const dosageText = dosageParts.join(' · ');

    const medReq = {
      resourceType: 'MedicationRequest' as const,
      status: 'active' as const,
      intent: 'order' as const,
      medication: { concept: { text: medForm.drugName.trim() } },
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      authoredOn: nowFHIR(),
      dosageInstruction: [
        {
          text: dosageText || medForm.drugName.trim(),
          route: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                ...ROUTE_SNOMED[medForm.route],
              },
            ],
          },
          ...(medForm.dose
            ? {
                doseAndRate: [
                  {
                    doseQuantity: {
                      value: parseFloat(medForm.dose),
                      unit: medForm.unit,
                      system: 'http://unitsofmeasure.org',
                      code: medForm.unit,
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    };
    const result = await createResource({
      resourceType: 'MedicationRequest',
      resource: medReq as any,
    });
    if ('data' in result && result.data?.id) {
      setMedicationItems((prev) => [
        ...prev,
        {
          id: result.data!.id!,
          display: medForm.drugName.trim(),
          note: dosageText,
        },
      ]);
      setMedForm({
        drugName: '',
        dose: '',
        unit: 'mg',
        route: 'oral',
        frequency: '',
        instructions: '',
      });
    } else {
      setMedError('Failed to save medication. Please try again.');
    }
  };

  const handleSaveCarePlan = async () => {
    setCarePlanError('');
    if (!carePlanForm.description.trim()) {
      setCarePlanError('Enter a care plan description.');
      return;
    }
    const cp = {
      resourceType: 'CarePlan' as const,
      status: 'active' as const,
      intent: 'order' as const,
      title: carePlanForm.title.trim() || 'Care Plan',
      description: carePlanForm.description.trim(),
      subject: { reference: `Patient/${patientId}`, display: patientName },
      encounter: { reference: `Encounter/${encounterId}` },
      created: nowFHIR().slice(0, 10),
      period: { start: nowFHIR() },
    };
    const result = await createResource({
      resourceType: 'CarePlan',
      resource: cp as any,
    });
    if ('data' in result && result.data?.id) {
      setCarePlanItem({
        id: result.data.id,
        display: cp.title,
        note: cp.description,
      });
      setCarePlanForm({ title: '', description: '' });
    } else {
      setCarePlanError('Failed to save care plan. Please try again.');
    }
  };


  // ─── Step badge counts ─────────────────────────────────────────────────────

  const tabCounts: Record<TabId, number> = {
    vitals: vitalsItems.length,
    exam: examItems.length,
    lab: labOrderItems.length,
    rad: radOrderItems.length,
    assessment: diagnosisItems.length,
    management: medicationItems.length + (carePlanItem ? 1 : 0),
  };

  // ─── Finish Consult ────────────────────────────────────────────────────────

  const [finishError, setFinishError] = useState('');

  const handleFinishConsult = async () => {
    setFinishError('');
    if (!encounterResource || !encounterId) return;
    const updated = {
      ...(encounterResource as Encounter),
      status: 'completed' as const,
    };
    const result = await updateResource({
      resourceType: 'Encounter',
      id: encounterId!,
      resource: updated as unknown as Encounter,
    });
    if ('data' in result) {
      navigate('/queue');
    } else {
      setFinishError('Failed to finish consult. Please try again.');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="-mx-4 -mt-8 flex flex-col min-h-screen">

      {/* ── Sticky demographic bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-blue-700 rounded-full h-9 w-9 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {patientName.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 text-base leading-tight block truncate">{patientName || '—'}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs text-gray-500">
              {patient?.birthDate && <span>DOB: <strong className="text-gray-700">{patient.birthDate}</strong></span>}
              {patient?.gender && <span>Sex: <strong className="text-gray-700 capitalize">{patient.gender}</strong></span>}
              {patient?.identifier?.[0]?.value && <span>ID: <strong className="text-gray-700 font-mono">{patient.identifier[0].value}</strong></span>}
            </div>
          </div>
        </div>

        <div className="hidden sm:block h-8 border-l border-gray-200 mx-1" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-600">
          <span className="font-medium text-gray-800">{encounterReason}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            In Progress
          </span>
          {encounterStart && <span className="text-xs text-gray-400">{encounterStart}</span>}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {finishError && <span className="text-xs text-red-600">{finishError}</span>}
          <button
            onClick={handleFinishConsult}
            disabled={isFinishing}
            className="md:hidden bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
          >
            {isFinishing ? 'Finishing…' : '✓ Finish'}
          </button>
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

        {/* Left step-wizard sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-12' : 'w-56'} flex-shrink-0 border-r border-gray-200 bg-gray-50 sticky top-[52px] self-start h-[calc(100vh-52px)] overflow-y-auto hidden md:flex flex-col transition-all duration-200`}>
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
            <>
              <nav className="flex-1 py-2">
                {STEPS.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveTab(step.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                      activeTab === step.id
                        ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      activeTab === step.id
                        ? 'bg-blue-600 text-white'
                        : tabCounts[step.id] > 0
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tabCounts[step.id] > 0 ? '✓' : step.step}
                    </span>
                    <span className="truncate">{step.label}</span>
                    {tabCounts[step.id] > 0 && (
                      <span className="ml-auto text-xs font-semibold text-green-600">{tabCounts[step.id]}</span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="p-3 border-t border-gray-200">
                <button
                  onClick={handleFinishConsult}
                  disabled={isFinishing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 px-3 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isFinishing ? 'Finishing…' : '✓ Finish Consult'}
                </button>
                {finishError && <p className="text-xs text-red-600 mt-1 text-center">{finishError}</p>}
              </div>
            </>
          )}
        </aside>

        {/* Main step content */}
        <main className="flex-1 min-w-0 px-6 py-5">

          {/* Step header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Step {STEPS.findIndex((s) => s.id === activeTab) + 1} of {STEPS.length}
              </span>
              <h2 className="text-lg font-bold text-gray-800 mt-0.5">
                {STEPS.find((s) => s.id === activeTab)?.label}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {STEPS.findIndex((s) => s.id === activeTab) > 0 && (
                <button
                  onClick={() => {
                    const idx = STEPS.findIndex((s) => s.id === activeTab);
                    setActiveTab(STEPS[idx - 1].id);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-md transition-colors"
                >
                  ← Prev
                </button>
              )}
              {STEPS.findIndex((s) => s.id === activeTab) < STEPS.length - 1 ? (
                <button
                  onClick={() => {
                    const idx = STEPS.findIndex((s) => s.id === activeTab);
                    setActiveTab(STEPS[idx + 1].id);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-md transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleFinishConsult}
                  disabled={isFinishing}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  {isFinishing ? 'Finishing…' : '✓ Finish Consult'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
        {/* ── VITALS ── */}
        {activeTab === 'vitals' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Vital Signs
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Record the patient's vital signs. Leave fields blank to skip.
            </p>

            {vitalsItems.length > 0 && !isEditingVitals ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Recorded Vitals ({vitalsItems.length})
                  </h4>
                  <button
                    onClick={prepareVitalsEdit}
                    className="text-xs font-semibold text-amber-600 border border-amber-300 px-3 py-1 rounded-md hover:bg-amber-50 transition-colors"
                  >
                    ✏️ Update Vitals
                  </button>
                </div>
                <ul className="space-y-2">
                  {vitalsItems.map((item) => (
                    <li key={item.id} className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">{item.display}</span>
                      {item.note && <span className="text-gray-500 text-xs flex-shrink-0">{item.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>SpO₂ (%)</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  step="1"
                  placeholder="e.g. 98"
                  className={fieldCls}
                  value={vitalsForm.spo2}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, spo2: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Heart Rate (bpm)</label>
                <input
                  type="number"
                  min="20"
                  max="300"
                  step="1"
                  placeholder="e.g. 72"
                  className={fieldCls}
                  value={vitalsForm.hr}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, hr: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Systolic BP (mmHg)</label>
                <input
                  type="number"
                  min="50"
                  max="300"
                  step="1"
                  placeholder="e.g. 120"
                  className={fieldCls}
                  value={vitalsForm.sbp}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, sbp: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Diastolic BP (mmHg)</label>
                <input
                  type="number"
                  min="20"
                  max="200"
                  step="1"
                  placeholder="e.g. 80"
                  className={fieldCls}
                  value={vitalsForm.dbp}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, dbp: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Resp. Rate (breaths/min)</label>
                <input
                  type="number"
                  min="4"
                  max="60"
                  step="1"
                  placeholder="e.g. 16"
                  className={fieldCls}
                  value={vitalsForm.rr}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, rr: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Temperature (°C)</label>
                <input
                  type="number"
                  min="30"
                  max="43"
                  step="0.1"
                  placeholder="e.g. 36.8"
                  className={fieldCls}
                  value={vitalsForm.temp}
                  onChange={(e) =>
                    setVitalsForm((f) => ({ ...f, temp: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Recorded At</label>
              <input
                type="datetime-local"
                className={`${fieldCls} max-w-xs`}
                value={vitalsForm.recordedAt}
                onChange={(e) =>
                  setVitalsForm((f) => ({ ...f, recordedAt: e.target.value }))
                }
              />
            </div>

            <ErrorBox msg={vitalsError} />

            <button
              onClick={handleSaveVitals}
              disabled={isCreating}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Saving...' : vitalsItems.length > 0 ? 'Update Vital Signs' : 'Save Vital Signs'}
            </button>
            {isEditingVitals && (
              <button
                onClick={() => setIsEditingVitals(false)}
                className="mt-2 ml-3 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            )}

            <RecordedList
              items={vitalsItems}
              emptyLabel="No vitals recorded yet."
            />
              </>
            )}
          </div>
        )}

        {/* ── PHYSICAL EXAM ── */}
        {activeTab === 'exam' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Physical Examination
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Record findings by body system. Add one finding at a time.
            </p>

            {examItems.length > 0 && !isAddingMore.exam ? (
              <ExistingRecords
                items={examItems}
                label="Recorded Findings"
                onAddMore={() => setIsAddingMore((m) => ({ ...m, exam: true }))}
              />
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Body System</label>
                <select
                  className={fieldCls}
                  value={examForm.bodySystem}
                  onChange={(e) =>
                    setExamForm((f) => ({ ...f, bodySystem: e.target.value }))
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
                  placeholder="Describe the finding..."
                  className={fieldCls}
                  value={examForm.finding}
                  onChange={(e) =>
                    setExamForm((f) => ({ ...f, finding: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="normality"
                  checked={examForm.isNormal}
                  onChange={() =>
                    setExamForm((f) => ({ ...f, isNormal: true }))
                  }
                  className="text-green-600"
                />
                <span className="text-sm text-gray-700">Normal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="normality"
                  checked={!examForm.isNormal}
                  onChange={() =>
                    setExamForm((f) => ({ ...f, isNormal: false }))
                  }
                  className="text-red-500"
                />
                <span className="text-sm text-gray-700">Abnormal</span>
              </label>
            </div>

            <ErrorBox msg={examError} />

            <button
              onClick={handleSaveExam}
              disabled={isCreating}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Saving...' : 'Add Finding'}
            </button>

            <RecordedList
              items={examItems}
              emptyLabel="No examination findings recorded yet."
            />
              </>
            )}
          </div>
        )}

        {/* ── LAB INVESTIGATIONS ── */}
        {activeTab === 'lab' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Lab Investigations
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Place laboratory investigation orders for this encounter.
            </p>

            {labOrderItems.length > 0 && !isAddingMore.lab ? (
              <ExistingRecords
                items={labOrderItems}
                label="Lab Orders"
                onAddMore={() => setIsAddingMore((m) => ({ ...m, lab: true }))}
              />
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Category</label>
                <select
                  className={fieldCls}
                  value={orderForm.category}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, category: e.target.value }))
                  }
                >
                  {LAB_CATEGORIES.map((c) => (
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
                  placeholder="e.g. Full Blood Count, LFT, HbA1c..."
                  className={fieldCls}
                  value={orderForm.testName}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, testName: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select
                  className={fieldCls}
                  value={orderForm.priority}
                  onChange={(e) =>
                    setOrderForm((f) => ({
                      ...f,
                      priority: e.target.value as any,
                    }))
                  }
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Clinical Notes</label>
                <input
                  type="text"
                  placeholder="Optional clinical indication..."
                  className={fieldCls}
                  value={orderForm.notes}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
            </div>

            <ErrorBox msg={ordersError} />

            <button
              onClick={handleSaveOrder}
              disabled={isCreating}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Placing...' : 'Place Lab Order'}
            </button>

            <RecordedList
              items={labOrderItems}
              emptyLabel="No lab orders placed yet."
            />
              </>
            )}
          </div>
        )}

        {/* ── RADIOLOGY ORDERS ── */}
        {activeTab === 'rad' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Radiology Orders
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Place radiology and imaging orders for this encounter.
            </p>

            {radOrderItems.length > 0 && !isAddingMore.rad ? (
              <ExistingRecords
                items={radOrderItems}
                label="Radiology Orders"
                onAddMore={() => setIsAddingMore((m) => ({ ...m, rad: true }))}
              />
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Modality / Study</label>
                <input
                  type="text"
                  placeholder="e.g. Chest X-ray, CT Abdomen, MRI Brain..."
                  className={fieldCls}
                  value={orderForm.testName}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, testName: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select
                  className={fieldCls}
                  value={orderForm.priority}
                  onChange={(e) =>
                    setOrderForm((f) => ({
                      ...f,
                      priority: e.target.value as any,
                    }))
                  }
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Clinical Indication</label>
                <input
                  type="text"
                  placeholder="e.g. ?Pneumonia, rule out PE..."
                  className={fieldCls}
                  value={orderForm.notes}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
            </div>

            <ErrorBox msg={ordersError} />

            <button
              onClick={handleSaveOrder}
              disabled={isCreating}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Placing...' : 'Place Radiology Order'}
            </button>

            <RecordedList
              items={radOrderItems}
              emptyLabel="No radiology orders placed yet."
            />
              </>
            )}
          </div>
        )}

        {/* ── ASSESSMENT ── */}
        {activeTab === 'assessment' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Assessment / Diagnosis
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Record the clinical diagnosis for this encounter.
            </p>

            {diagnosisItems.length > 0 && !isAddingMore.assessment ? (
              <ExistingRecords
                items={diagnosisItems}
                label="Diagnoses"
                onAddMore={() => setIsAddingMore((m) => ({ ...m, assessment: true }))}
              />
            ) : (
              <>
            {/* Summary of findings */}
            {(vitalsItems.length > 0 ||
              examItems.length > 0 ||
              labOrderItems.length + radOrderItems.length > 0) && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-5 text-sm text-gray-600">
                <span className="font-medium text-gray-700">
                  Findings summary:{' '}
                </span>
                {vitalsItems.length} vital sign
                {vitalsItems.length !== 1 ? 's' : ''} &middot;{' '}
                {examItems.length} exam finding
                {examItems.length !== 1 ? 's' : ''} &middot; {labOrderItems.length + radOrderItems.length}{' '}
                order{labOrderItems.length + radOrderItems.length !== 1 ? 's' : ''} placed
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>
                  Diagnosis <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acute decompensated heart failure"
                  className={fieldCls}
                  value={diagForm.diagnosis}
                  onChange={(e) =>
                    setDiagForm((f) => ({ ...f, diagnosis: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>
                  SNOMED Code{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 703328004"
                  className={fieldCls}
                  value={diagForm.snomedCode}
                  onChange={(e) =>
                    setDiagForm((f) => ({ ...f, snomedCode: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Verification Status</label>
                <select
                  className={fieldCls}
                  value={diagForm.verification}
                  onChange={(e) =>
                    setDiagForm((f) => ({
                      ...f,
                      verification: e.target.value as any,
                    }))
                  }
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="provisional">Provisional</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Severity</label>
                <select
                  className={fieldCls}
                  value={diagForm.severity}
                  onChange={(e) =>
                    setDiagForm((f) => ({
                      ...f,
                      severity: e.target.value as any,
                    }))
                  }
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
            </div>

            <ErrorBox msg={diagError} />

            <button
              onClick={handleSaveDiagnosis}
              disabled={isCreating}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Saving...' : 'Save Diagnosis'}
            </button>

            <RecordedList
              items={diagnosisItems}
              emptyLabel="No diagnoses recorded yet."
            />
              </>
            )}
          </div>
        )}

        {/* ── MANAGEMENT ── */}
        {activeTab === 'management' && (
          <div className="space-y-8">
            {(medicationItems.length > 0 || carePlanItem != null) && !isAddingMore.management ? (
              <>
                {medicationItems.length > 0 && (
                  <ExistingRecords
                    items={medicationItems}
                    label="Medications"
                    onAddMore={() => setIsAddingMore((m) => ({ ...m, management: true }))}
                  />
                )}
                {carePlanItem && (
                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Care Plan</h4>
                      {medicationItems.length === 0 && (
                        <button
                          onClick={() => setIsAddingMore((m) => ({ ...m, management: true }))}
                          className="text-xs font-semibold text-blue-600 border border-blue-300 px-3 py-1 rounded-md hover:bg-blue-50 transition-colors"
                        >
                          + Add More
                        </button>
                      )}
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">{carePlanItem.display}</span>
                      {carePlanItem.note && <span className="text-gray-500 text-xs flex-shrink-0">{carePlanItem.note}</span>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
            {/* Medications */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Medications
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Add medication orders for this encounter.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Drug Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Furosemide"
                    className={fieldCls}
                    value={medForm.drugName}
                    onChange={(e) =>
                      setMedForm((f) => ({ ...f, drugName: e.target.value }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>Dose</label>
                    <input
                      type="text"
                      placeholder="e.g. 40"
                      className={fieldCls}
                      value={medForm.dose}
                      onChange={(e) =>
                        setMedForm((f) => ({ ...f, dose: e.target.value }))
                      }
                    />
                  </div>
                  <div className="w-24">
                    <label className={labelCls}>Unit</label>
                    <select
                      className={fieldCls}
                      value={medForm.unit}
                      onChange={(e) =>
                        setMedForm((f) => ({ ...f, unit: e.target.value }))
                      }
                    >
                      {['mg', 'mcg', 'g', 'mL', 'units', 'IU', '%'].map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Route</label>
                  <select
                    className={fieldCls}
                    value={medForm.route}
                    onChange={(e) =>
                      setMedForm((f) => ({
                        ...f,
                        route: e.target.value as any,
                      }))
                    }
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
                    value={medForm.frequency}
                    onChange={(e) =>
                      setMedForm((f) => ({ ...f, frequency: e.target.value }))
                    }
                  >
                    <option value="">— Select —</option>
                    {[
                      'Once daily (OD)',
                      'Twice daily (BD)',
                      'Three times daily (TDS)',
                      'Four times daily (QDS)',
                      'Every 6 hours (Q6H)',
                      'Every 8 hours (Q8H)',
                      'Every 12 hours (Q12H)',
                      'STAT (once only)',
                      'PRN (as needed)',
                      'Nightly (ON)',
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Special Instructions</label>
                  <input
                    type="text"
                    placeholder="e.g. With food, monitor potassium..."
                    className={fieldCls}
                    value={medForm.instructions}
                    onChange={(e) =>
                      setMedForm((f) => ({
                        ...f,
                        instructions: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <ErrorBox msg={medError} />

              <button
                onClick={handleSaveMedication}
                disabled={isCreating}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
              >
                {isCreating ? 'Saving...' : 'Add Medication'}
              </button>

              <RecordedList
                items={medicationItems}
                emptyLabel="No medications ordered yet."
              />
            </div>

            {/* Care Plan */}
            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Care Plan
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Document the overall management and follow-up plan.
              </p>

              {carePlanItem ? (
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <div className="font-medium text-gray-800 text-sm">
                    {carePlanItem.display}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {carePlanItem.note}
                  </div>
                  <div className="text-xs text-green-700 mt-2">
                    Care plan saved (ID: {carePlanItem.id})
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className={labelCls}>Plan Title</label>
                      <input
                        type="text"
                        placeholder="e.g. HFrEF Management Plan"
                        className={fieldCls}
                        value={carePlanForm.title}
                        onChange={(e) =>
                          setCarePlanForm((f) => ({
                            ...f,
                            title: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Plan Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Describe the management goals, plan, referrals, and follow-up..."
                        className={fieldCls}
                        value={carePlanForm.description}
                        onChange={(e) =>
                          setCarePlanForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <ErrorBox msg={carePlanError} />

                  <button
                    onClick={handleSaveCarePlan}
                    disabled={isCreating}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-md disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? 'Saving...' : 'Save Care Plan'}
                  </button>
                </>
              )}
            </div>
              </>
            )}
          </div>
        )}

      </div>
      </main>
      </div>
    </div>
  );
};

export default ClinicalConsultPage;
