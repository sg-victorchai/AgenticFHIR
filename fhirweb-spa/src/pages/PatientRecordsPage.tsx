import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useSearchByPatientQuery,
  useGetResourceByIdQuery,
} from '../services/fhir/client';

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

const TABS: { id: TabId; label: string }[] = [
  { id: 'encounter', label: 'Encounter' },
  { id: 'condition', label: 'Condition' },
  { id: 'observation', label: 'Observation' },
  { id: 'orders', label: 'Lab & Rad Orders' },
  { id: 'lab-results', label: 'Lab Results' },
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

const AI_BASE_URL = (
  import.meta.env.VITE_FHIR_BASE_URL || 'http://localhost:8080/fhir'
).replace(/\/fhir\/?$/, '');

const API_KEY =
  import.meta.env.VITE_API_KEY || 'QcNaPYYwp57Ib3T2p1uxL3GazNNoF5pt513T1JCP';

const PAGE_SIZE = 5;

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
  <span className="text-gray-400">{open ? '▲' : '▼'}</span>
);

const TH: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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

  const [activeTab, setActiveTab] = useState<TabId>('encounter');
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

  useEffect(() => {
    setCurrentPage(1);
  }, [filterValues, sortDir]);

  // ── Search state ──
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] =
    useState<HybridSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = searchInput.trim();
    if (query.length < 6) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const resourceTypes = getResourceTypesFromQuery(query);
      const res = await fetch(`${AI_BASE_URL}/api/ai/hybrid-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
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
    ...buildExtraParams(ENC_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
  };
  const condExtraParams = {
    ...buildExtraParams(COND_FILTERS, filterValues, 'onset-date', sortDir),
    ...pageOffset,
  };
  const obsExtraParams = {
    ...buildExtraParams(OBS_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
  };
  const srExtraParams = {
    ...buildExtraParams(SR_FILTERS, filterValues, 'authored', sortDir),
    ...pageOffset,
  };
  const labDrExtraParams = {
    ...buildExtraParams(DR_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
    category: 'LAB',
  };
  const radDrExtraParams = {
    ...buildExtraParams(DR_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
    category: 'RAD',
  };
  const medReqExtraParams = {
    ...buildExtraParams(MED_REQ_FILTERS, filterValues, 'authoredon', sortDir),
    ...pageOffset,
  };
  const medDispExtraParams = {
    ...buildExtraParams(
      MED_DISP_FILTERS,
      filterValues,
      'whenhandedover',
      sortDir,
    ),
    ...pageOffset,
  };
  const medStmtExtraParams = {
    ...buildExtraParams(MED_STMT_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
  };
  const procExtraParams = {
    ...buildExtraParams(PROC_FILTERS, filterValues, 'date', sortDir),
    ...pageOffset,
  };
  const cpExtraParams = {
    ...buildExtraParams(CP_FILTERS, filterValues, 'date', sortDir),
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
                  {['Condition', 'Clinical Status', 'Severity', 'Category'].map(
                    (h) => (
                      <TH key={h}>{h}</TH>
                    ),
                  )}
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
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === cond.id} />
                      </td>
                    </tr>
                    {expandedId === cond.id && (
                      <tr>
                        <td
                          colSpan={6}
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
                  {['Type', 'Status', 'Chief Complaint'].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
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
                      <TD>
                        {enc.type?.[0]?.text ||
                          enc.class?.[0]?.coding?.[0]?.display ||
                          '—'}
                      </TD>
                      <TD>
                        <StatusBadge status={enc.status} />
                      </TD>
                      <TD>
                        {enc.reason?.[0]?.value?.[0]?.concept?.text || '—'}
                      </TD>
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === enc.id} />
                      </td>
                    </tr>
                    {expandedId === enc.id && (
                      <tr>
                        <td
                          colSpan={5}
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
                  {['Code', 'Category', 'Value', 'Status'].map((h) => (
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
                      (obs.component?.length
                        ? `${obs.component.length} components`
                        : '—');
                  return (
                    <React.Fragment key={obs.id}>
                      <tr
                        id={`record-${obs.id}`}
                        className={`cursor-pointer transition-colors ${highlightId === obs.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
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
                          <td
                            colSpan={6}
                            className="bg-gray-50 px-6 py-4 text-sm text-gray-700"
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
                                  <span className="font-medium">
                                    Interpretation:
                                  </span>{' '}
                                  {obs.interpretation?.[0]?.coding?.[0]
                                    ?.display || '—'}
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
                  {['Order', 'Category', 'Status', 'Priority'].map((h) => (
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
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === sr.id} />
                      </td>
                    </tr>
                    {expandedId === sr.id && (
                      <tr>
                        <td
                          colSpan={6}
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
                  {['Report', 'Status', 'Performer'].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                  <TH />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {reports.map((dr: any) => (
                  <React.Fragment key={dr.id}>
                    <tr
                      id={`record-${dr.id}`}
                      className={`cursor-pointer transition-colors ${highlightId === dr.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggle(dr.id)}
                    >
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
                        <td
                          colSpan={5}
                          className="bg-gray-50 px-6 py-4 text-sm"
                        >
                          <div className="grid grid-cols-2 gap-2 text-gray-700 mb-3">
                            <div>
                              <span className="font-medium">Report ID:</span>{' '}
                              {dr.id}
                            </div>
                            <div>
                              <span className="font-medium">Issued:</span>{' '}
                              {fmt(dr.issued)}
                            </div>
                            <div className="col-span-2">
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
                                    return (
                                      <li key={i}>
                                        {label}: {val}
                                      </li>
                                    );
                                  }
                                  return (
                                    <li key={i}>
                                      {ref.display || ref.reference}
                                    </li>
                                  );
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
                    {['Medication', 'Status', 'Dosage', 'Reason'].map((h) => (
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
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === mr.id} />
                        </td>
                      </tr>
                      {expandedId === mr.id && (
                        <tr>
                          <td
                            colSpan={6}
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
                    {['Medication', 'Status', 'Quantity'].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
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
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === md.id} />
                        </td>
                      </tr>
                      {expandedId === md.id && (
                        <tr>
                          <td
                            colSpan={5}
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
                    {['Medication', 'Status', 'Effective'].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
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
                        <td className="px-4 py-3 text-right">
                          <ExpandToggle open={expandedId === ms.id} />
                        </td>
                      </tr>
                      {expandedId === ms.id && (
                        <tr>
                          <td
                            colSpan={5}
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
                  {['Procedure', 'Status', 'Performer', 'Reason'].map((h) => (
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
                      <td className="px-4 py-3 text-right">
                        <ExpandToggle open={expandedId === proc.id} />
                      </td>
                    </tr>
                    {expandedId === proc.id && (
                      <tr>
                        <td
                          colSpan={6}
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
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900">
                Patient Records
              </h1>
              <span className="text-gray-600">{patientName}</span>
              <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                {mrn}
              </span>
            </div>
            <div className="flex flex-col items-end gap-2">
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
              {showGlobalSearch && (
                <form onSubmit={handleSearch} className="flex gap-2 w-[480px]">
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

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex overflow-x-auto flex-1">
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
            <button
              onClick={() => setShowFilter((s) => !s)}
              className={`ml-4 shrink-0 text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
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
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'encounter' && renderEncounterTab()}
        {activeTab === 'condition' && renderConditionTab()}
        {activeTab === 'observation' && renderObservationTab()}
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'lab-results' &&
          renderDiagnosticReportTable(labResults, labDrLoading, labDrBundle)}
        {activeTab === 'rad-report' &&
          renderDiagnosticReportTable(radReports, radDrLoading, radDrBundle)}
        {activeTab === 'medication' && renderMedicationTab()}
        {activeTab === 'procedure' && renderProcedureTab()}
        {activeTab === 'careplan' && renderCarePlanTab()}
      </div>
    </div>
  );
};

export default PatientRecordsPage;
