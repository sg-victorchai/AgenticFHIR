import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import FHIR from 'fhirclient';
import {
  useGetPatientQuery,
  useSearchByPatientQuery,
  useGetResourceByIdQuery,
  useGetObservationsByIdsQuery,
  fhirApi,
} from '../services/fhir/client';
import { RootState } from '../store';
import AgentConversationModal from '../components/modals/AgentConversationModal';
import { AgentEndpointConfig } from '../types/agent';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId =
  | 'encounter'
  | 'condition'
  | 'observation'
  | 'orders'
  | 'lab-results'
  | 'rad-report'
  | 'medication'
  | 'procedure'
  | 'careplan';

type MedSubTab = 'request' | 'dispense' | 'statement';

interface HybridSearchResult {
  resourceType: string;
  resourceId: string;
  score: number;
  sources: string[];
  contributions: Record<string, number>;
}

interface HybridSearchResponse {
  query: string;
  totalResults: number;
  results: HybridSearchResult[];
}

interface MissionRequestConfig {
  headers: Record<string, string>;
  channel: 'patient-portal' | 'in-app';
}

interface HarmonizerJobStatusResponse {
  executionId?: string;
  jobId?: string;
  status?: string;
  personaId?: string;
  completedAt?: number;
  totalDurationMs?: number;
  currentStep?: string;
  stepResults?: HarmonizerStepResult[];
  progress?: {
    percentComplete?: number;
  };
  error?: string;
  message?: string;
  pollUrl?: string;
}

interface HarmonizerStepResult {
  stepName?: string;
  step?: string;
  name?: string;
  status?: string;
  durationMs?: number;
  durationSeconds?: number;
  summary?: Record<string, unknown> | string;
}

interface HarmonizerJobSummaryResponse {
  personaId?: string;
  tenantId?: string;
  status?: string;
  stepResults?: HarmonizerStepResult[];
  summary?: Record<string, unknown>;
  riskFlags?: Array<Record<string, unknown> | string>;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'encounter', label: 'Encounter' },
  { id: 'condition', label: 'Condition' },
  { id: 'observation', label: 'Observation' },
  { id: 'orders', label: 'Lab & Rad Order' },
  { id: 'lab-results', label: 'Lab & Path Report' },
  { id: 'rad-report', label: 'Rad Report' },
  { id: 'medication', label: 'Medication' },
  { id: 'procedure', label: 'Procedure' },
  { id: 'careplan', label: 'Care Plan' },
];

// ─── Sort & Filter ────────────────────────────────────────────────────────────

interface FilterField {
  key: string;
  label: string;
  param: string;
  type: 'date' | 'status' | 'text';
  options?: string[];
}

const ENC_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'date', type: 'date' },
  { key: 'type', label: 'Type', param: 'type:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'planned',
      'in-progress',
      'on-hold',
      'discharged',
      'completed',
      'cancelled',
      'entered-in-error',
      'unknown',
    ],
  },
];

const COND_FILTERS: FilterField[] = [
  { key: 'date', label: 'Onset', param: 'onset-date', type: 'date' },
  { key: 'code', label: 'Condition', param: 'code:text', type: 'text' },
  {
    key: 'clinicalStatus',
    label: 'Clinical Status',
    param: 'clinical-status',
    type: 'status',
    options: [
      'active',
      'recurrence',
      'relapse',
      'inactive',
      'remission',
      'resolved',
    ],
  },
];

const OBS_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'date', type: 'date' },
  { key: 'code', label: 'Code', param: 'code:text', type: 'text' },
  { key: 'category', label: 'Category', param: 'category:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'registered',
      'preliminary',
      'final',
      'amended',
      'corrected',
      'cancelled',
      'entered-in-error',
      'unknown',
    ],
  },
];

const SR_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'authored', type: 'date' },
  { key: 'code', label: 'Order', param: 'code:text', type: 'text' },
  { key: 'category', label: 'Category', param: 'category:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'draft',
      'active',
      'on-hold',
      'revoked',
      'completed',
      'entered-in-error',
      'unknown',
    ],
  },
  {
    key: 'priority',
    label: 'Priority',
    param: 'priority',
    type: 'status',
    options: ['routine', 'urgent', 'asap', 'stat'],
  },
];

const DR_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'date', type: 'date' },
  { key: 'code', label: 'Report', param: 'code:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'registered',
      'partial',
      'preliminary',
      'final',
      'amended',
      'corrected',
      'appended',
      'cancelled',
      'entered-in-error',
      'unknown',
    ],
  },
];

const MED_REQ_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'authoredon', type: 'date' },
  { key: 'medication', label: 'Medication', param: 'code:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'active',
      'on-hold',
      'ended',
      'stopped',
      'completed',
      'cancelled',
      'entered-in-error',
      'draft',
      'unknown',
    ],
  },
];

const MED_DISP_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'whenhandedover', type: 'date' },
  { key: 'medication', label: 'Medication', param: 'code:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'preparation',
      'in-progress',
      'cancelled',
      'on-hold',
      'completed',
      'entered-in-error',
      'stopped',
      'declined',
      'unknown',
    ],
  },
];

const MED_STMT_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'date', type: 'date' },
  { key: 'medication', label: 'Medication', param: 'code:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: ['recorded', 'entered-in-error', 'draft'],
  },
];

const PROC_FILTERS: FilterField[] = [
  { key: 'date', label: 'Date', param: 'date', type: 'date' },
  { key: 'code', label: 'Procedure', param: 'code:text', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'preparation',
      'in-progress',
      'not-done',
      'on-hold',
      'stopped',
      'completed',
      'entered-in-error',
      'unknown',
    ],
  },
];

const CP_FILTERS: FilterField[] = [
  { key: 'date', label: 'Period', param: 'date', type: 'date' },
  { key: 'title', label: 'Title', param: 'title:contains', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    param: 'status',
    type: 'status',
    options: [
      'draft',
      'active',
      'on-hold',
      'revoked',
      'completed',
      'entered-in-error',
      'unknown',
    ],
  },
  { key: 'category', label: 'Category', param: 'category:text', type: 'text' },
];

function buildExtraParams(
  filters: FilterField[],
  filterValues: Record<string, string>,
  sortParam: string,
  sortDir: 'asc' | 'desc',
): Record<string, string> {
  const params: Record<string, string> = {
    _sort: sortDir === 'desc' ? `-${sortParam}` : sortParam,
  };
  for (const f of filters) {
    if (f.type === 'date') {
      const op = filterValues[`${f.key}_op`];
      const val = filterValues[`${f.key}_val`];
      if (op && val) params[f.param] = `${op}${val}`;
    } else {
      const v = (filterValues[f.key] ?? '').trim();
      if (v) params[f.param] = v;
    }
  }
  return params;
}

const DEFAULT_RESOURCE_TYPES = [
  'Encounter',
  'Observation',
  'DiagnosticReport',
  'Condition',
  'MedicationRequest',
  'MedicationDispense',
  'MedicationStatement',
  'Procedure',
  'CarePlan',
];

// Agent/AI API base URL (separate from FHIR server URL)
let AGENT_API_BASE_URL =
  import.meta.env.VITE_AGENT_API_BASE_URL || 'http://localhost:8080';

// Helper function - CORS now enabled on Azure server, so no proxy needed
const getApiProxyUrl = (url: string): string => {
  // Return URL as-is since CORS is now enabled on the Azure server
  return url;
};

// Use proxy URL in development mode
AGENT_API_BASE_URL = getApiProxyUrl(AGENT_API_BASE_URL);
const HARMONIZER_PERSONA_ID = 'clinical-docs-harmonizer';
const HARMONIZER_IMPORT_URL =
  import.meta.env.VITE_HARMONIZER_IMPORT_URL ||
  `${AGENT_API_BASE_URL}/api/persona/DataPipelinePersona/${HARMONIZER_PERSONA_ID}/$execute`;
const HARMONIZER_STATUS_URL_BASE =
  import.meta.env.VITE_HARMONIZER_STATUS_URL_BASE ||
  `${AGENT_API_BASE_URL}/api/persona/DataPipelinePersona/${HARMONIZER_PERSONA_ID}/$status`;

const API_KEY = import.meta.env.VITE_API_KEY;
if (!API_KEY && import.meta.env.DEV) {
  console.warn(
    'VITE_API_KEY environment variable is not set. Some operations may fail.',
  );
}

const PAGE_SIZE = 5;
const HARMONIZER_POLL_INTERVAL_MS = 3000;
const HARMONIZER_POLL_TIMEOUT_MS = 120000;

const getResourceTypesFromQuery = (query: string): string[] => {
  const q = query.toLowerCase().trim();
  if (q.startsWith('visit') || q.startsWith('encounter')) return ['Encounter'];
  if (q.startsWith('problem') || q.startsWith('condition'))
    return ['Condition'];
  if (q.startsWith('lab') || q.startsWith('test'))
    return ['Observation', 'DiagnosticReport', 'ServiceRequest'];
  if (q.startsWith('procedure')) return ['Procedure'];
  if (/^meds?\b/.test(q) || q.startsWith('medication'))
    return ['MedicationRequest', 'MedicationDispense', 'MedicationStatement'];
  if (
    q.startsWith('care plan') ||
    q.startsWith('careplan') ||
    q.startsWith('plan')
  )
    return ['CarePlan'];
  return DEFAULT_RESOURCE_TYPES;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (dt?: string) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span className="text-gray-400">—</span>;
  const cls =
    status === 'active' ||
    status === 'final' ||
    status === 'completed' ||
    status === 'finished'
      ? 'bg-green-100 text-green-800'
      : status === 'in-progress' || status === 'preliminary'
        ? 'bg-blue-100 text-blue-800'
        : status === 'cancelled' || status === 'entered-in-error'
          ? 'bg-red-100 text-red-800'
          : status === 'draft' || status === 'planned'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
};

const ExpandToggle: React.FC<{ open: boolean }> = ({ open }) => (
  <span className="text-gray-400 font-semibold">{open ? '−' : '+'}</span>
);

const TH: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <th
    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className ?? ''}`}
  >
    {children}
  </th>
);

const TD: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <td className={`px-4 py-3 text-sm text-gray-800 ${className ?? ''}`}>
    {children ?? '—'}
  </td>
);

const Loading = () => (
  <div className="flex justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
  </div>
);

const Empty = () => (
  <div className="text-center py-12 text-gray-400">No records found.</div>
);

const parseReference = (
  reference?: string,
): { type: string; id: string } | null => {
  if (!reference) return null;
  const normalized = reference.split('?')[0].replace(/\/$/, '');
  const parts = normalized.split('/');
  if (parts.length < 2) return null;
  const id = parts[parts.length - 1];
  const type = parts[parts.length - 2];
  if (!id || !type) return null;
  return { type, id };
};

const getObservationSummaryValue = (obs: any): string => {
  if (obs.valueQuantity) {
    return `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`.trim();
  }
  return (
    obs.valueString ||
    obs.valueCodeableConcept?.text ||
    (obs.component?.length ? `${obs.component.length} components` : '—')
  );
};

const getInterpretationBadge = (obs: any) => {
  const interpretation =
    obs.interpretation?.[0]?.coding?.[0]?.display ||
    obs.interpretation?.[0]?.coding?.[0]?.code ||
    obs.interpretation?.[0]?.text;

  if (!interpretation) return null;

  let bgColor = 'bg-gray-100 text-gray-800';
  if (
    interpretation.toLowerCase().includes('critical') ||
    interpretation.toLowerCase().includes('abnormal high') ||
    interpretation.toLowerCase().includes('abnormal low')
  ) {
    bgColor = 'bg-red-100 text-red-800';
  } else if (interpretation.toLowerCase().includes('high')) {
    bgColor = 'bg-yellow-100 text-yellow-800';
  } else if (interpretation.toLowerCase().includes('low')) {
    bgColor = 'bg-yellow-100 text-yellow-800';
  } else if (interpretation.toLowerCase().includes('normal')) {
    bgColor = 'bg-green-100 text-green-800';
  }

  return { text: interpretation, bgColor };
};

const ObservationReferencedResources: React.FC<{ observation: any }> = ({
  observation,
}) => {
  const groupedReferences = React.useMemo(() => {
    const grouped = new Map<
      string,
      Array<{ ref: any; resourceId: string; resource?: any }>
    >();
    const containedById = new Map<string, any>(
      (observation.contained ?? [])
        .filter((c: any) => c?.id)
        .map((c: any) => [String(c.id), c]),
    );

    // Process both hasMember and derivedFrom
    const allRefs = [
      ...(observation.hasMember ?? []).map((r: any) => ({
        ...r,
        refType: 'hasMember',
      })),
      ...(observation.derivedFrom ?? []).map((r: any) => ({
        ...r,
        refType: 'derivedFrom',
      })),
    ];

    for (const ref of allRefs) {
      const rawReference = String(ref.reference ?? '');
      const parsed = parseReference(rawReference);
      const containedRefId = rawReference.startsWith('#')
        ? rawReference.slice(1)
        : '';
      const refId = parsed?.id ?? containedRefId;
      const contained = refId ? containedById.get(refId) : undefined;
      const resourceType = contained?.resourceType || parsed?.type || 'Unknown';
      const bucket = grouped.get(resourceType) ?? [];
      bucket.push({
        ref,
        resourceId: refId,
        resource: contained,
      });
      grouped.set(resourceType, bucket);
    }

    return grouped;
  }, [observation.contained, observation.hasMember, observation.derivedFrom]);

  const observationRefs = groupedReferences.get('Observation') ?? [];
  const questionnaireResponseRefs =
    groupedReferences.get('QuestionnaireResponse') ?? [];
  const otherReferenceTypes = Array.from(groupedReferences.keys()).filter(
    (type) => type !== 'Observation' && type !== 'QuestionnaireResponse',
  );

  // Fetch external observation references
  const observationIdsToFetch = React.useMemo(
    () =>
      observationRefs
        .filter((r) => !r.resource && r.resourceId)
        .map((r) => r.resourceId),
    [observationRefs],
  );

  const { data: referencedObservationsBundle } = useGetObservationsByIdsQuery(
    observationIdsToFetch,
    { skip: observationIdsToFetch.length === 0 },
  );

  const referencedObservationsById = React.useMemo(
    () =>
      new Map<string, any>(
        (referencedObservationsBundle?.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'Observation' && r?.id)
          .map((r: any) => [String(r.id), r]),
      ),
    [referencedObservationsBundle],
  );

  const resolvedObservationResources = observationRefs
    .map((r) => r.resource || referencedObservationsById.get(r.resourceId))
    .filter(Boolean);

  if (
    !resolvedObservationResources.length &&
    !questionnaireResponseRefs.length &&
    !otherReferenceTypes.length
  )
    return null;

  return (
    <div className="space-y-3">
      {resolvedObservationResources.length ? (
        <div>
          <p className="font-medium mb-2">Referenced Observations:</p>
          <div className="overflow-auto border border-gray-200 rounded bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Date',
                    'Code',
                    'Category',
                    'Value',
                    'Status',
                    'Last Updated',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resolvedObservationResources.map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      {fmt(r.effectiveDateTime || r.effectivePeriod?.start)}
                    </td>
                    <td className="px-3 py-2">
                      {r.code?.coding?.[0]?.display ||
                        r.code?.text ||
                        r.code?.coding?.[0]?.code ||
                        '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.category?.[0]?.coding?.[0]?.display ||
                        r.category?.[0]?.coding?.[0]?.code ||
                        '—'}
                    </td>
                    <td className="px-3 py-2">
                      {getObservationSummaryValue(r)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2">{fmt(r.meta?.lastUpdated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {questionnaireResponseRefs.length ? (
        <div>
          <p className="font-medium mb-2">
            Referenced Questionnaire Responses:
          </p>
          <div className="space-y-2">
            {questionnaireResponseRefs.map((r: any) =>
              r.resource ? (
                <div
                  key={r.resource.id}
                  className="border border-gray-200 rounded bg-white p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium">
                        {r.resource.questionnaire?.split('/')[1] || '—'}
                      </span>
                      <span className="text-gray-500 ml-2">
                        ({r.resource.id})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div>
                        <StatusBadge status={r.resource.status} />
                      </div>
                      <div className="text-gray-500">
                        {fmt(r.resource.meta?.lastUpdated)}
                      </div>
                    </div>
                  </div>
                  {r.resource.item?.length ? (
                    <div className="mt-2 space-y-1 text-xs">
                      {r.resource.item.map((item: any, idx: number) => {
                        const answer = item.answer?.[0];
                        const answerValue = answer
                          ? answer.valueBoolean !== undefined
                            ? String(answer.valueBoolean)
                            : answer.valueInteger !== undefined
                              ? String(answer.valueInteger)
                              : answer.valueString ||
                                answer.valueDate ||
                                answer.valueDecimal ||
                                answer.valueCoding?.display ||
                                answer.valueCoding?.code ||
                                '—'
                          : '(no answer)';
                        return (
                          <div key={idx} className="text-gray-700">
                            <span className="font-medium">
                              {item.text || item.linkId || `Item ${idx + 1}`}
                            </span>
                            :{' '}
                            <span className="text-gray-600">{answerValue}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-2">
                      No items found.
                    </div>
                  )}
                </div>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {otherReferenceTypes.map((resourceType) => (
        <div key={resourceType}>
          <p className="font-medium mb-2">Referenced {resourceType}s:</p>
          <div className="overflow-auto border border-gray-200 rounded bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                    Display
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(groupedReferences.get(resourceType) ?? []).map((r, i) => (
                  <tr key={`${resourceType}-${r.resourceId || i}`}>
                    <td className="px-3 py-2">
                      {r.ref.reference ||
                        `${resourceType}/${r.resourceId}` ||
                        '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.resource?.code?.text ||
                        r.resource?.code?.coding?.[0]?.display ||
                        r.ref.display ||
                        '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

const DiagnosticReportReferencedResources: React.FC<{ report: any }> = ({
  report,
}) => {
  const groupedReferences = React.useMemo(() => {
    const grouped = new Map<
      string,
      Array<{ ref: any; resourceId: string; resource?: any }>
    >();
    const containedById = new Map<string, any>(
      (report.contained ?? [])
        .filter((c: any) => c?.id)
        .map((c: any) => [String(c.id), c]),
    );

    for (const ref of report.result ?? []) {
      const rawReference = String(ref.reference ?? '');
      const parsed = parseReference(rawReference);
      const containedRefId = rawReference.startsWith('#')
        ? rawReference.slice(1)
        : '';
      const refId = parsed?.id ?? containedRefId;
      const contained = refId ? containedById.get(refId) : undefined;
      const resourceType = contained?.resourceType || parsed?.type || 'Unknown';
      const bucket = grouped.get(resourceType) ?? [];
      bucket.push({
        ref,
        resourceId: refId,
        resource: contained,
      });
      grouped.set(resourceType, bucket);
    }

    return grouped;
  }, [report.contained, report.result]);

  const observationRefs = groupedReferences.get('Observation') ?? [];
  const observationIdsToFetch = React.useMemo(
    () =>
      observationRefs
        .filter((r) => !r.resource && r.resourceId)
        .map((r) => r.resourceId),
    [observationRefs],
  );

  const { data: referencedObservationsBundle } = useGetObservationsByIdsQuery(
    observationIdsToFetch,
    { skip: observationIdsToFetch.length === 0 },
  );

  const referencedObservationsById = React.useMemo(
    () =>
      new Map<string, any>(
        (referencedObservationsBundle?.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'Observation' && r?.id)
          .map((r: any) => [String(r.id), r]),
      ),
    [referencedObservationsBundle],
  );

  const resolvedObservationResources = observationRefs
    .map((r) => r.resource || referencedObservationsById.get(r.resourceId))
    .filter(Boolean);

  const otherReferenceTypes = Array.from(groupedReferences.keys()).filter(
    (type) => type !== 'Observation',
  );

  if (!observationRefs.length && !otherReferenceTypes.length) return null;

  return (
    <div className="space-y-3">
      {observationRefs.length ? (
        <div>
          <p className="font-medium mb-2">Included Observations:</p>
          {!resolvedObservationResources.length ? (
            <div className="text-xs text-gray-500">
              No observation details found.
            </div>
          ) : (
            <div className="border border-gray-200 rounded bg-white">
              {/* Mobile Card Layout */}
              <div className="md:hidden space-y-2 p-3">
                {resolvedObservationResources.map((obs: any) => {
                  const interpretation = getInterpretationBadge(obs);
                  return (
                    <div
                      key={obs.id}
                      className="border border-gray-300 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">
                            {fmt(obs.effectiveDateTime)}
                          </div>
                          <div className="font-medium text-sm text-gray-900">
                            {obs.code?.coding?.[0]?.display ||
                              obs.code?.text ||
                              obs.code?.coding?.[0]?.code ||
                              '—'}
                          </div>
                        </div>
                        <div>
                          <StatusBadge status={obs.status} />
                        </div>
                      </div>
                      <div className="border-t border-gray-300 pt-2 mt-2">
                        <div className="mb-2">
                          <div className="text-xs font-medium text-gray-600 mb-1">
                            Value
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {getObservationSummaryValue(obs)}
                          </div>
                        </div>
                        {interpretation && (
                          <div>
                            <span
                              className={`inline-block text-xs font-medium px-2 py-1 rounded ${interpretation.bgColor}`}
                            >
                              {interpretation.text}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Interpretation
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Last Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resolvedObservationResources.map((obs: any) => {
                      const interpretation = getInterpretationBadge(obs);
                      return (
                        <tr key={obs.id}>
                          <td className="px-3 py-2">
                            {fmt(obs.effectiveDateTime)}
                          </td>
                          <td className="px-3 py-2">
                            {obs.code?.coding?.[0]?.display ||
                              obs.code?.text ||
                              obs.code?.coding?.[0]?.code ||
                              '—'}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {getObservationSummaryValue(obs)}
                          </td>
                          <td className="px-3 py-2">
                            {interpretation ? (
                              <span
                                className={`inline-block text-xs font-medium px-2 py-1 rounded ${interpretation.bgColor}`}
                              >
                                {interpretation.text}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {obs.category?.[0]?.coding?.[0]?.display ||
                              obs.category?.[0]?.coding?.[0]?.code ||
                              '—'}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={obs.status} />
                          </td>
                          <td className="px-3 py-2">
                            {fmt(obs.meta?.lastUpdated)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {otherReferenceTypes.map((resourceType) => (
        <div key={resourceType}>
          <p className="font-medium mb-2">Included {resourceType}s:</p>
          <div className="overflow-auto border border-gray-200 rounded bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                    Display
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(groupedReferences.get(resourceType) ?? []).map((r, i) => (
                  <tr key={`${resourceType}-${r.resourceId || i}`}>
                    <td className="px-3 py-2">
                      {r.ref.reference ||
                        `${resourceType}/${r.resourceId}` ||
                        '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.resource?.code?.text ||
                        r.resource?.code?.coding?.[0]?.display ||
                        r.ref.display ||
                        '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Sort & Filter UI components ─────────────────────────────────────────────

const SortHeader: React.FC<{
  label: string;
  sortDir: 'asc' | 'desc';
  onToggle: () => void;
}> = ({ label, sortDir, onToggle }) => (
  <th
    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
    onClick={onToggle}
  >
    {label} {sortDir === 'desc' ? '↓' : '↑'}
  </th>
);

const Pagination: React.FC<{
  total: number | undefined;
  page: number;
  pageSize: number;
  onChange: (page: number) => void;
  links?: Array<{ relation: string; url: string }>;
}> = ({ total, page, pageSize, onChange, links }) => {
  const [jumpInput, setJumpInput] = React.useState('');

  if (total === undefined || total === 0) return null;

  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const hasPrev = links
    ? links.some((l) => l.relation === 'previous')
    : page > 1;
  const hasNext = links
    ? links.some((l) => l.relation === 'next')
    : page < totalPages;

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [];
    const delta = 1;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const handleJump = () => {
    const n = parseInt(jumpInput, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onChange(n);
      setJumpInput('');
    }
  };

  const btnBase =
    'inline-flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-md text-sm font-medium transition-colors focus:outline-none';
  const btnActive = `${btnBase} bg-blue-600 text-white shadow-sm`;
  const btnInactive = `${btnBase} text-gray-600 hover:bg-gray-100 border border-gray-200`;
  const btnDisabled = `${btnBase} text-gray-300 cursor-not-allowed border border-gray-100`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-1">
      <span className="text-xs text-gray-500 whitespace-nowrap">
        Showing{' '}
        <span className="font-medium text-gray-700">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-gray-700">{total}</span> records
      </span>

      <div className="flex items-center gap-1">
        <button
          className={hasPrev ? btnInactive : btnDisabled}
          onClick={() => hasPrev && onChange(1)}
          disabled={!hasPrev}
          title="First page"
        >
          «
        </button>
        <button
          className={hasPrev ? btnInactive : btnDisabled}
          onClick={() => hasPrev && onChange(page - 1)}
          disabled={!hasPrev}
          title="Previous page"
        >
          ‹
        </button>

        {getPages().map((p, i) =>
          p === '...' ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1 text-gray-400 text-sm select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              className={p === page ? btnActive : btnInactive}
              onClick={() => p !== page && onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}

        <button
          className={hasNext ? btnInactive : btnDisabled}
          onClick={() => hasNext && onChange(page + 1)}
          disabled={!hasNext}
          title="Next page"
        >
          ›
        </button>
        <button
          className={hasNext ? btnInactive : btnDisabled}
          onClick={() => hasNext && onChange(totalPages)}
          disabled={!hasNext}
          title="Last page"
        >
          »
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 whitespace-nowrap">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpInput}
          onChange={(e) => setJumpInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJump()}
          className="w-14 h-8 text-xs text-center border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder={String(page)}
        />
        <button
          onClick={handleJump}
          className="h-8 px-2.5 text-xs bg-blue-50 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-100 font-medium transition-colors"
        >
          Go
        </button>
      </div>
    </div>
  );
};

const FilterPanel: React.FC<{
  filters: FilterField[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}> = ({ filters, values, onChange }) => {
  const set = (key: string, val: string) => onChange({ ...values, [key]: val });
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3">
      <div className="flex flex-wrap gap-3 items-end justify-end">
        {filters.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              {f.label}
            </label>
            {f.type === 'date' && (
              <div className="flex gap-1">
                <select
                  value={values[`${f.key}_op`] || ''}
                  onChange={(e) => set(`${f.key}_op`, e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
                >
                  <option value="">Any</option>
                  <option value="ge">After</option>
                  <option value="le">Before</option>
                  <option value="eq">On</option>
                </select>
                <input
                  type="date"
                  value={values[`${f.key}_val`] || ''}
                  onChange={(e) => set(`${f.key}_val`, e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
                />
              </div>
            )}
            {f.type === 'status' && (
              <select
                value={values[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">All</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {f.type === 'text' && (
              <input
                type="text"
                value={values[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder="contains…"
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white w-36"
              />
            )}
          </div>
        ))}
        <button
          onClick={() => onChange({})}
          className="text-xs px-2 py-1 border border-red-200 text-red-500 hover:text-red-700 hover:border-red-400 rounded self-end"
        >
          Clear
        </button>
      </div>
    </div>
  );
};

// ─── Search Result Card ───────────────────────────────────────────────────────

const SearchResultCard: React.FC<{
  result: HybridSearchResult;
  onNavigate?: (tab: TabId, resourceId: string, medSubTab?: MedSubTab) => void;
}> = ({ result, onNavigate }) => {
  const { data: resource, isLoading } = useGetResourceByIdQuery({
    resourceType: result.resourceType,
    id: result.resourceId,
  });

  if (isLoading)
    return <div className="animate-pulse h-7 bg-gray-100 rounded" />;
  if (!resource) return null;

  const r = resource as any;

  const getSummary = (): string => {
    switch (result.resourceType) {
      case 'Encounter':
        return [
          r.type?.[0]?.text || r.class?.[0]?.coding?.[0]?.display || 'Visit',
          r.reason?.[0]?.value?.[0]?.concept?.text,
        ]
          .filter(Boolean)
          .join(' — ');
      case 'Condition':
        return `${r.code?.coding?.[0]?.display || r.code?.text || '—'} (${r.clinicalStatus?.coding?.[0]?.code || r.status || '—'})`;
      case 'MedicationRequest':
        return (
          [
            r.medication?.concept?.text ||
              r.medication?.concept?.coding?.[0]?.display,
            r.dosageInstruction?.[0]?.text,
          ]
            .filter(Boolean)
            .join(' · ') || '—'
        );
      case 'MedicationDispense':
        return `${r.medication?.concept?.text || r.medication?.concept?.coding?.[0]?.display || '—'} — dispensed`;
      case 'MedicationStatement':
        return (
          r.medication?.concept?.text ||
          r.medication?.concept?.coding?.[0]?.display ||
          '—'
        );
      case 'DiagnosticReport':
        return r.code?.text || r.code?.coding?.[0]?.display || '—';
      case 'Observation':
        return `${r.code?.coding?.[0]?.display || r.code?.text || '—'}: ${r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit}` : r.valueString || (r.component?.length ? `${r.component.length} components` : '—')}`;
      case 'Procedure':
        return r.code?.coding?.[0]?.display || r.code?.text || '—';
      case 'CarePlan':
        return r.title || r.category?.[0]?.coding?.[0]?.display || 'Care Plan';
      default:
        return `${result.resourceType}/${result.resourceId}`;
    }
  };

  const getDate = (): string =>
    r.authoredOn ||
    r.effectiveDateTime ||
    r.issued ||
    r.actualPeriod?.start ||
    r.period?.start ||
    r.performedDateTime ||
    r.occurrenceDateTime ||
    r.onsetDateTime ||
    r.dateAsserted ||
    '';

  const sourceCls =
    result.sources.includes('vector') && result.sources.includes('keyword')
      ? 'bg-purple-100 text-purple-700'
      : result.sources.includes('vector')
        ? 'bg-blue-100 text-blue-700'
        : 'bg-amber-100 text-amber-700';

  const getNavTarget = (): { tab: TabId; medSubTab?: MedSubTab } | null => {
    const r2 = resource as any;
    switch (result.resourceType) {
      case 'Encounter':
        return { tab: 'encounter' };
      case 'Observation':
        return { tab: 'observation' };
      case 'ServiceRequest':
        return { tab: 'orders' };
      case 'DiagnosticReport': {
        const isRad = r2?.category?.some((c: any) =>
          c.coding?.some(
            (cd: any) =>
              cd.code === 'RAD' ||
              cd.code === '4261000179101' ||
              cd.display?.toLowerCase().includes('rad') ||
              cd.display?.toLowerCase().includes('imaging'),
          ),
        );
        return { tab: isRad ? 'rad-report' : 'lab-results' };
      }
      case 'MedicationRequest':
        return { tab: 'medication', medSubTab: 'request' };
      case 'MedicationDispense':
        return { tab: 'medication', medSubTab: 'dispense' };
      case 'MedicationStatement':
        return { tab: 'medication', medSubTab: 'statement' };
      case 'Procedure':
        return { tab: 'procedure' };
      case 'CarePlan':
        return { tab: 'careplan' };
      case 'Condition':
        return { tab: 'condition' };
      default:
        return null;
    }
  };

  const navTarget = resource ? getNavTarget() : null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 rounded transition-colors text-xs ${
        navTarget && onNavigate
          ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
          : ''
      }`}
      title={navTarget ? 'Click to navigate to this record' : undefined}
      onClick={
        navTarget && onNavigate
          ? () =>
              onNavigate(navTarget.tab, result.resourceId, navTarget.medSubTab)
          : undefined
      }
    >
      <span className="font-semibold text-indigo-600 uppercase tracking-wide w-28 shrink-0 truncate">
        {result.resourceType}
      </span>
      <span className="flex-1 text-gray-800 truncate">{getSummary()}</span>
      {getDate() && (
        <span className="text-gray-400 whitespace-nowrap shrink-0">
          {fmt(getDate())}
        </span>
      )}
      <span
        className={`px-1.5 py-0.5 rounded font-medium whitespace-nowrap shrink-0 ${sourceCls}`}
      >
        {result.sources.join('+')}
      </span>
      <span className="text-gray-400 whitespace-nowrap shrink-0 w-10 text-right">
        {(result.score * 100).toFixed(0)}%
      </span>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const PatientRecordsPage: React.FC = () => {
  const { id: patientId } = useParams<{ id: string }>();
  const role = useSelector((state: RootState) => state.ui.role);
  const dispatch = useDispatch();
  const pollRunIdRef = useRef(0);
  const uploadPollRunIdRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = sessionStorage.getItem('activeTab');
    return (saved as TabId) || 'encounter';
  });
  const [medSubTab, setMedSubTab] = useState<MedSubTab>('request');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilter, setShowFilter] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const resetSortFilter = () => {
    setSortDir('desc');
    setShowFilter(false);
    setFilterValues({});
    setCurrentPage(1);
  };

  const [currentPage, setCurrentPage] = useState(1);

  // Persist active tab to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterValues, sortDir]);

  // ── Search state ──
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showClinicianUpload, setShowClinicianUpload] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] =
    useState<HybridSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Agent conversation modal state ──
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [agentModalError, setAgentModalError] = useState<string | null>(null);
  const [agentTenantId, setAgentTenantId] = useState<string>(
    import.meta.env.VITE_TENANT_ID || 'default',
  );
  const [agentAccessToken, setAgentAccessToken] = useState<string | undefined>(
    undefined,
  );
  const [agentExtraHeaders, setAgentExtraHeaders] = useState<
    Record<string, string>
  >({});

  // ── Clinician scanned notes upload state ──
  const [selectedNoteFile, setSelectedNoteFile] = useState<File | null>(null);
  const [isUploadingNotes, setIsUploadingNotes] = useState(false);
  const [noteUploadMessage, setNoteUploadMessage] = useState<string | null>(
    null,
  );
  const [noteUploadError, setNoteUploadError] = useState<string | null>(null);
  const [noteUploadJobId, setNoteUploadJobId] = useState<string | null>(null);
  const [noteUploadJobStatus, setNoteUploadJobStatus] = useState<string | null>(
    null,
  );
  const [, setNoteUploadCurrentStep] = useState<string | null>(null);
  const [noteUploadPercent, setNoteUploadPercent] = useState<number | null>(
    null,
  );
  const [noteUploadStepResults, setNoteUploadStepResults] = useState<
    HarmonizerStepResult[]
  >([]);
  const [isNoteUploadPolling, setIsNoteUploadPolling] = useState(false);
  const [noteUploadRetryMaxAttempts] = useState(3); // Max automatic retry attempts
  const [noteUploadSummary, setNoteUploadSummary] =
    useState<HarmonizerJobSummaryResponse | null>(null);
  const [isLoadingNoteUploadSummary, setIsLoadingNoteUploadSummary] =
    useState(false);

  // ── Upload panel resize state ──
  const [uploadPanelWidth, setUploadPanelWidth] = useState(30); // Default 30% width
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const newWidth = ((rect.right - e.clientX) / rect.width) * 100;

      // Constrain width between 20% and 60%
      if (newWidth >= 20 && newWidth <= 60) {
        setUploadPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        if (comma === -1) {
          reject(new Error('Unable to read selected file.'));
          return;
        }
        resolve(result.slice(comma + 1));
      };
      reader.onerror = () => reject(new Error('Unable to read selected file.'));
      reader.readAsDataURL(file);
    });

  const getHarmonizerDocumentType = (
    file: File,
  ): 'text' | 'pdf' | 'cda' | 'hl7v2' | 'image' => {
    const fileName = file.name.toLowerCase();
    const mime = (file.type || '').toLowerCase();

    if (mime === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf';
    if (
      mime === 'text/xml' ||
      mime === 'application/xml' ||
      fileName.endsWith('.cda')
    )
      return 'cda';
    if (
      mime.includes('hl7') ||
      fileName.endsWith('.hl7') ||
      fileName.endsWith('.hl7v2') ||
      fileName.endsWith('.v2')
    )
      return 'hl7v2';
    if (mime.startsWith('image/')) return 'image';
    return 'text';
  };

  const getHarmonizerPollUrl = (jobId: string, pollUrl?: string): string => {
    // If a poll URL was provided in the response, use it (may be in old or new format)
    if (pollUrl) {
      if (/^https?:\/\//i.test(pollUrl)) {
        // For absolute URLs, check if already in new format
        if (pollUrl.includes('/$status?job=')) {
          return pollUrl; // Already in new format
        }
        // Otherwise normalize old format to new format
        try {
          const url = new URL(pollUrl);
          if (url.pathname.includes('/api/personas/')) {
            return `${url.origin}${HARMONIZER_STATUS_URL_BASE.replace(AGENT_API_BASE_URL, '')}?job=${encodeURIComponent(jobId)}`;
          }
          return pollUrl;
        } catch {
          return `${HARMONIZER_STATUS_URL_BASE}?job=${encodeURIComponent(jobId)}`;
        }
      }

      if (pollUrl.startsWith('/')) {
        // For relative paths, check format and build full URL
        if (pollUrl.includes('/$status?job=')) {
          return `${AGENT_API_BASE_URL}${pollUrl}`;
        }
      }
    }
    // Default to new status endpoint format
    return `${HARMONIZER_STATUS_URL_BASE}?job=${encodeURIComponent(jobId)}`;
  };

  const normalizeHarmonizerStatus = (status?: string): string =>
    String(status || '').toUpperCase();

  const HARMONIZER_STATUS_STEPS = ['QUEUE', 'RUNNING', 'COMPLETED'] as const;

  const mapHarmonizerStatusToStep = (
    status?: string,
  ): (typeof HARMONIZER_STATUS_STEPS)[number] | 'FAILED' => {
    const normalized = normalizeHarmonizerStatus(status);

    if (
      normalized === 'FAILED' ||
      normalized === 'ERROR' ||
      normalized === 'CANCELLED'
    ) {
      return 'FAILED';
    }

    if (
      normalized === 'SUBMITTED' ||
      normalized === 'ACCEPTED' ||
      normalized === 'QUEUED' ||
      normalized === 'PENDING' ||
      normalized === 'QUEUE'
    ) {
      return 'QUEUE';
    }

    if (normalized === 'RUNNING' || normalized === 'IN_PROGRESS') {
      return 'RUNNING';
    }

    if (normalized === 'COMPLETED' || normalized === 'SUCCESS') {
      return 'COMPLETED';
    }

    return 'QUEUE';
  };

  const toDisplayJson = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value == null) return '—';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const fetchHarmonizerJobSummary = async (
    jobId: string,
    headers: Record<string, string>,
    runId: number,
  ) => {
    if (runId !== uploadPollRunIdRef.current) return;

    // Use status endpoint to fetch the complete job result
    const statusUrl = `${HARMONIZER_STATUS_URL_BASE}?job=${encodeURIComponent(jobId)}`;
    setIsLoadingNoteUploadSummary(true);

    try {
      const response = await fetch(statusUrl, { headers });
      if (runId !== uploadPollRunIdRef.current) return;

      let payload: HarmonizerJobStatusResponse = {};
      try {
        payload = (await response.json()) as HarmonizerJobStatusResponse;
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(`Unable to fetch import summary (${response.status}).`);
      }

      // Map the status response to the summary format
      const summary: HarmonizerJobSummaryResponse = {
        personaId: payload.personaId,
        status: payload.status,
        stepResults: payload.stepResults,
        summary: (payload as any).outputs,
        riskFlags: (payload as any).riskFlags,
      };
      setNoteUploadSummary(summary);
    } catch (err: any) {
      if (runId === uploadPollRunIdRef.current) {
        setNoteUploadError(
          err?.message ||
            'Import finished, but summary could not be retrieved right now.',
        );
      }
    } finally {
      if (runId === uploadPollRunIdRef.current) {
        setIsLoadingNoteUploadSummary(false);
      }
    }
  };

  const pollHarmonizerJobStatus = async (
    jobId: string,
    headers: Record<string, string>,
    runId: number,
    pollUrl?: string,
  ) => {
    const statusUrl = getHarmonizerPollUrl(jobId, pollUrl);
    let lastError: Error | null = null;

    // Retry loop: attempt polling up to (1 + retryMaxAttempts) times
    for (
      let attemptNum = 0;
      attemptNum <= noteUploadRetryMaxAttempts;
      attemptNum++
    ) {
      if (runId !== uploadPollRunIdRef.current) return;

      setIsNoteUploadPolling(true);
      if (attemptNum > 0) {
        setNoteUploadMessage(
          `Retrying job status (attempt ${attemptNum}/${noteUploadRetryMaxAttempts})...`,
        );
        // Wait before retrying
        await sleep(2000);
      }

      const started = Date.now();

      try {
        while (Date.now() - started < HARMONIZER_POLL_TIMEOUT_MS) {
          if (runId !== uploadPollRunIdRef.current) return;

          const response = await fetch(statusUrl, { headers });

          let payload: HarmonizerJobStatusResponse = {};
          try {
            payload = (await response.json()) as HarmonizerJobStatusResponse;
          } catch {
            payload = {};
          }

          if (!response.ok) {
            const attemptedUrl = response.url || statusUrl;
            const serverMessage =
              payload.error ||
              payload.message ||
              `Harmonizer status request failed (${response.status}) at ${attemptedUrl}.`;
            throw new Error(serverMessage);
          }

          const status = normalizeHarmonizerStatus(payload.status) || 'RUNNING';
          const mappedStatus = mapHarmonizerStatusToStep(status);
          const completedStepResults = (payload.stepResults || []).filter(
            (step) => normalizeHarmonizerStatus(step.status) === 'COMPLETED',
          );

          if (completedStepResults.length) {
            setNoteUploadStepResults(completedStepResults);
          }

          if (mappedStatus !== 'FAILED' && mappedStatus !== 'COMPLETED') {
            setNoteUploadJobStatus('RUNNING');
          }
          setNoteUploadCurrentStep(payload.currentStep || null);
          setNoteUploadPercent(
            typeof payload.progress?.percentComplete === 'number'
              ? payload.progress.percentComplete
              : null,
          );

          if (mappedStatus === 'COMPLETED') {
            setNoteUploadJobStatus('COMPLETED');
            setIsNoteUploadPolling(false);
            setNoteUploadError(null); // Clear any previous error
            setNoteUploadMessage(`Harmonizer completed (${jobId}).`);
            void fetchHarmonizerJobSummary(jobId, headers, runId);
            return;
          }

          if (mappedStatus === 'FAILED') {
            setNoteUploadJobStatus('FAILED');
            setIsNoteUploadPolling(false);
            const failure =
              payload.error ||
              payload.message ||
              'Harmonizer processing failed.';
            throw new Error(failure);
          }

          await sleep(HARMONIZER_POLL_INTERVAL_MS);
        }

        // If we exit the while loop without return, it means timeout
        throw new Error('Harmonizer job timed out. Retrying...');
      } catch (err: any) {
        lastError = err;
        const isTimeout = err?.message?.includes('timed out');
        const hasMoreRetries = attemptNum < noteUploadRetryMaxAttempts;

        if (isTimeout && hasMoreRetries) {
          // Continue to next retry
          continue;
        } else {
          // No more retries or non-timeout error
          setIsNoteUploadPolling(false);
          throw lastError;
        }
      }
    }

    // All retries exhausted
    setIsNoteUploadPolling(false);
    throw (
      lastError ||
      new Error('Harmonizer job timed out. Please check again shortly.')
    );
  };

  const handleCheckNoteUploadStatus = async () => {
    if (!noteUploadJobId) return;

    setNoteUploadError(null);
    setNoteUploadMessage('Checking job status...');

    uploadPollRunIdRef.current += 1;
    const currentUploadRunId = uploadPollRunIdRef.current;

    try {
      const { headers } = await buildMissionRequestConfig();
      await pollHarmonizerJobStatus(
        noteUploadJobId,
        headers,
        currentUploadRunId,
      );
    } catch (err: any) {
      setNoteUploadError(
        err?.message || 'Unable to check job status. Please try again later.',
      );
    }
  };

  const handleUploadScannedNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteUploadError(null);
    setNoteUploadMessage(null);
    setNoteUploadJobId(null);
    setNoteUploadJobStatus(null);
    setNoteUploadCurrentStep(null);
    setNoteUploadPercent(null);
    setNoteUploadStepResults([]);
    setIsNoteUploadPolling(false);
    setNoteUploadSummary(null);
    setIsLoadingNoteUploadSummary(false);
    setIsUploadingNotes(true);

    uploadPollRunIdRef.current += 1;
    const currentUploadRunId = uploadPollRunIdRef.current;

    if (!patientId) {
      setNoteUploadError('Patient context is missing from URL.');
      return;
    }

    if (!selectedNoteFile) {
      setNoteUploadError('Please select a scanned clinical notes file first.');
      setIsUploadingNotes(false);
      return;
    }

    try {
      const { headers, channel } = await buildMissionRequestConfig();
      const base64 = await fileToBase64(selectedNoteFile);
      const documentType = getHarmonizerDocumentType(selectedNoteFile);

      const response = await fetch(HARMONIZER_IMPORT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: {
            patientId,
            documentContent: base64,
            documentType,
            metadata: {
              source:
                channel === 'patient-portal' ? 'PORTAL_UPLOAD' : 'EHR_EPIC',
              date: new Date().toISOString().slice(0, 10),
              priority: 'NORMAL',
            },
          },
          execution: {
            mode: 'async',
            timeout: '600s',
            maxTokens: 100000,
          },
        }),
      });

      let payload: HarmonizerJobStatusResponse = {};
      try {
        payload = (await response.json()) as HarmonizerJobStatusResponse;
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const serverMessage =
          payload?.message ||
          payload?.error ||
          `Harmonizer import failed (${response.status}).`;
        throw new Error(serverMessage);
      }

      const executionId = payload.jobId?.split(':')[0] || null; // New endpoint returns 'jobId', strip run suffix if present
      const status = normalizeHarmonizerStatus(payload.status) || 'QUEUED';

      setNoteUploadMessage(
        executionId
          ? `Submitted to Harmonizer (${executionId}, ${status}).`
          : `Submitted to Harmonizer (${status}).`,
      );

      if (executionId) {
        setNoteUploadJobId(executionId);
        setNoteUploadJobStatus('QUEUE');
        setNoteUploadCurrentStep(payload.currentStep || null);
        setNoteUploadStepResults(
          (payload.stepResults || []).filter(
            (step) => normalizeHarmonizerStatus(step.status) === 'COMPLETED',
          ),
        );
        setNoteUploadPercent(
          typeof payload.progress?.percentComplete === 'number'
            ? payload.progress.percentComplete
            : null,
        );

        if (status !== 'COMPLETED' && status !== 'FAILED') {
          void pollHarmonizerJobStatus(
            executionId,
            headers,
            currentUploadRunId,
            payload.pollUrl,
          ).catch((err: any) => {
            if (currentUploadRunId === uploadPollRunIdRef.current) {
              setIsNoteUploadPolling(false);
              setNoteUploadError(
                err?.message ||
                  'Unable to poll Harmonizer job status. Please refresh later.',
              );
            }
          });
        } else if (status === 'COMPLETED') {
          void fetchHarmonizerJobSummary(
            executionId,
            headers,
            currentUploadRunId,
          );
        }
      }

      setSelectedNoteFile(null);
    } catch (err: any) {
      setNoteUploadError(err?.message || 'Failed to upload scanned notes.');
    } finally {
      setIsUploadingNotes(false);
    }
  };

  const resolveTenantId = (): string | null => {
    const direct =
      sessionStorage.getItem('tenantId') ||
      sessionStorage.getItem('tenant_id') ||
      localStorage.getItem('tenantId') ||
      localStorage.getItem('tenant_id');

    if (direct) return direct;

    for (const key of Object.keys(sessionStorage)) {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          tenantId?: string;
          tenant_id?: string;
          tenant?: string;
          tokenResponse?: {
            tenantId?: string;
            tenant_id?: string;
            tenant?: string;
          };
        };
        const tenant =
          parsed.tenantId ||
          parsed.tenant_id ||
          parsed.tenant ||
          parsed.tokenResponse?.tenantId ||
          parsed.tokenResponse?.tenant_id ||
          parsed.tokenResponse?.tenant;
        if (tenant) return tenant;
      } catch {
        // Ignore non-JSON values in session storage.
      }
    }

    return null;
  };

  const buildMissionRequestConfig = async (): Promise<MissionRequestConfig> => {
    let accessToken: string | undefined;
    let tenantId: string | null = resolveTenantId();

    try {
      const smartClient = await FHIR.oauth2.ready();
      accessToken = smartClient.state.tokenResponse?.access_token;
      const smartTenant = (smartClient.state as any)?.tenantId;
      if (!tenantId && smartTenant) tenantId = smartTenant;
    } catch {
      // We still allow session-derived context if SMART client is unavailable.
    }

    const resolvedTenantId =
      tenantId || import.meta.env.VITE_TENANT_ID || 'default';

    if (!patientId) {
      throw new Error('Patient context is missing in this page URL.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': resolvedTenantId,
      'X-Patient-ID': patientId,
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      return { headers, channel: 'patient-portal' };
    }

    // Independent in-app mode fallback (non-SMART).
    if (API_KEY) {
      headers['x-api-key'] = API_KEY;
      return { headers, channel: 'in-app' };
    }

    throw new Error(
      'No authentication context available. Please sign in or configure API key access.',
    );
  };

  const openAgentConversationModal = async () => {
    setAgentModalError(null);

    try {
      const { headers } = await buildMissionRequestConfig();
      const resolvedTenantId =
        headers['X-Tenant-ID'] || import.meta.env.VITE_TENANT_ID || 'default';
      const authorization = headers.Authorization || '';
      const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;

      const passthroughHeaders: Record<string, string> = {};
      if (headers['x-api-key']) {
        passthroughHeaders['x-api-key'] = headers['x-api-key'];
      }

      setAgentTenantId(resolvedTenantId);
      setAgentAccessToken(token);
      setAgentExtraHeaders(passthroughHeaders);
      setShowAgentModal(true);
    } catch (err: any) {
      setAgentModalError(
        err?.message ||
          'Unable to initialize AI assistant. Please check your session and try again.',
      );
    }
  };

  const patientAgentConfig: AgentEndpointConfig = {
    endpoint: `${AGENT_API_BASE_URL}/api/agent/AgentPersona/digital-twin/AgentMission`,
    personaId: 'digital-twin',
    headers: agentExtraHeaders,
    supportsContinuation: true,
  };

  useEffect(() => {
    return () => {
      pollRunIdRef.current += 1;
      uploadPollRunIdRef.current += 1;
    };
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = searchInput.trim();
    if (query.length < 6) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const resourceTypes = getResourceTypesFromQuery(query);
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (API_KEY) {
        headers['x-api-key'] = API_KEY;
      }
      const res = await fetch(`${AGENT_API_BASE_URL}/api/ai/hybrid-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          scope: 'PATIENT',
          patientId: patientId!,
          resourceTypes,
          structuredFilters: { subject: `Patient/${patientId}` },
          limit: 10,
          explain: true,
        }),
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      setSearchResults(await res.json());
    } catch (err: any) {
      setSearchError(err.message || 'Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchResults(null);
    setSearchError(null);
    setShowGlobalSearch(false);
  };

  // ── Navigation from search results ──
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const handleNavigate = (
    tab: TabId,
    resourceId: string,
    medSubTab?: MedSubTab,
  ) => {
    setActiveTab(tab);
    if (medSubTab) setMedSubTab(medSubTab);
    setExpandedId(resourceId);
    setHighlightId(resourceId);
  };

  useEffect(() => {
    if (!highlightId) return;
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`record-${highlightId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const clearTimer = setTimeout(() => setHighlightId(null), 2500);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightId]);

  // ── Patient ──
  const { data: patient } = useGetPatientQuery(patientId!, {
    skip: !patientId,
  });

  const patientName =
    patient?.name?.[0]?.text ||
    [patient?.name?.[0]?.given?.join(' '), patient?.name?.[0]?.family]
      .filter(Boolean)
      .join(' ') ||
    'Unknown Patient';
  const mrn = patient?.identifier?.[0]?.value || '—';

  // ── Data fetching (lazy) — all via searchByPatient for unified sort + filter ──
  const pageOffset = {
    _count: String(PAGE_SIZE),
    _offset: String((currentPage - 1) * PAGE_SIZE),
  };

  const encExtraParams = {
    ...buildExtraParams(ENC_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const condExtraParams = {
    ...buildExtraParams(COND_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const obsExtraParams = {
    ...buildExtraParams(OBS_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const srExtraParams = {
    ...buildExtraParams(SR_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const labDrExtraParams = {
    ...buildExtraParams(DR_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
    category: 'LAB,PAT',
  };
  const radDrExtraParams = {
    ...buildExtraParams(DR_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
    category: 'RAD',
  };
  const medReqExtraParams = {
    ...buildExtraParams(MED_REQ_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const medDispExtraParams = {
    ...buildExtraParams(
      MED_DISP_FILTERS,
      filterValues,
      '_lastUpdated',
      sortDir,
    ),
    ...pageOffset,
  };
  const medStmtExtraParams = {
    ...buildExtraParams(
      MED_STMT_FILTERS,
      filterValues,
      '_lastUpdated',
      sortDir,
    ),
    ...pageOffset,
  };
  const procExtraParams = {
    ...buildExtraParams(PROC_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };
  const cpExtraParams = {
    ...buildExtraParams(CP_FILTERS, filterValues, '_lastUpdated', sortDir),
    ...pageOffset,
  };

  const { data: encBundle, isLoading: encLoading } = useSearchByPatientQuery(
    {
      resourceType: 'Encounter',
      patientId: patientId!,
      extraParams: encExtraParams,
    },
    { skip: !patientId || activeTab !== 'encounter' },
  );
  const { data: condBundle, isLoading: condLoading } = useSearchByPatientQuery(
    {
      resourceType: 'Condition',
      patientId: patientId!,
      extraParams: condExtraParams,
    },
    { skip: !patientId || activeTab !== 'condition' },
  );
  const { data: obsBundle, isLoading: obsLoading } = useSearchByPatientQuery(
    {
      resourceType: 'Observation',
      patientId: patientId!,
      extraParams: obsExtraParams,
      customHeaders: { 'x-api-repository': 'ALL' },
    },
    { skip: !patientId || activeTab !== 'observation' },
  );
  const { data: srBundle, isLoading: srLoading } = useSearchByPatientQuery(
    {
      resourceType: 'ServiceRequest',
      patientId: patientId!,
      extraParams: srExtraParams,
    },
    { skip: !patientId || activeTab !== 'orders' },
  );
  const { data: labDrBundle, isLoading: labDrLoading } =
    useSearchByPatientQuery(
      {
        resourceType: 'DiagnosticReport',
        patientId: patientId!,
        extraParams: labDrExtraParams,
        customHeaders: { 'x-api-repository': 'ALL' },
      },
      { skip: !patientId || activeTab !== 'lab-results' },
    );
  const { data: radDrBundle, isLoading: radDrLoading } =
    useSearchByPatientQuery(
      {
        resourceType: 'DiagnosticReport',
        patientId: patientId!,
        extraParams: radDrExtraParams,
      },
      { skip: !patientId || activeTab !== 'rad-report' },
    );
  const { data: medReqBundle, isLoading: medReqLoading } =
    useSearchByPatientQuery(
      {
        resourceType: 'MedicationRequest',
        patientId: patientId!,
        extraParams: medReqExtraParams,
      },
      {
        skip:
          !patientId || activeTab !== 'medication' || medSubTab !== 'request',
      },
    );
  const { data: medDispBundle, isLoading: medDispLoading } =
    useSearchByPatientQuery(
      {
        resourceType: 'MedicationDispense',
        patientId: patientId!,
        extraParams: medDispExtraParams,
      },
      {
        skip:
          !patientId || activeTab !== 'medication' || medSubTab !== 'dispense',
      },
    );
  const { data: medStmtBundle, isLoading: medStmtLoading } =
    useSearchByPatientQuery(
      {
        resourceType: 'MedicationStatement',
        patientId: patientId!,
        extraParams: medStmtExtraParams,
      },
      {
        skip:
          !patientId || activeTab !== 'medication' || medSubTab !== 'statement',
      },
    );
  const { data: procBundle, isLoading: procLoading } = useSearchByPatientQuery(
    {
      resourceType: 'Procedure',
      patientId: patientId!,
      extraParams: procExtraParams,
    },
    { skip: !patientId || activeTab !== 'procedure' },
  );
  const { data: cpBundle, isLoading: cpLoading } = useSearchByPatientQuery(
    {
      resourceType: 'CarePlan',
      patientId: patientId!,
      extraParams: cpExtraParams,
    },
    { skip: !patientId || activeTab !== 'careplan' },
  );

  // Invalidate patient data cache when note upload completes successfully
  useEffect(() => {
    if (noteUploadSummary && noteUploadSummary.status !== 'FAILED') {
      const timer = setTimeout(() => {
        // Invalidate all patient-related resource tags so queries refetch with fresh data
        // This covers all resource types that might be created by harmonizer:
        // Observation, Condition, Encounter, DiagnosticReport (via Lab/Rad tags), Medication, Procedure, CarePlan
        dispatch(fhirApi.util.invalidateTags([
          'Observation',
          'Condition',
          'Encounter',
          { type: 'Patient', id: patientId },
        ]));
      }, 1500); // Wait 1.5 seconds before invalidating to show the success message

      return () => clearTimeout(timer);
    }
  }, [noteUploadSummary, patientId, dispatch]);

  // Clear upload summary after showing success message (5 seconds total: 1.5s before invalidate + 3.5s after)
  useEffect(() => {
    if (noteUploadSummary && noteUploadSummary.status !== 'FAILED') {
      const timer = setTimeout(() => {
        setNoteUploadSummary(null);
        setSelectedNoteFile(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [noteUploadSummary]);

  // ── Resource extraction ──
  const encounters = (encBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const conditions = (condBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean)
    .filter(
      (c: any) => c.clinicalStatus?.coding?.[0]?.code !== 'entered-in-error',
    );
  // Include all observations with any category or no category; only exclude entered-in-error
  const observations = (obsBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean)
    .filter((o: any) => o.status !== 'entered-in-error');
  const serviceRequests = (srBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const allDiagnosticReports = [] as any[]; // kept for reference; use labResults/radReports below

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

  void allDiagnosticReports;
  void isLabReport;
  void isRadReport; // kept for reference

  const labResults = (labDrBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const radReports = (radDrBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);

  const medRequests = (medReqBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const medDispenses = (medDispBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const medStatements = (medStmtBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const procedures = (procBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);
  const carePlans = (cpBundle?.entry ?? [])
    .map((e) => e.resource as any)
    .filter(Boolean);

  // ── Toggle helper ──
  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // ─── Tab renders ──────────────────────────────────────────────────────────

  const renderConditionTab = () => {
    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={COND_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={condBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={condBundle?.link as Array<{ relation: string; url: string }>}
        />
        {condLoading ? (
          <Loading />
        ) : !conditions.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Onset"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  {[
                    'Condition',
                    'Clinical Status',
                    'Severity',
                    'Category',
                    'Last Updated',
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {conditions.map((cond: any) => (
                  <React.Fragment key={cond.id}>
                    <tr
                      id={`record-${cond.id}`}
                      className={`cursor-pointer transition-colors ${highlightId === cond.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(cond.id)}
                    >
                      <TD>{fmt(cond.onsetDateTime || cond.recordedDate)}</TD>
                      <TD>
                        {cond.code?.coding?.[0]?.display ||
                          cond.code?.text ||
                          '—'}
                      </TD>
                      <TD>
                        <StatusBadge
                          status={cond.clinicalStatus?.coding?.[0]?.code}
                        />
                      </TD>
                      <TD>
                        {cond.severity?.coding?.[0]?.display ||
                          cond.severity?.text ||
                          '—'}
                      </TD>
                      <TD>
                        {cond.category?.[0]?.coding?.[0]?.display ||
                          cond.category?.[0]?.text ||
                          '—'}
                      </TD>
                      <TD>{fmt(cond.meta?.lastUpdated)}</TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === cond.id} />
                      </td>
                    </tr>
                    {expandedId === cond.id && (
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-gray-50 px-6 py-4 text-sm text-gray-700"
                        >
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <div>
                              <span className="font-medium">ID:</span> {cond.id}
                            </div>
                            <div>
                              <span className="font-medium">Verification:</span>{' '}
                              {cond.verificationStatus?.coding?.[0]?.code ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Recorded:</span>{' '}
                              {fmt(cond.recordedDate)}
                            </div>
                            <div>
                              <span className="font-medium">Recorder:</span>{' '}
                              {cond.recorder?.display ||
                                cond.recorder?.reference ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Asserter:</span>{' '}
                              {cond.asserter?.display ||
                                cond.asserter?.reference ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Encounter:</span>{' '}
                              {cond.encounter?.reference || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Body Site:</span>{' '}
                              {cond.bodySite
                                ?.map(
                                  (b: any) => b.coding?.[0]?.display || b.text,
                                )
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Note:</span>{' '}
                              {cond.note?.map((n: any) => n.text).join('; ') ||
                                '—'}
                            </div>
                            {cond.abatementDateTime && (
                              <div>
                                <span className="font-medium">Abatement:</span>{' '}
                                {fmt(cond.abatementDateTime)}
                              </div>
                            )}
                            {cond.stage?.length ? (
                              <div className="col-span-2">
                                <span className="font-medium">Stage:</span>{' '}
                                {cond.stage
                                  .map(
                                    (s: any) =>
                                      s.summary?.coding?.[0]?.display ||
                                      s.summary?.text,
                                  )
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          total={condBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={condBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  const renderEncounterTab = () => {
    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={ENC_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={encBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={encBundle?.link as Array<{ relation: string; url: string }>}
        />
        {encLoading ? (
          <Loading />
        ) : !encounters.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto md:overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Date"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  <TH className="hidden md:table-cell">Type</TH>
                  <TH>Status</TH>
                  <TH className="hidden lg:table-cell">Chief Complaint</TH>
                  <TH className="hidden md:table-cell">Last Updated</TH>
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {encounters.map((enc: any) => (
                  <React.Fragment key={enc.id}>
                    <tr
                      id={`record-${enc.id}`}
                      className={`cursor-pointer transition-colors ${highlightId === enc.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(enc.id)}
                    >
                      <TD>
                        {fmt(enc.actualPeriod?.start || enc.period?.start)}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {enc.type?.[0]?.text ||
                          enc.class?.[0]?.coding?.[0]?.display ||
                          '—'}
                      </TD>
                      <TD>
                        <StatusBadge status={enc.status} />
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {enc.reason?.[0]?.value?.[0]?.concept?.text || '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {fmt(enc.meta?.lastUpdated)}
                      </TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === enc.id} />
                      </td>
                    </tr>
                    {expandedId === enc.id && (
                      <tr>
                        <td
                          colSpan={6}
                          className="bg-gray-50 px-6 py-4 text-sm"
                        >
                          <div className="grid grid-cols-2 gap-2 text-gray-700">
                            <div>
                              <span className="font-medium">Encounter ID:</span>{' '}
                              {enc.id}
                            </div>
                            <div>
                              <span className="font-medium">Identifier:</span>{' '}
                              {enc.identifier?.[0]?.value || '—'}
                            </div>
                            <div>
                              <span className="font-medium">Period:</span>{' '}
                              {fmt(
                                enc.actualPeriod?.start || enc.period?.start,
                              )}{' '}
                              → {fmt(enc.actualPeriod?.end || enc.period?.end)}
                            </div>
                            <div>
                              <span className="font-medium">Location:</span>{' '}
                              {enc.location
                                ?.map(
                                  (l: any) =>
                                    l.location?.identifier?.value ||
                                    l.location?.reference ||
                                    '—',
                                )
                                .join(', ') || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Participants:</span>{' '}
                              {enc.participant
                                ?.map(
                                  (p: any) =>
                                    p.actor?.display ||
                                    p.actor?.reference ||
                                    '—',
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
        )}
        <Pagination
          total={encBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={encBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  const renderObservationTab = () => {
    const formatReferenceRange = (ranges?: any[]): string => {
      if (!ranges?.length) return '—';

      const first = ranges[0];
      const low = first?.low;
      const high = first?.high;

      if (low?.value != null || high?.value != null) {
        const lowText =
          low?.value != null
            ? `${low.value}${low.unit ? ` ${low.unit}` : ''}`
            : '—';
        const highText =
          high?.value != null
            ? `${high.value}${high.unit ? ` ${high.unit}` : ''}`
            : '—';
        return `${lowText} - ${highText}`;
      }

      return first?.text || '—';
    };

    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={OBS_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={obsBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={obsBundle?.link as Array<{ relation: string; url: string }>}
        />
        {obsLoading ? (
          <Loading />
        ) : !observations.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto md:overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Date"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  <TH>Code</TH>
                  <TH className="hidden md:table-cell">Value</TH>
                  <TH>Interpretation</TH>
                  <TH className="hidden md:table-cell">Category</TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Last Updated</TH>
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {observations.map((obs: any) => {
                  const value = obs.valueQuantity
                    ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`.trim()
                    : obs.valueString ||
                      obs.valueCodeableConcept?.text ||
                      (obs.component?.length
                        ? `${obs.component.length} components`
                        : '—');
                  return (
                    <React.Fragment key={obs.id}>
                      <tr
                        id={`record-${obs.id}`}
                        className={`cursor-pointer transition-colors ${expandedId === obs.id ? 'bg-blue-50 border-l-4 border-blue-400' : highlightId === obs.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggle(obs.id)}
                      >
                        <TD>
                          {fmt(
                            obs.effectiveDateTime || obs.effectivePeriod?.start,
                          )}
                        </TD>
                        <TD>
                          {obs.code?.coding?.[0]?.display ||
                            obs.code?.text ||
                            obs.code?.coding?.[0]?.code ||
                            '—'}
                        </TD>
                        <TD className="hidden md:table-cell font-medium">
                          {value}
                        </TD>
                        <TD>
                          {(() => {
                            const interpretation = getInterpretationBadge(obs);
                            return interpretation ? (
                              <span
                                className={`inline-block text-xs font-medium px-2 py-1 rounded ${interpretation.bgColor}`}
                              >
                                {interpretation.text}
                              </span>
                            ) : (
                              '—'
                            );
                          })()}
                        </TD>
                        <TD className="hidden md:table-cell">
                          {obs.category?.[0]?.coding?.[0]?.display ||
                            obs.category?.[0]?.text ||
                            '—'}
                        </TD>
                        <TD>
                          <StatusBadge status={obs.status} />
                        </TD>
                        <TD className="hidden md:table-cell">
                          {fmt(obs.meta?.lastUpdated)}
                        </TD>
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === obs.id} />
                        </td>
                      </tr>
                      {expandedId === obs.id && (
                        <tr>
                          <td
                            colSpan={7}
                            className="bg-blue-50 px-6 py-4 text-sm text-gray-700 border-l-4 border-blue-400 border-b border-b-blue-200"
                          >
                            {obs.component?.length ? (
                              <div>
                                <p className="font-medium mb-2">Components:</p>
                                <table className="text-xs border border-gray-200 rounded">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-1 text-left">
                                        Code
                                      </th>
                                      <th className="px-3 py-1 text-left">
                                        Value
                                      </th>
                                      <th className="px-3 py-1 text-left">
                                        Ref Range
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {obs.component.map((c: any, i: number) => (
                                      <tr
                                        key={i}
                                        className="border-t border-gray-200"
                                      >
                                        <td className="px-3 py-1">
                                          {c.code?.coding?.[0]?.display ||
                                            c.code?.text ||
                                            '—'}
                                        </td>
                                        <td className="px-3 py-1">
                                          {c.valueQuantity
                                            ? `${c.valueQuantity.value} ${c.valueQuantity.unit ?? ''}`.trim()
                                            : c.valueString || '—'}
                                        </td>
                                        <td className="px-3 py-1">
                                          {formatReferenceRange(
                                            c.referenceRange,
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="font-medium">Value:</span>{' '}
                                  {value}
                                </div>
                                <div>
                                  <span className="font-medium">Category:</span>{' '}
                                  {obs.category?.[0]?.coding?.[0]?.display ||
                                  obs.category?.[0]?.coding?.[0]?.code ? (
                                    obs.category[0]?.coding?.[0]?.display ||
                                    obs.category[0]?.coding?.[0]?.code
                                  ) : (
                                    <span className="text-gray-400 italic">
                                      (not specified)
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="font-medium">
                                    Reference Range:
                                  </span>{' '}
                                  {formatReferenceRange(obs.referenceRange)}
                                </div>
                                <div>
                                  <span className="font-medium">
                                    Interpretation:
                                  </span>{' '}
                                  {(() => {
                                    const interpretation =
                                      getInterpretationBadge(obs);
                                    return interpretation ? (
                                      <span
                                        className={`inline-block text-xs font-medium px-2 py-1 rounded ${interpretation.bgColor}`}
                                      >
                                        {interpretation.text}
                                      </span>
                                    ) : (
                                      '—'
                                    );
                                  })()}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-medium">Note:</span>{' '}
                                  {obs.note?.[0]?.text || '—'}
                                </div>
                                {obs.hasMember?.length ||
                                obs.derivedFrom?.length ? (
                                  <div className="col-span-2">
                                    <ObservationReferencedResources
                                      observation={obs}
                                    />
                                  </div>
                                ) : null}
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
        )}
        <Pagination
          total={obsBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={obsBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  const renderOrdersTab = () => {
    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={SR_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={srBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={srBundle?.link as Array<{ relation: string; url: string }>}
        />
        {srLoading ? (
          <Loading />
        ) : !serviceRequests.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Date"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  {[
                    'Order',
                    'Category',
                    'Status',
                    'Priority',
                    'Last Updated',
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {serviceRequests.map((sr: any) => (
                  <React.Fragment key={sr.id}>
                    <tr
                      id={`record-${sr.id}`}
                      className={`cursor-pointer transition-colors ${highlightId === sr.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(sr.id)}
                    >
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
                      <TD>{fmt(sr.meta?.lastUpdated)}</TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === sr.id} />
                      </td>
                    </tr>
                    {expandedId === sr.id && (
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-gray-50 px-6 py-4 text-sm"
                        >
                          <div className="grid grid-cols-2 gap-2 text-gray-700">
                            <div>
                              <span className="font-medium">Requester:</span>{' '}
                              {sr.requester?.display ||
                                sr.requester?.reference ||
                                '—'}
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
        )}
        <Pagination
          total={srBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={srBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  const renderDiagnosticReportTable = (
    reports: any[],
    loading: boolean,
    bundle?: any,
  ) => {
    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={DR_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={bundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={bundle?.link as Array<{ relation: string; url: string }>}
        />
        {loading ? (
          <Loading />
        ) : !reports.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Date"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  <TH>Report</TH>
                  <TH className="hidden md:table-cell">Status</TH>
                  <TH className="hidden md:table-cell">Performer</TH>
                  <TH className="hidden md:table-cell">Last Updated</TH>
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {reports.map((dr: any) => (
                  <React.Fragment key={dr.id}>
                    <tr
                      id={`record-${dr.id}`}
                      className={`cursor-pointer transition-colors ${expandedId === dr.id ? 'bg-blue-50 border-l-4 border-blue-400' : highlightId === dr.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(dr.id)}
                    >
                      <TD>{fmt(dr.effectiveDateTime || dr.issued)}</TD>
                      <TD>
                        {dr.code?.text || dr.code?.coding?.[0]?.display || '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        <StatusBadge status={dr.status} />
                      </TD>
                      <TD className="hidden md:table-cell">
                        {dr.performer?.[0]?.display || '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {fmt(dr.meta?.lastUpdated)}
                      </TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === dr.id} />
                      </td>
                    </tr>
                    {expandedId === dr.id && (
                      <tr>
                        <td
                          colSpan={6}
                          className="bg-blue-50 px-6 py-4 text-sm border-l-4 border-blue-400 border-b border-b-blue-200"
                        >
                          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-2 text-gray-700 mb-3">
                            <div>
                              <span className="font-medium">Report ID:</span>{' '}
                              {dr.id}
                            </div>
                            <div>
                              <span className="font-medium">Issued:</span>{' '}
                              {fmt(dr.issued)}
                            </div>
                            <div className="md:col-span-2">
                              <span className="font-medium">Category:</span>{' '}
                              {dr.category
                                ?.map(
                                  (c: any) =>
                                    c.coding?.[0]?.display ||
                                    c.coding?.[0]?.code ||
                                    c.text,
                                )
                                .join(', ') || '—'}
                            </div>
                          </div>
                          {dr.result?.length ? (
                            <div className="mb-3">
                              <DiagnosticReportReferencedResources
                                report={dr}
                              />
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
        )}
        <Pagination
          total={bundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={bundle?.link as Array<{ relation: string; url: string }>}
        />
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
      return (
        <div>
          {showFilter && (
            <FilterPanel
              filters={MED_REQ_FILTERS}
              values={filterValues}
              onChange={setFilterValues}
            />
          )}
          <Pagination
            total={medReqBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medReqBundle?.link as Array<{ relation: string; url: string }>
            }
          />
          {medReqLoading ? (
            <Loading />
          ) : !medRequests.length ? (
            <Empty />
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader
                      label="Date"
                      sortDir={sortDir}
                      onToggle={() =>
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }
                    />
                    {[
                      'Medication',
                      'Status',
                      'Dosage',
                      'Reason',
                      'Last Updated',
                    ].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                    <TH />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {medRequests.map((mr: any) => (
                    <React.Fragment key={mr.id}>
                      <tr
                        id={`record-${mr.id}`}
                        className={`cursor-pointer transition-colors ${highlightId === mr.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggle(mr.id)}
                      >
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
                            (mr.dosageInstruction?.[0]?.timing?.repeat
                              ?.frequency
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
                        <TD>{fmt(mr.meta?.lastUpdated)}</TD>
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === mr.id} />
                        </td>
                      </tr>
                      {expandedId === mr.id && (
                        <tr>
                          <td
                            colSpan={7}
                            className="bg-gray-50 px-6 py-4 text-sm text-gray-700"
                          >
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                              <div>
                                <span className="font-medium">ID:</span>{' '}
                                {mr.id || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Identifier:</span>{' '}
                                {mr.identifier?.[0]?.value || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Intent:</span>{' '}
                                {mr.intent || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Priority:</span>{' '}
                                {mr.priority || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Requester:</span>{' '}
                                {mr.requester?.display ||
                                  mr.requester?.reference ||
                                  '—'}
                              </div>
                              <div>
                                <span className="font-medium">Encounter:</span>{' '}
                                {mr.encounter?.reference || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Reason:</span>{' '}
                                {mr.reasonCode?.[0]?.text ||
                                  mr.reasonCode?.[0]?.coding?.[0]?.display ||
                                  mr.reason?.[0]?.concept?.text ||
                                  mr.reason?.[0]?.concept?.coding?.[0]
                                    ?.display ||
                                  mr.reason?.[0]?.reference?.display ||
                                  '—'}
                              </div>
                              <div>
                                <span className="font-medium">Subject:</span>{' '}
                                {mr.subject?.reference || '—'}
                              </div>
                              <div className="col-span-2">
                                <span className="font-medium">
                                  Dosage Instructions:
                                </span>{' '}
                                {mr.dosageInstruction
                                  ?.map((d: any) => {
                                    const parts = [
                                      d.text,
                                      d.route?.coding?.[0]?.display
                                        ? `Route: ${d.route.coding[0].display}`
                                        : null,
                                      d.timing?.repeat?.frequency
                                        ? `${d.timing.repeat.frequency}× per ${d.timing.repeat.period} ${d.timing.repeat.periodUnit}`
                                        : null,
                                      d.doseAndRate?.[0]?.doseQuantity
                                        ? `Dose: ${d.doseAndRate[0].doseQuantity.value} ${d.doseAndRate[0].doseQuantity.unit}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' | ');
                                    return parts || null;
                                  })
                                  .filter(Boolean)
                                  .join('; ') || '—'}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Dispense Qty:
                                </span>{' '}
                                {mr.dispenseRequest?.quantity?.value != null
                                  ? `${mr.dispenseRequest.quantity.value} ${mr.dispenseRequest.quantity.unit || ''}`.trim()
                                  : '—'}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Supply Duration:
                                </span>{' '}
                                {mr.dispenseRequest?.expectedSupplyDuration
                                  ?.value != null
                                  ? `${mr.dispenseRequest.expectedSupplyDuration.value} ${mr.dispenseRequest.expectedSupplyDuration.unit || ''}`.trim()
                                  : '—'}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Repeats Allowed:
                                </span>{' '}
                                {mr.dispenseRequest?.numberOfRepeatsAllowed ??
                                  '—'}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Substitution Allowed:
                                </span>{' '}
                                {mr.substitution?.allowedBoolean != null
                                  ? mr.substitution.allowedBoolean
                                    ? 'Yes'
                                    : 'No'
                                  : mr.substitution?.allowedCodeableConcept
                                      ?.text || '—'}
                              </div>
                              <div className="col-span-2">
                                <span className="font-medium">Note:</span>{' '}
                                {mr.note?.map((n: any) => n.text).join('; ') ||
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
          )}
          <Pagination
            total={medReqBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medReqBundle?.link as Array<{ relation: string; url: string }>
            }
          />
        </div>
      );
    };

    const renderDispenses = () => {
      return (
        <div>
          {showFilter && (
            <FilterPanel
              filters={MED_DISP_FILTERS}
              values={filterValues}
              onChange={setFilterValues}
            />
          )}
          <Pagination
            total={medDispBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medDispBundle?.link as Array<{ relation: string; url: string }>
            }
          />
          {medDispLoading ? (
            <Loading />
          ) : !medDispenses.length ? (
            <Empty />
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader
                      label="Date"
                      sortDir={sortDir}
                      onToggle={() =>
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }
                    />
                    {['Medication', 'Status', 'Quantity', 'Last Updated'].map(
                      (h) => (
                        <TH key={h}>{h}</TH>
                      ),
                    )}
                    <TH />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {medDispenses.map((md: any) => (
                    <React.Fragment key={md.id}>
                      <tr
                        id={`record-${md.id}`}
                        className={`cursor-pointer transition-colors ${highlightId === md.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggle(md.id)}
                      >
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
                        <TD>{fmt(md.meta?.lastUpdated)}</TD>
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === md.id} />
                        </td>
                      </tr>
                      {expandedId === md.id && (
                        <tr>
                          <td
                            colSpan={6}
                            className="bg-gray-50 px-6 py-4 text-sm text-gray-700"
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium">ID:</span> {md.id}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Days Supply:
                                </span>{' '}
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
          )}
          <Pagination
            total={medDispBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medDispBundle?.link as Array<{ relation: string; url: string }>
            }
          />
        </div>
      );
    };

    const renderStatements = () => {
      return (
        <div>
          {showFilter && (
            <FilterPanel
              filters={MED_STMT_FILTERS}
              values={filterValues}
              onChange={setFilterValues}
            />
          )}
          <Pagination
            total={medStmtBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medStmtBundle?.link as Array<{ relation: string; url: string }>
            }
          />
          {medStmtLoading ? (
            <Loading />
          ) : !medStatements.length ? (
            <Empty />
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader
                      label="Date"
                      sortDir={sortDir}
                      onToggle={() =>
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }
                    />
                    {['Medication', 'Status', 'Effective', 'Last Updated'].map(
                      (h) => (
                        <TH key={h}>{h}</TH>
                      ),
                    )}
                    <TH />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {medStatements.map((ms: any) => (
                    <React.Fragment key={ms.id}>
                      <tr
                        id={`record-${ms.id}`}
                        className={`cursor-pointer transition-colors ${highlightId === ms.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggle(ms.id)}
                      >
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
                          {fmt(
                            ms.effectivePeriod?.start || ms.effectiveDateTime,
                          )}
                        </TD>
                        <TD>{fmt(ms.meta?.lastUpdated)}</TD>
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === ms.id} />
                        </td>
                      </tr>
                      {expandedId === ms.id && (
                        <tr>
                          <td
                            colSpan={6}
                            className="bg-gray-50 px-6 py-4 text-sm text-gray-700"
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium">ID:</span> {ms.id}
                              </div>
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
          )}
          <Pagination
            total={medStmtBundle?.total}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onChange={setCurrentPage}
            links={
              medStmtBundle?.link as Array<{ relation: string; url: string }>
            }
          />
        </div>
      );
    };

    return (
      <div>
        <div className="flex gap-2 mb-4">
          {subTabs.map((st) => (
            <button
              key={st.id}
              onClick={() => {
                setMedSubTab(st.id);
                setExpandedId(null);
                resetSortFilter();
                setCurrentPage(1);
              }}
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
    return (
      <div>
        {showFilter && (
          <FilterPanel
            filters={PROC_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={procBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={procBundle?.link as Array<{ relation: string; url: string }>}
        />
        {procLoading ? (
          <Loading />
        ) : !procedures.length ? (
          <Empty />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader
                    label="Date"
                    sortDir={sortDir}
                    onToggle={() =>
                      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                    }
                  />
                  {[
                    'Procedure',
                    'Status',
                    'Performer',
                    'Reason',
                    'Last Updated',
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {procedures.map((proc: any) => (
                  <React.Fragment key={proc.id}>
                    <tr
                      id={`record-${proc.id}`}
                      className={`cursor-pointer transition-colors ${highlightId === proc.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(proc.id)}
                    >
                      <TD>
                        {fmt(
                          proc.performedDateTime ||
                            proc.performedPeriod?.start ||
                            proc.occurrenceDateTime,
                        )}
                      </TD>
                      <TD>
                        {proc.code?.coding?.[0]?.display ||
                          proc.code?.text ||
                          '—'}
                      </TD>
                      <TD>
                        <StatusBadge status={proc.status} />
                      </TD>
                      <TD>
                        {proc.performer?.[0]?.actor?.display ||
                          proc.performer?.[0]?.actor?.reference ||
                          '—'}
                      </TD>
                      <TD>
                        {proc.reasonCode?.[0]?.text ||
                          proc.reasonCode?.[0]?.coding?.[0]?.display ||
                          proc.reason?.[0]?.concept?.text ||
                          proc.reason?.[0]?.concept?.coding?.[0]?.display ||
                          proc.reason?.[0]?.reference?.display ||
                          '—'}
                      </TD>
                      <TD>{fmt(proc.meta?.lastUpdated)}</TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === proc.id} />
                      </td>
                    </tr>
                    {expandedId === proc.id && (
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-gray-50 px-6 py-4 text-sm"
                        >
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-gray-700">
                            <div>
                              <span className="font-medium">ID:</span>{' '}
                              {proc.id || '—'}
                            </div>
                            <div>
                              <span className="font-medium">Identifier:</span>{' '}
                              {proc.identifier?.[0]?.value || '—'}
                            </div>
                            <div>
                              <span className="font-medium">Category:</span>{' '}
                              {proc.category?.coding?.[0]?.display ||
                                proc.category?.text ||
                                proc.category?.[0]?.coding?.[0]?.display ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">
                                Status Reason:
                              </span>{' '}
                              {proc.statusReason?.coding?.[0]?.display ||
                                proc.statusReason?.text ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Encounter:</span>{' '}
                              {proc.encounter?.reference || '—'}
                            </div>
                            <div>
                              <span className="font-medium">Location:</span>{' '}
                              {proc.location?.display ||
                                proc.location?.reference ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Recorder:</span>{' '}
                              {proc.recorder?.display ||
                                proc.recorder?.reference ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Asserter:</span>{' '}
                              {proc.asserter?.display ||
                                proc.asserter?.reference ||
                                '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Performers:</span>{' '}
                              {proc.performer
                                ?.map((p: any) =>
                                  [
                                    p.function?.coding?.[0]?.display,
                                    p.actor?.display || p.actor?.reference,
                                  ]
                                    .filter(Boolean)
                                    .join(' — '),
                                )
                                .join('; ') || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Reason:</span>{' '}
                              {proc.reasonCode
                                ?.map(
                                  (r: any) => r.text || r.coding?.[0]?.display,
                                )
                                .filter(Boolean)
                                .join('; ') ||
                                proc.reason
                                  ?.map(
                                    (r: any) =>
                                      r.concept?.text ||
                                      r.concept?.coding?.[0]?.display ||
                                      r.reference?.display,
                                  )
                                  .filter(Boolean)
                                  .join('; ') ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Body Site:</span>{' '}
                              {proc.bodySite
                                ?.map(
                                  (b: any) => b.coding?.[0]?.display || b.text,
                                )
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </div>
                            <div>
                              <span className="font-medium">Outcome:</span>{' '}
                              {proc.outcome?.coding?.[0]?.display ||
                                proc.outcome?.text ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Complication:</span>{' '}
                              {proc.complication
                                ?.map(
                                  (c: any) =>
                                    c.concept?.text ||
                                    c.concept?.coding?.[0]?.display ||
                                    c.reference?.display,
                                )
                                .filter(Boolean)
                                .join('; ') ||
                                proc.complicationDetail
                                  ?.map((c: any) => c.display || c.reference)
                                  .filter(Boolean)
                                  .join('; ') ||
                                '—'}
                            </div>
                            <div>
                              <span className="font-medium">Follow-up:</span>{' '}
                              {proc.followUp
                                ?.map(
                                  (f: any) => f.coding?.[0]?.display || f.text,
                                )
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Used:</span>{' '}
                              {proc.usedCode
                                ?.map(
                                  (c: any) => c.coding?.[0]?.display || c.text,
                                )
                                .filter(Boolean)
                                .join(', ') ||
                                proc.used
                                  ?.map(
                                    (u: any) =>
                                      u.concept?.text || u.reference?.display,
                                  )
                                  .filter(Boolean)
                                  .join(', ') ||
                                '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Note:</span>{' '}
                              {proc.note?.map((n: any) => n.text).join('; ') ||
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
        )}
        <Pagination
          total={procBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={procBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  const renderCarePlanTab = () => {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">Period:</span>
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
          >
            {sortDir === 'desc' ? '↓ Newest first' : '↑ Oldest first'}
          </button>
        </div>
        {showFilter && (
          <FilterPanel
            filters={CP_FILTERS}
            values={filterValues}
            onChange={setFilterValues}
          />
        )}
        <Pagination
          total={cpBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={cpBundle?.link as Array<{ relation: string; url: string }>}
        />
        {cpLoading ? (
          <Loading />
        ) : !carePlans.length ? (
          <Empty />
        ) : (
          <div className="space-y-4">
            {carePlans.map((cp: any) => (
              <div
                key={cp.id}
                id={`record-${cp.id}`}
                className={`bg-white rounded-lg shadow-sm border overflow-hidden cursor-pointer transition-colors ${
                  highlightId === cp.id
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-200'
                }`}
                onClick={() => toggle(cp.id)}
              >
                <div className="px-6 py-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-gray-800">
                        {cp.title ||
                          cp.category?.[0]?.coding?.[0]?.display ||
                          'Care Plan'}
                      </h3>
                      <StatusBadge status={cp.status} />
                    </div>
                    <div className="text-sm text-gray-500">
                      Period: {fmt(cp.period?.start)} → {fmt(cp.period?.end)}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      Last Updated: {fmt(cp.meta?.lastUpdated)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {cp.description || '—'}
                    </div>
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
                            <li key={i}>
                              {g.display || g.reference || JSON.stringify(g)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {cp.activity?.length ? (
                      <div>
                        <p className="font-medium mb-1">Activities:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          {cp.activity.map((act: any, i: number) => {
                            const detail =
                              act.plannedActivityDetail || act.detail;
                            const label =
                              detail?.code?.coding?.[0]?.display ||
                              detail?.code?.text ||
                              act.reference?.display ||
                              act.reference?.reference ||
                              '—';
                            return (
                              <li key={i}>
                                {label} — {detail?.status || '—'}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <Pagination
          total={cpBundle?.total}
          page={currentPage}
          pageSize={PAGE_SIZE}
          onChange={setCurrentPage}
          links={cpBundle?.link as Array<{ relation: string; url: string }>}
        />
      </div>
    );
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {role !== 'patient' && (
            <Link
              to="/queue"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-2"
            >
              ← Back to Queue
            </Link>
          )}
          <div className="flex flex-col md:flex-row items-start md:items-start justify-between gap-3">
            <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-1">
              <h1 className="text-lg md:text-xl font-bold text-gray-900">
                Patient Records
              </h1>
              <span className="text-xs md:text-sm text-gray-600">
                {patientName}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded w-fit">
                {mrn}
              </span>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                {role === 'patient' && (
                  <button
                    onClick={() => {
                      if (!showAgentModal) {
                        openAgentConversationModal();
                        setShowClinicianUpload(false);
                      } else {
                        setShowAgentModal(false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                      showAgentModal
                        ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white border-indigo-600'
                        : 'bg-gradient-to-r from-indigo-50 to-fuchsia-50 text-indigo-700 border-indigo-200 hover:from-indigo-100 hover:to-fuchsia-100 hover:border-indigo-300'
                    }`}
                  >
                    <span
                      className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        showAgentModal
                          ? 'bg-white shadow-[0_0_0_2px_rgba(99,102,241,0.3)]'
                          : 'bg-gradient-to-br from-indigo-500 via-blue-500 to-fuchsia-500 shadow-[0_0_0_2px_rgba(99,102,241,0.15)]'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        className={`w-3.5 h-3.5 ${
                          showAgentModal ? 'text-indigo-600' : 'text-white'
                        }`}
                      >
                        <path d="M11.14 2.223a.75.75 0 0 1 1.72 0l.665 1.928a4.5 4.5 0 0 0 2.79 2.79l1.928.666a.75.75 0 0 1 0 1.719l-1.928.666a4.5 4.5 0 0 0-2.79 2.79l-.665 1.928a.75.75 0 0 1-1.72 0l-.665-1.928a4.5 4.5 0 0 0-2.79-2.79l-1.928-.666a.75.75 0 0 1 0-1.72l1.928-.665a4.5 4.5 0 0 0 2.79-2.79l.665-1.928Zm7.028 10.646a.75.75 0 0 1 1.664 0l.267.74a2.25 2.25 0 0 0 1.343 1.343l.74.267a.75.75 0 0 1 0 1.664l-.74.267a2.25 2.25 0 0 0-1.343 1.343l-.267.74a.75.75 0 0 1-1.664 0l-.267-.74a2.25 2.25 0 0 0-1.343-1.343l-.74-.267a.75.75 0 0 1 0-1.664l.74-.267a2.25 2.25 0 0 0 1.343-1.343l.267-.74Zm-13.5 2.25a.75.75 0 0 1 1.664 0l.126.35a1.5 1.5 0 0 0 .896.896l.35.126a.75.75 0 0 1 0 1.664l-.35.126a1.5 1.5 0 0 0-.896.896l-.126.35a.75.75 0 0 1-1.664 0l-.126-.35a1.5 1.5 0 0 0-.896-.896l-.35-.126a.75.75 0 0 1 0-1.664l.35-.126a1.5 1.5 0 0 0 .896-.896l.126-.35Z" />
                      </svg>
                      {showAgentModal && (
                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-white" />
                      )}
                    </span>
                    Ask AI
                  </button>
                )}

                {role === 'clinician' && (
                  <button
                    onClick={() => {
                      setShowClinicianUpload((s) => !s);
                      if (!showClinicianUpload) {
                        setShowAgentModal(false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                      showClinicianUpload
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400 hover:text-emerald-600'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3"
                      />
                    </svg>
                    Upload Notes
                  </button>
                )}

                <button
                  onClick={() => setShowGlobalSearch((s) => !s)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    showGlobalSearch
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                  Global Search
                </button>
              </div>
              {showGlobalSearch && (
                <form
                  onSubmit={handleSearch}
                  className="flex gap-2 w-full md:w-[480px]"
                >
                  <div className="relative flex-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder='e.g. "medications for hypertension"'
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      autoFocus
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || searchInput.trim().length < 6}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSearching ? 'Searching…' : 'Search'}
                  </button>
                </form>
              )}
              {agentModalError && role === 'patient' && (
                <p className="text-xs text-red-600 max-w-[480px] text-right">
                  {agentModalError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Results — shown above tab bar */}
      {(searchResults !== null || searchError) && (
        <div className="bg-blue-50 border-y-2 border-blue-300 px-6 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-3.5 h-3.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
                {searchResults
                  ? `${searchResults.totalResults} result${searchResults.totalResults !== 1 ? 's' : ''} for "${searchResults.query}"`
                  : 'Search error'}
              </span>
              <button
                onClick={clearSearch}
                className="text-xs text-blue-400 hover:text-blue-700 font-medium"
              >
                Clear ×
              </button>
            </div>
            {searchError ? (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
                {searchError}
              </div>
            ) : searchResults?.results.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">
                No matching records found.
              </p>
            ) : (
              <div className="space-y-1">
                {searchResults?.results.map((r) => (
                  <SearchResultCard
                    key={`${r.resourceType}/${r.resourceId}`}
                    result={r}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar and Content — Responsive Split Pane Layout */}
      <div
        ref={containerRef}
        className="flex flex-col md:flex-row flex-1 overflow-hidden"
        style={{ userSelect: isResizing ? 'none' : 'auto' }}
      >
        {/* Left side: Tab bar and records */}
        <div className="flex flex-col flex-1 overflow-auto md:min-w-0">
          {/* Tab bar */}
          <div className="bg-white border-b border-gray-200 shrink-0">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-center justify-between gap-2">
                {/* Mobile: Tab Dropdown */}
                <div className="md:hidden flex-1 relative">
                  <select
                    value={activeTab}
                    onChange={(e) => {
                      setActiveTab(e.target.value as TabId);
                      setExpandedId(null);
                      resetSortFilter();
                    }}
                    className="w-full px-3 py-2 pr-8 text-sm font-medium border border-gray-300 rounded bg-gray-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer hover:bg-gray-200 transition-colors"
                  >
                    {TABS.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label}
                      </option>
                    ))}
                  </select>
                  {/* Dropdown Icon */}
                  <svg
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-600 pointer-events-none"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 5v14m0 0l-7-7m7 7l7-7"
                    />
                  </svg>
                </div>

                {/* Desktop: Tab Bar */}
                <div className="hidden md:flex overflow-x-auto flex-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setExpandedId(null);
                        resetSortFilter();
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

                {/* Filters Button */}
                <button
                  onClick={() => setShowFilter((s) => !s)}
                  className={`ml-auto md:ml-4 shrink-0 text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                    showFilter
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {showFilter ? '▲ Hide Filters' : '▼ Filters'}
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="max-w-7xl">
              {activeTab === 'encounter' && renderEncounterTab()}
              {activeTab === 'condition' && renderConditionTab()}
              {activeTab === 'observation' && renderObservationTab()}
              {activeTab === 'orders' && renderOrdersTab()}
              {activeTab === 'lab-results' &&
                renderDiagnosticReportTable(
                  labResults,
                  labDrLoading,
                  labDrBundle,
                )}
              {activeTab === 'rad-report' &&
                renderDiagnosticReportTable(
                  radReports,
                  radDrLoading,
                  radDrBundle,
                )}
              {activeTab === 'medication' && renderMedicationTab()}
              {activeTab === 'procedure' && renderProcedureTab()}
              {activeTab === 'careplan' && renderCarePlanTab()}
            </div>
          </div>
        </div>

        {/* Resize handle — Desktop only */}
        {((role === 'clinician' && showClinicianUpload) ||
          (role === 'patient' && showAgentModal)) && (
          <div
            onMouseDown={handleMouseDown}
            className={`hidden md:block w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize shrink-0 ${
              isResizing ? 'bg-blue-500' : ''
            }`}
          />
        )}

        {/* Right side: Upload panel — Desktop side panel, Mobile bottom sheet */}
        {role === 'clinician' && showClinicianUpload && (
          <div
            className="md:bg-emerald-50 md:border-l md:border-emerald-200 md:overflow-auto md:shrink-0
              fixed md:static bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto
              w-screen md:w-auto h-[60vh] md:h-auto max-h-screen z-40 md:z-auto
              bg-white md:bg-emerald-50 border-t md:border-t-0 md:border-l border-gray-200 md:border-emerald-200
              rounded-t-2xl md:rounded-none overflow-y-auto md:overflow-auto"
            style={{
              ...(!window.matchMedia('(min-width: 768px)').matches
                ? {}
                : { width: `${uploadPanelWidth}%` }),
            }}
          >
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center py-2 sticky top-0 bg-white border-b border-gray-200">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="sticky top-0 md:top-0 bg-white md:bg-emerald-50 border-b border-gray-200 md:border-emerald-200 p-4 z-10 flex items-start justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-900 md:text-emerald-900">
                  Upload Scanned Clinical Notes
                </h2>
                <p className="text-xs text-gray-600 md:text-emerald-800 mt-1">
                  Select a scanned file (PDF/image) to attach as a patient
                  clinical note.
                </p>
              </div>
              <button
                onClick={() => setShowClinicianUpload(false)}
                className="shrink-0 text-gray-600 md:text-emerald-600 hover:text-gray-800 md:hover:text-emerald-800 hover:bg-gray-100 md:hover:bg-emerald-100 rounded p-1 transition-colors"
                title="Close upload panel"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <form
                onSubmit={handleUploadScannedNotes}
                className="flex flex-col gap-2"
              >
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) =>
                    setSelectedNoteFile(e.target.files?.[0] ?? null)
                  }
                  className="text-xs text-gray-700 file:mr-2 file:px-2 file:py-1 file:border file:border-gray-300 md:file:border-emerald-300 file:rounded file:bg-white file:text-gray-700 md:file:text-emerald-700 file:cursor-pointer file:text-xs"
                />
                <button
                  type="submit"
                  disabled={!selectedNoteFile || isUploadingNotes}
                  className="w-full px-3 py-2 text-xs font-medium bg-blue-600 md:bg-emerald-600 text-white rounded-lg hover:bg-blue-700 md:hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isUploadingNotes ? 'Uploading...' : 'Upload Notes'}
                </button>
              </form>

              {selectedNoteFile && (
                <p className="text-xs text-gray-700 md:text-emerald-700 bg-gray-100 md:bg-emerald-100 border border-gray-200 md:border-emerald-200 rounded px-2 py-1.5">
                  {selectedNoteFile.name}
                </p>
              )}

              {noteUploadMessage && (
                <div className="text-xs text-gray-800 md:text-emerald-800 bg-gray-100 md:bg-emerald-100 border border-gray-200 md:border-emerald-200 rounded-lg px-2 py-1.5">
                  {noteUploadMessage}
                </div>
              )}

              {noteUploadJobId && noteUploadJobStatus && (
                <div className="text-xs text-gray-700 bg-white border border-gray-200 md:border-emerald-200 rounded-lg px-2 py-1.5">
                  <p className="font-medium text-gray-800 mb-1">
                    Job: {noteUploadJobId.substring(0, 12)}...
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {HARMONIZER_STATUS_STEPS.map((step, index) => {
                      const mappedStatus =
                        mapHarmonizerStatusToStep(noteUploadJobStatus);
                      const currentIndex = HARMONIZER_STATUS_STEPS.indexOf(
                        mappedStatus as (typeof HARMONIZER_STATUS_STEPS)[number],
                      );
                      const reached =
                        mappedStatus === 'FAILED'
                          ? index <= 2
                          : currentIndex >= index;
                      const active = mappedStatus === step;
                      return (
                        <React.Fragment key={step}>
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs border font-medium ${
                              active || reached
                                ? 'bg-blue-100 md:bg-emerald-100 text-blue-700 md:text-emerald-700 border-blue-300 md:border-emerald-300'
                                : 'bg-gray-100 text-gray-500 border-gray-300'
                            }`}
                          >
                            {step}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {mapHarmonizerStatusToStep(noteUploadJobStatus) ===
                    'FAILED' && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded text-xs bg-red-100 border border-red-300 px-1.5 py-0.5 text-red-700 font-medium">
                      FAILED
                    </p>
                  )}
                  {noteUploadStepResults.length > 0 && (
                    <div className="mt-1">
                      <p className="text-gray-700 font-medium text-xs">
                        Completed
                      </p>
                      <ul className="mt-0.5 space-y-0.5 text-gray-600 text-xs">
                        {noteUploadStepResults.map((step, idx) => (
                          <li
                            key={`${step.stepName || step.step || 'step'}-${idx}`}
                          >
                            • {step.stepName || step.step || step.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {noteUploadPercent !== null && (
                    <div className="mt-1">
                      <progress
                        className="mt-0.5 h-1 w-full"
                        value={Math.max(0, Math.min(100, noteUploadPercent))}
                        max={100}
                      />
                      <p className="text-gray-500 text-xs mt-0.5">
                        {Math.round(noteUploadPercent)}%
                      </p>
                    </div>
                  )}
                  {isNoteUploadPolling && (
                    <p className="mt-1 text-gray-500 text-xs">Polling...</p>
                  )}
                  {isLoadingNoteUploadSummary && (
                    <p className="mt-1 text-gray-500 text-xs">
                      Loading summary...
                    </p>
                  )}
                </div>
              )}

              {noteUploadSummary && (
                <div className="text-xs bg-blue-50 md:bg-indigo-50 border border-blue-200 md:border-indigo-200 rounded-lg px-2 py-1.5 text-blue-900 md:text-indigo-900">
                  <p className="font-medium">Summary</p>
                  <p className="mt-0.5">
                    Status: {noteUploadSummary.status || '—'}
                  </p>
                  {noteUploadSummary.summary && (
                    <pre className="mt-0.5 text-xs bg-white border border-blue-100 md:border-indigo-100 rounded p-1 overflow-auto max-h-32 whitespace-pre-wrap break-words">
                      {toDisplayJson(noteUploadSummary.summary)}
                    </pre>
                  )}
                </div>
              )}

              {noteUploadError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  <div className="mb-1">{noteUploadError}</div>
                  {noteUploadJobId && (
                    <button
                      onClick={handleCheckNoteUploadStatus}
                      disabled={isNoteUploadPolling}
                      className="text-xs font-medium bg-red-200 hover:bg-red-300 text-red-800 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                    >
                      {isNoteUploadPolling ? 'Checking...' : 'Retry'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right side: Ask AI panel — Desktop side panel, Mobile bottom sheet */}
        {role === 'patient' && showAgentModal && (
          <div
            className="md:bg-indigo-50 md:border-l md:border-indigo-200 md:overflow-auto md:shrink-0
              fixed md:static bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto
              w-screen md:w-auto h-[60vh] md:h-auto max-h-screen z-40 md:z-auto
              bg-white md:bg-indigo-50 border-t md:border-t-0 md:border-l border-gray-200 md:border-indigo-200
              rounded-t-2xl md:rounded-none overflow-y-auto md:overflow-auto"
            style={{
              ...(!window.matchMedia('(min-width: 768px)').matches
                ? {}
                : { width: `${uploadPanelWidth}%` }),
            }}
          >
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center py-2 sticky top-0 bg-white border-b border-gray-200">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="sticky top-0 md:top-0 bg-white md:bg-indigo-50 border-b border-gray-200 md:border-indigo-200 p-4 z-10 flex items-start justify-between gap-2">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-900 md:text-indigo-900">
                  Ask About My Health Conditions
                </h2>
                <p className="text-xs text-gray-600 md:text-indigo-800 mt-1">
                  Chat with AI to get health insights based on your records.
                </p>
              </div>
              <button
                onClick={() => setShowAgentModal(false)}
                className="shrink-0 text-gray-600 md:text-indigo-600 hover:text-gray-800 md:hover:text-indigo-800 hover:bg-gray-100 md:hover:bg-indigo-100 rounded p-1 transition-colors"
                title="Close AI panel"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-4">
              {patientId && (
                <AgentConversationModal
                  isOpen={true}
                  onClose={() => setShowAgentModal(false)}
                  agentConfig={patientAgentConfig}
                  patientId={patientId}
                  tenantId={agentTenantId}
                  accessToken={agentAccessToken}
                  title="Ask About My Health Conditions"
                  mode="panel"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientRecordsPage;
