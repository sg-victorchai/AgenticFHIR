import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useGetEncountersQuery,
  useGetObservationsQuery,
  useGetMedicationsQuery,
  useGetCarePlansQuery,
  useSearchByPatientQuery,
} from '../services/fhir/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId =
  | 'encounter'
  | 'observation'
  | 'orders'
  | 'lab-results'
  | 'rad-report'
  | 'medication'
  | 'procedure'
  | 'careplan';

type MedSubTab = 'request' | 'dispense' | 'statement';

const TABS: { id: TabId; label: string }[] = [
  { id: 'encounter', label: 'Encounter' },
  { id: 'observation', label: 'Observation' },
  { id: 'orders', label: 'Lab & Rad Orders' },
  { id: 'lab-results', label: 'Lab Results' },
  { id: 'rad-report', label: 'Rad Report' },
  { id: 'medication', label: 'Medication' },
  { id: 'procedure', label: 'Procedure' },
  { id: 'careplan', label: 'Care Plan' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (dt?: string) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span className="text-gray-400">—</span>;
  const cls =
    status === 'active' || status === 'final' || status === 'completed' || status === 'finished'
      ? 'bg-green-100 text-green-800'
      : status === 'in-progress' || status === 'preliminary'
      ? 'bg-blue-100 text-blue-800'
      : status === 'cancelled' || status === 'entered-in-error'
      ? 'bg-red-100 text-red-800'
      : status === 'draft' || status === 'planned'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

const ExpandToggle: React.FC<{ open: boolean }> = ({ open }) => (
  <span className="text-gray-400">{open ? '▲' : '▼'}</span>
);

const TH: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
    {children}
  </th>
);

const TD: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`px-4 py-3 text-sm text-gray-800 ${className ?? ''}`}>{children ?? '—'}</td>
);

const Loading = () => (
  <div className="flex justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
  </div>
);

const Empty = () => (
  <div className="text-center py-12 text-gray-400">No records found.</div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const PatientRecordsPage: React.FC = () => {
  const { id: patientId } = useParams<{ id: string }>();

  const [activeTab, setActiveTab] = useState<TabId>('encounter');
  const [medSubTab, setMedSubTab] = useState<MedSubTab>('request');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Patient ──
  const { data: patient } = useGetPatientQuery(patientId!, { skip: !patientId });

  const patientName =
    patient?.name?.[0]?.text ||
    [patient?.name?.[0]?.given?.join(' '), patient?.name?.[0]?.family]
      .filter(Boolean)
      .join(' ') ||
    'Unknown Patient';
  const mrn = patient?.identifier?.[0]?.value || '—';

  // ── Data fetching (lazy) ──
  const { data: encBundle, isLoading: encLoading } = useGetEncountersQuery(patientId!, {
    skip: activeTab !== 'encounter',
  });
  const { data: obsBundle, isLoading: obsLoading } = useGetObservationsQuery(
    { patientId: patientId! },
    { skip: activeTab !== 'observation' },
  );
  const { data: srBundle, isLoading: srLoading } = useSearchByPatientQuery(
    { resourceType: 'ServiceRequest', patientId: patientId! },
    { skip: activeTab !== 'orders' },
  );
  const { data: drBundle, isLoading: drLoading } = useSearchByPatientQuery(
    { resourceType: 'DiagnosticReport', patientId: patientId! },
    { skip: activeTab !== 'lab-results' && activeTab !== 'rad-report' },
  );
  const { data: medReqBundle, isLoading: medReqLoading } = useGetMedicationsQuery(patientId!, {
    skip: activeTab !== 'medication',
  });
  const { data: medDispBundle, isLoading: medDispLoading } = useSearchByPatientQuery(
    { resourceType: 'MedicationDispense', patientId: patientId! },
    { skip: activeTab !== 'medication' || medSubTab !== 'dispense' },
  );
  const { data: medStmtBundle, isLoading: medStmtLoading } = useSearchByPatientQuery(
    { resourceType: 'MedicationStatement', patientId: patientId! },
    { skip: activeTab !== 'medication' || medSubTab !== 'statement' },
  );
  const { data: procBundle, isLoading: procLoading } = useSearchByPatientQuery(
    { resourceType: 'Procedure', patientId: patientId! },
    { skip: activeTab !== 'procedure' },
  );
  const { data: cpBundle, isLoading: cpLoading } = useGetCarePlansQuery(patientId!, {
    skip: activeTab !== 'careplan',
  });

  // ── Resource extraction ──
  const encounters = (encBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const observations = (obsBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean)
    .filter((o: any) => o.status !== 'entered-in-error');
  const serviceRequests = (srBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const allDiagnosticReports = (drBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);

  const isLabReport = (dr: any) =>
    dr.category?.some((c: any) =>
      c.coding?.some(
        (cd: any) =>
          cd.code === 'LAB' ||
          cd.code === '4321000179101' ||
          cd.display?.toLowerCase().includes('lab'),
      ),
    ) ?? true;

  const isRadReport = (dr: any) =>
    dr.category?.some((c: any) =>
      c.coding?.some(
        (cd: any) =>
          cd.code === 'RAD' ||
          cd.code === '4261000179101' ||
          cd.display?.toLowerCase().includes('rad') ||
          cd.display?.toLowerCase().includes('imaging'),
      ),
    );

  const labResults = allDiagnosticReports.filter(isLabReport);
  const radReports = allDiagnosticReports.filter(isRadReport);

  const medRequests = (medReqBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const medDispenses = (medDispBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const medStatements = (medStmtBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const procedures = (procBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);
  const carePlans = (cpBundle?.entry ?? []).map((e) => e.resource as any).filter(Boolean);

  // ── Toggle helper ──
  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // ─── Tab renders ──────────────────────────────────────────────────────────

  const renderEncounterTab = () => {
    if (encLoading) return <Loading />;
    if (!encounters.length) return <Empty />;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Type', 'Status', 'Chief Complaint'].map((h) => (
                <TH key={h}>{h}</TH>
              ))}
              <TH />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {encounters.map((enc: any) => (
              <React.Fragment key={enc.id}>
                <tr
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggle(enc.id)}
                >
                  <TD>{fmt(enc.actualPeriod?.start || enc.period?.start)}</TD>
                  <TD>
                    {enc.type?.[0]?.text ||
                      enc.class?.[0]?.coding?.[0]?.display ||
                      '—'}
                  </TD>
                  <TD>
                    <StatusBadge status={enc.status} />
                  </TD>
                  <TD>{enc.reason?.[0]?.value?.[0]?.concept?.text || '—'}</TD>
                  <td className="px-4 py-3 text-right">
                    <ExpandToggle open={expandedId === enc.id} />
                  </td>
                </tr>
                {expandedId === enc.id && (
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-6 py-4 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-gray-700">
                        <div><span className="font-medium">Encounter ID:</span> {enc.id}</div>
                        <div><span className="font-medium">Identifier:</span> {enc.identifier?.[0]?.value || '—'}</div>
                        <div>
                          <span className="font-medium">Period:</span>{' '}
                          {fmt(enc.actualPeriod?.start || enc.period?.start)} →{' '}
                          {fmt(enc.actualPeriod?.end || enc.period?.end)}
                        </div>
                        <div>
                          <span className="font-medium">Location:</span>{' '}
                          {enc.location
                            ?.map(
                              (l: any) =>
                                l.location?.identifier?.value || l.location?.reference || '—',
                            )
                            .join(', ') || '—'}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Participants:</span>{' '}
                          {enc.participant
                            ?.map(
                              (p: any) => p.actor?.display || p.actor?.reference || '—',
                            )
                            .join(', ') || '—'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderObservationTab = () => {
    if (obsLoading) return <Loading />;
    if (!observations.length) return <Empty />;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Code', 'Category', 'Value', 'Status'].map((h) => (
                <TH key={h}>{h}</TH>
              ))}
              <TH />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {observations.map((obs: any) => {
              const value = obs.valueQuantity
                ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`.trim()
                : obs.valueString ||
                  obs.valueCodeableConcept?.text ||
                  (obs.component?.length ? `${obs.component.length} components` : '—');
              return (
                <React.Fragment key={obs.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggle(obs.id)}
                  >
                    <TD>{fmt(obs.effectiveDateTime)}</TD>
                    <TD>
                      {obs.code?.coding?.[0]?.display ||
                        obs.code?.text ||
                        obs.code?.coding?.[0]?.code ||
                        '—'}
                    </TD>
                    <TD>
                      {obs.category?.[0]?.coding?.[0]?.display ||
                        obs.category?.[0]?.coding?.[0]?.code ||
                        '—'}
                    </TD>
                    <TD>{value}</TD>
                    <TD>
                      <StatusBadge status={obs.status} />
                    </TD>
                    <td className="px-4 py-3 text-right">
                      <ExpandToggle open={expandedId === obs.id} />
                    </td>
                  </tr>
                  {expandedId === obs.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm text-gray-700">
                        {obs.component?.length ? (
                          <div>
                            <p className="font-medium mb-2">Components:</p>
                            <table className="text-xs border border-gray-200 rounded">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-3 py-1 text-left">Code</th>
                                  <th className="px-3 py-1 text-left">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {obs.component.map((c: any, i: number) => (
                                  <tr key={i} className="border-t border-gray-200">
                                    <td className="px-3 py-1">
                                      {c.code?.coding?.[0]?.display || c.code?.text || '—'}
                                    </td>
                                    <td className="px-3 py-1">
                                      {c.valueQuantity
                                        ? `${c.valueQuantity.value} ${c.valueQuantity.unit ?? ''}`.trim()
                                        : c.valueString || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="font-medium">Value:</span> {value}</div>
                            <div>
                              <span className="font-medium">Interpretation:</span>{' '}
                              {obs.interpretation?.[0]?.coding?.[0]?.display || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Note:</span>{' '}
                              {obs.note?.[0]?.text || '—'}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderOrdersTab = () => {
    if (srLoading) return <Loading />;
    if (!serviceRequests.length) return <Empty />;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Order', 'Category', 'Status', 'Priority'].map((h) => (
                <TH key={h}>{h}</TH>
              ))}
              <TH />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {serviceRequests.map((sr: any) => (
              <React.Fragment key={sr.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(sr.id)}>
                  <TD>{fmt(sr.authoredOn)}</TD>
                  <TD>
                    {sr.code?.coding?.[0]?.display || sr.code?.text || '—'}
                  </TD>
                  <TD>
                    {sr.category?.[0]?.coding?.[0]?.display ||
                      sr.category?.[0]?.coding?.[0]?.code ||
                      '—'}
                  </TD>
                  <TD>
                    <StatusBadge status={sr.status} />
                  </TD>
                  <TD>{sr.priority || '—'}</TD>
                  <td className="px-4 py-3 text-right">
                    <ExpandToggle open={expandedId === sr.id} />
                  </td>
                </tr>
                {expandedId === sr.id && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-gray-700">
                        <div>
                          <span className="font-medium">Requester:</span>{' '}
                          {sr.requester?.display || sr.requester?.reference || '—'}
                        </div>
                        <div>
                          <span className="font-medium">Performer:</span>{' '}
                          {sr.performer?.[0]?.display || '—'}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Note:</span>{' '}
                          {sr.note?.[0]?.text || '—'}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Reason:</span>{' '}
                          {sr.reasonCode?.[0]?.text ||
                            sr.reason?.[0]?.concept?.text ||
                            '—'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDiagnosticReportTable = (reports: any[], loading: boolean) => {
    if (loading) return <Loading />;
    if (!reports.length) return <Empty />;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Report', 'Status', 'Performer'].map((h) => (
                <TH key={h}>{h}</TH>
              ))}
              <TH />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {reports.map((dr: any) => (
              <React.Fragment key={dr.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(dr.id)}>
                  <TD>{fmt(dr.effectiveDateTime || dr.issued)}</TD>
                  <TD>
                    {dr.code?.text || dr.code?.coding?.[0]?.display || '—'}
                  </TD>
                  <TD>
                    <StatusBadge status={dr.status} />
                  </TD>
                  <TD>{dr.performer?.[0]?.display || '—'}</TD>
                  <td className="px-4 py-3 text-right">
                    <ExpandToggle open={expandedId === dr.id} />
                  </td>
                </tr>
                {expandedId === dr.id && (
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-6 py-4 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-gray-700 mb-3">
                        <div><span className="font-medium">Report ID:</span> {dr.id}</div>
                        <div><span className="font-medium">Issued:</span> {fmt(dr.issued)}</div>
                        <div className="col-span-2">
                          <span className="font-medium">Category:</span>{' '}
                          {dr.category
                            ?.map(
                              (c: any) =>
                                c.coding?.[0]?.display || c.coding?.[0]?.code || c.text,
                            )
                            .join(', ') || '—'}
                        </div>
                      </div>
                      {dr.result?.length ? (
                        <div className="mb-3">
                          <p className="font-medium mb-2">Results:</p>
                          <ul className="list-disc list-inside text-xs space-y-1">
                            {dr.result.map((ref: any, i: number) => {
                              const refId = ref.reference?.split('/')?.[1];
                              const contained = (dr.contained ?? []).find(
                                (c: any) => c.id === refId,
                              );
                              if (contained) {
                                const label =
                                  contained.code?.coding?.[0]?.display ||
                                  contained.code?.text ||
                                  ref.display ||
                                  ref.reference;
                                const val = contained.component?.length
                                  ? contained.component
                                      .map(
                                        (c: any) =>
                                          `${c.code?.coding?.[0]?.display || '?'}: ${
                                            c.valueQuantity
                                              ? `${c.valueQuantity.value} ${c.valueQuantity.unit ?? ''}`.trim()
                                              : c.valueString || '—'
                                          }`,
                                      )
                                      .join(', ')
                                  : contained.valueQuantity
                                  ? `${contained.valueQuantity.value} ${contained.valueQuantity.unit ?? ''}`.trim()
                                  : '—';
                                return <li key={i}>{label}: {val}</li>;
                              }
                              return <li key={i}>{ref.display || ref.reference}</li>;
                            })}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <span className="font-medium">Conclusion:</span>{' '}
                        {dr.conclusion || '—'}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMedicationTab = () => {
    const subTabs: { id: MedSubTab; label: string }[] = [
      { id: 'request', label: 'Medication Request' },
      { id: 'dispense', label: 'Medication Dispense' },
      { id: 'statement', label: 'Medication Statement' },
    ];

    const renderRequests = () => {
      if (medReqLoading) return <Loading />;
      if (!medRequests.length) return <Empty />;
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Medication', 'Status', 'Dosage', 'Reason'].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
                <TH />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {medRequests.map((mr: any) => (
                <React.Fragment key={mr.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(mr.id)}>
                    <TD>{fmt(mr.authoredOn)}</TD>
                    <TD>
                      {mr.medication?.concept?.text ||
                        mr.medication?.concept?.coding?.[0]?.display ||
                        mr.medication?.reference?.display ||
                        '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={mr.status} />
                    </TD>
                    <TD>
                      {mr.dosageInstruction?.[0]?.text ||
                        (mr.dosageInstruction?.[0]?.timing?.repeat?.frequency
                          ? `${mr.dosageInstruction[0].timing.repeat.frequency} times`
                          : '—')}
                    </TD>
                    <TD>
                      {mr.reasonCode?.[0]?.text ||
                        mr.reasonCode?.[0]?.coding?.[0]?.display ||
                        mr.reason?.[0]?.concept?.text ||
                        mr.reason?.[0]?.concept?.coding?.[0]?.display ||
                        mr.reason?.[0]?.reference?.display ||
                        '—'}
                    </TD>
                    <td className="px-4 py-3 text-right">
                      <ExpandToggle open={expandedId === mr.id} />
                    </td>
                  </tr>
                  {expandedId === mr.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm text-gray-700">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <div><span className="font-medium">ID:</span> {mr.id || '—'}</div>
                          <div><span className="font-medium">Identifier:</span> {mr.identifier?.[0]?.value || '—'}</div>
                          <div><span className="font-medium">Intent:</span> {mr.intent || '—'}</div>
                          <div><span className="font-medium">Priority:</span> {mr.priority || '—'}</div>
                          <div><span className="font-medium">Requester:</span> {mr.requester?.display || mr.requester?.reference || '—'}</div>
                          <div><span className="font-medium">Encounter:</span> {mr.encounter?.reference || '—'}</div>
                          <div>
                            <span className="font-medium">Reason:</span>{' '}
                            {mr.reasonCode?.[0]?.text ||
                              mr.reasonCode?.[0]?.coding?.[0]?.display ||
                              mr.reason?.[0]?.concept?.text ||
                              mr.reason?.[0]?.concept?.coding?.[0]?.display ||
                              mr.reason?.[0]?.reference?.display || '—'}
                          </div>
                          <div><span className="font-medium">Subject:</span> {mr.subject?.reference || '—'}</div>
                          <div className="col-span-2">
                            <span className="font-medium">Dosage Instructions:</span>{' '}
                            {mr.dosageInstruction?.map((d: any) => {
                              const parts = [
                                d.text,
                                d.route?.coding?.[0]?.display ? `Route: ${d.route.coding[0].display}` : null,
                                d.timing?.repeat?.frequency ? `${d.timing.repeat.frequency}× per ${d.timing.repeat.period} ${d.timing.repeat.periodUnit}` : null,
                                d.doseAndRate?.[0]?.doseQuantity ? `Dose: ${d.doseAndRate[0].doseQuantity.value} ${d.doseAndRate[0].doseQuantity.unit}` : null,
                              ].filter(Boolean).join(' | ');
                              return parts || null;
                            }).filter(Boolean).join('; ') || '—'}
                          </div>
                          <div><span className="font-medium">Dispense Qty:</span> {mr.dispenseRequest?.quantity?.value != null ? `${mr.dispenseRequest.quantity.value} ${mr.dispenseRequest.quantity.unit || ''}`.trim() : '—'}</div>
                          <div><span className="font-medium">Supply Duration:</span> {mr.dispenseRequest?.expectedSupplyDuration?.value != null ? `${mr.dispenseRequest.expectedSupplyDuration.value} ${mr.dispenseRequest.expectedSupplyDuration.unit || ''}`.trim() : '—'}</div>
                          <div><span className="font-medium">Repeats Allowed:</span> {mr.dispenseRequest?.numberOfRepeatsAllowed ?? '—'}</div>
                          <div><span className="font-medium">Substitution Allowed:</span> {mr.substitution?.allowedBoolean != null ? (mr.substitution.allowedBoolean ? 'Yes' : 'No') : mr.substitution?.allowedCodeableConcept?.text || '—'}</div>
                          <div className="col-span-2"><span className="font-medium">Note:</span> {mr.note?.map((n: any) => n.text).join('; ') || '—'}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const renderDispenses = () => {
      if (medDispLoading) return <Loading />;
      if (!medDispenses.length) return <Empty />;
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Medication', 'Status', 'Quantity'].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
                <TH />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {medDispenses.map((md: any) => (
                <React.Fragment key={md.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(md.id)}>
                    <TD>{fmt(md.whenHandedOver || md.whenPrepared)}</TD>
                    <TD>
                      {md.medication?.concept?.text ||
                        md.medication?.concept?.coding?.[0]?.display ||
                        '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={md.status} />
                    </TD>
                    <TD>
                      {md.quantity?.value != null
                        ? `${md.quantity.value} ${md.quantity.unit ?? ''}`.trim()
                        : '—'}
                    </TD>
                    <td className="px-4 py-3 text-right">
                      <ExpandToggle open={expandedId === md.id} />
                    </td>
                  </tr>
                  {expandedId === md.id && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50 px-6 py-4 text-sm text-gray-700">
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="font-medium">ID:</span> {md.id}</div>
                          <div>
                            <span className="font-medium">Days Supply:</span>{' '}
                            {md.daysSupply?.value != null
                              ? `${md.daysSupply.value} ${md.daysSupply.unit ?? ''}`.trim()
                              : '—'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const renderStatements = () => {
      if (medStmtLoading) return <Loading />;
      if (!medStatements.length) return <Empty />;
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Medication', 'Status', 'Effective'].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
                <TH />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {medStatements.map((ms: any) => (
                <React.Fragment key={ms.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(ms.id)}>
                    <TD>{fmt(ms.dateAsserted)}</TD>
                    <TD>
                      {ms.medication?.concept?.text ||
                        ms.medication?.concept?.coding?.[0]?.display ||
                        '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={ms.status} />
                    </TD>
                    <TD>
                      {fmt(ms.effectivePeriod?.start || ms.effectiveDateTime)}
                    </TD>
                    <td className="px-4 py-3 text-right">
                      <ExpandToggle open={expandedId === ms.id} />
                    </td>
                  </tr>
                  {expandedId === ms.id && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50 px-6 py-4 text-sm text-gray-700">
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="font-medium">ID:</span> {ms.id}</div>
                          <div>
                            <span className="font-medium">Note:</span>{' '}
                            {ms.note?.[0]?.text || '—'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div>
        <div className="flex gap-2 mb-4">
          {subTabs.map((st) => (
            <button
              key={st.id}
              onClick={() => { setMedSubTab(st.id); setExpandedId(null); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                medSubTab === st.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
        {medSubTab === 'request' && renderRequests()}
        {medSubTab === 'dispense' && renderDispenses()}
        {medSubTab === 'statement' && renderStatements()}
      </div>
    );
  };

  const renderProcedureTab = () => {
    if (procLoading) return <Loading />;
    if (!procedures.length) return <Empty />;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Procedure', 'Status', 'Performer', 'Reason'].map((h) => (
                <TH key={h}>{h}</TH>
              ))}
              <TH />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {procedures.map((proc: any) => (
              <React.Fragment key={proc.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(proc.id)}>
                  <TD>
                    {fmt(
                      proc.performedDateTime ||
                        proc.performedPeriod?.start ||
                        proc.occurrenceDateTime,
                    )}
                  </TD>
                  <TD>
                    {proc.code?.coding?.[0]?.display || proc.code?.text || '—'}
                  </TD>
                  <TD>
                    <StatusBadge status={proc.status} />
                  </TD>
                  <TD>{proc.performer?.[0]?.actor?.display || proc.performer?.[0]?.actor?.reference || '—'}</TD>
                  <TD>
                    {proc.reasonCode?.[0]?.text ||
                      proc.reasonCode?.[0]?.coding?.[0]?.display ||
                      proc.reason?.[0]?.concept?.text ||
                      proc.reason?.[0]?.concept?.coding?.[0]?.display ||
                      proc.reason?.[0]?.reference?.display ||
                      '—'}
                  </TD>
                  <td className="px-4 py-3 text-right">
                    <ExpandToggle open={expandedId === proc.id} />
                  </td>
                </tr>
                {expandedId === proc.id && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-gray-700">
                        <div><span className="font-medium">ID:</span> {proc.id || '—'}</div>
                        <div><span className="font-medium">Identifier:</span> {proc.identifier?.[0]?.value || '—'}</div>
                        <div><span className="font-medium">Category:</span> {proc.category?.coding?.[0]?.display || proc.category?.text || proc.category?.[0]?.coding?.[0]?.display || '—'}</div>
                        <div><span className="font-medium">Status Reason:</span> {proc.statusReason?.coding?.[0]?.display || proc.statusReason?.text || '—'}</div>
                        <div><span className="font-medium">Encounter:</span> {proc.encounter?.reference || '—'}</div>
                        <div><span className="font-medium">Location:</span> {proc.location?.display || proc.location?.reference || '—'}</div>
                        <div><span className="font-medium">Recorder:</span> {proc.recorder?.display || proc.recorder?.reference || '—'}</div>
                        <div><span className="font-medium">Asserter:</span> {proc.asserter?.display || proc.asserter?.reference || '—'}</div>
                        <div className="col-span-2">
                          <span className="font-medium">Performers:</span>{' '}
                          {proc.performer?.map((p: any) => [p.function?.coding?.[0]?.display, p.actor?.display || p.actor?.reference].filter(Boolean).join(' — ')).join('; ') || '—'}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Reason:</span>{' '}
                          {proc.reasonCode?.map((r: any) => r.text || r.coding?.[0]?.display).filter(Boolean).join('; ') ||
                            proc.reason?.map((r: any) => r.concept?.text || r.concept?.coding?.[0]?.display || r.reference?.display).filter(Boolean).join('; ') || '—'}
                        </div>
                        <div><span className="font-medium">Body Site:</span> {proc.bodySite?.map((b: any) => b.coding?.[0]?.display || b.text).filter(Boolean).join(', ') || '—'}</div>
                        <div><span className="font-medium">Outcome:</span> {proc.outcome?.coding?.[0]?.display || proc.outcome?.text || '—'}</div>
                        <div><span className="font-medium">Complication:</span> {proc.complication?.map((c: any) => c.concept?.text || c.concept?.coding?.[0]?.display || c.reference?.display).filter(Boolean).join('; ') || proc.complicationDetail?.map((c: any) => c.display || c.reference).filter(Boolean).join('; ') || '—'}</div>
                        <div><span className="font-medium">Follow-up:</span> {proc.followUp?.map((f: any) => f.coding?.[0]?.display || f.text).filter(Boolean).join(', ') || '—'}</div>
                        <div className="col-span-2"><span className="font-medium">Used:</span> {proc.usedCode?.map((c: any) => c.coding?.[0]?.display || c.text).filter(Boolean).join(', ') || proc.used?.map((u: any) => u.concept?.text || u.reference?.display).filter(Boolean).join(', ') || '—'}</div>
                        <div className="col-span-2"><span className="font-medium">Note:</span> {proc.note?.map((n: any) => n.text).join('; ') || '—'}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCarePlanTab = () => {
    if (cpLoading) return <Loading />;
    if (!carePlans.length) return <Empty />;
    return (
      <div className="space-y-4">
        {carePlans.map((cp: any) => (
          <div
            key={cp.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer"
            onClick={() => toggle(cp.id)}
          >
            <div className="px-6 py-4 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-base font-semibold text-gray-800">
                    {cp.title || cp.category?.[0]?.coding?.[0]?.display || 'Care Plan'}
                  </h3>
                  <StatusBadge status={cp.status} />
                </div>
                <div className="text-sm text-gray-500">
                  Period: {fmt(cp.period?.start)} → {fmt(cp.period?.end)}
                </div>
                <div className="text-sm text-gray-600 mt-1">{cp.description || '—'}</div>
              </div>
              <ExpandToggle open={expandedId === cp.id} />
            </div>
            {expandedId === cp.id && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 text-sm text-gray-700">
                {cp.goal?.length ? (
                  <div className="mb-3">
                    <p className="font-medium mb-1">Goals:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {cp.goal.map((g: any, i: number) => (
                        <li key={i}>{g.display || g.reference || JSON.stringify(g)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {cp.activity?.length ? (
                  <div>
                    <p className="font-medium mb-1">Activities:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {cp.activity.map((act: any, i: number) => {
                        const detail = act.plannedActivityDetail || act.detail;
                        const label =
                          detail?.code?.coding?.[0]?.display ||
                          detail?.code?.text ||
                          act.reference?.display ||
                          act.reference?.reference ||
                          '—';
                        return <li key={i}>{label} — {detail?.status || '—'}</li>;
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/queue"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-2"
          >
            ← Back to Queue
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">Patient Records</h1>
            <span className="text-gray-600">{patientName}</span>
            <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{mrn}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setExpandedId(null);
                }}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'encounter' && renderEncounterTab()}
        {activeTab === 'observation' && renderObservationTab()}
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'lab-results' && renderDiagnosticReportTable(labResults, drLoading)}
        {activeTab === 'rad-report' && renderDiagnosticReportTable(radReports, drLoading)}
        {activeTab === 'medication' && renderMedicationTab()}
        {activeTab === 'procedure' && renderProcedureTab()}
        {activeTab === 'careplan' && renderCarePlanTab()}
      </div>
    </div>
  );
};

export default PatientRecordsPage;
