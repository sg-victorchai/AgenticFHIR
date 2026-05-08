import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { Bundle, Encounter as FHIREncounter } from 'fhir/r5';
import {
  useGetEncountersQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
  useGoToPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';

interface Encounter {
  id: string;
  type: string;
  status: string;
  class: string;
  reason: string;
  periodStart: string;
  periodEnd: string;
  serviceProvider: string;
}

// ─── Per-row consult action button ───────────────────────────────────────────

const ConsultActionButton: React.FC<{
  patientId: string;
  encounterId: string;
  status: string;
}> = ({ patientId, encounterId }) => (
  <Link
    to={`/patient/${patientId}/encounter/${encounterId}/notes`}
    className="inline-flex items-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-1.5 px-3 rounded-md transition-colors text-xs"
  >
    View Notes
  </Link>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (dateString: string) => {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-SG', {
      dateStyle: 'medium',
    });
  } catch {
    return dateString;
  }
};

const formatDateFull = (dateString: string) => {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dateString;
  }
};

const STATUS_STYLES: Record<string, string> = {
  'in-progress': 'bg-blue-100 text-blue-800',
  finished: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  planned: 'bg-yellow-100 text-yellow-700',
};

const CLASS_STYLES: Record<string, string> = {
  ambulatory: 'bg-sky-100 text-sky-700',
  inpatient: 'bg-orange-100 text-orange-700',
  IMP: 'bg-orange-100 text-orange-700',
  AMB: 'bg-sky-100 text-sky-700',
  EMER: 'bg-red-100 text-red-700',
  emergency: 'bg-red-100 text-red-700',
};

const EncounterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const patientContext = useOutletContext<any>();
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIREncounter> | undefined
  >();

  // Filter states
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Use the RTK Query hook to fetch encounters
  const {
    data: encounterBundle,
    isLoading,
    error,
  } = useGetEncountersQuery(id || '', {
    skip: !id,
  });

  // Pagination hooks
  const [triggerNextPage, { isLoading: isLoadingNext }] =
    useGetNextPageMutation();
  const [triggerPreviousPage, { isLoading: isLoadingPrevious }] =
    useGetPreviousPageMutation();
  const [triggerFirstPage, { isLoading: isLoadingFirst }] =
    useGetFirstPageMutation();
  const [triggerLastPage, { isLoading: isLoadingLast }] =
    useGetLastPageMutation();
  const [triggerGoToPage, { isLoading: isLoadingGoTo }] = useGoToPageMutation();

  // Unified loading state for all pagination operations
  const isPaginationLoading =
    isLoadingNext ||
    isLoadingPrevious ||
    isLoadingFirst ||
    isLoadingLast ||
    isLoadingGoTo;

  const handleNextPage = async () => {
    if (currentBundle) {
      const result = await triggerNextPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIREncounter>);
      }
    }
  };

  const handlePreviousPage = async () => {
    if (currentBundle) {
      const result = await triggerPreviousPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIREncounter>);
      }
    }
  };

  const handleFirstPage = async () => {
    if (currentBundle) {
      const result = await triggerFirstPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIREncounter>);
      }
    }
  };

  const handleLastPage = async () => {
    if (currentBundle) {
      const result = await triggerLastPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIREncounter>);
      }
    }
  };

  const handleGoToPage = async (pageNumber: number) => {
    if (currentBundle) {
      const result = await triggerGoToPage({
        bundle: currentBundle,
        pageNumber,
      });
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIREncounter>);
      }
    }
  };

  useEffect(() => {
    // Update current bundle when data changes
    if (encounterBundle) {
      setCurrentBundle(encounterBundle);
    }
  }, [encounterBundle]);

  useEffect(() => {
    // Process the FHIR Encounter resources into our app's format
    if (currentBundle && currentBundle.entry) {
      const processedEncounters: Encounter[] = currentBundle.entry
        .filter((entry) => entry.resource)
        .map((entry) => {
          const resource = entry.resource as FHIREncounter;

          // Extract the type display name
          const typeCoding = resource.type?.[0]?.coding?.[0];
          const typeDisplay = typeCoding?.display || 'Unknown Type';

          // Extract class display
          const classCoding = resource.class?.[0]?.coding?.[0];
          const classDisplay = classCoding?.display || '';

          // Extract service provider name
          const serviceProviderDisplay =
            resource.serviceProvider?.display || '';

          const reasonText =
            (resource as any).reason?.[0]?.value?.[0]?.concept?.text ||
            resource.type?.[0]?.text ||
            '—';

          return {
            id: resource.id || '',
            type: typeDisplay,
            status: resource.status || 'unknown',
            class: classDisplay,
            reason: reasonText,
            periodStart: resource.actualPeriod?.start || '',
            periodEnd: resource.actualPeriod?.end || '',
            serviceProvider: serviceProviderDisplay,
          };
        });

      setEncounters(processedEncounters);
    }
  }, [currentBundle]);

  // Get unique types and statuses for filtering
  const types = Array.from(new Set(encounters.map((enc) => enc.type)));
  const statuses = Array.from(new Set(encounters.map((enc) => enc.status)));

  // Filter encounters based on selected filters; always exclude entered-in-error records
  const filteredEncounters = encounters.filter(
    (enc) =>
      enc.status !== 'entered-in-error' &&
      (selectedType === '' || enc.type === selectedType) &&
      (selectedStatus === '' || enc.status === selectedStatus),
  );

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedType(e.target.value);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(e.target.value);
  };

  const handleDateFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFilter(e.target.value);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to load encounter data</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Visit History</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {patientContext?.patient?.name?.[0]?.given?.[0]}{' '}
            {patientContext?.patient?.name?.[0]?.family}
            {encounters.length > 0 && (
              <span className="ml-2 text-gray-400">
                · {encounters.length} encounter
                {encounters.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <Link
          to={`/patient/${id}/details`}
          state={{ backTo: `/patient/${id}/encounter` }}
          className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-md py-1.5 px-3 transition-colors"
        >
          Patient Details
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="sm:w-1/4">
          <label
            htmlFor="encounter-type-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Filter by Type:
          </label>
          <select
            id="encounter-type-filter"
            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3"
            value={selectedType}
            onChange={handleTypeChange}
            aria-label="Filter encounters by type"
          >
            <option value="">All Types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-1/4">
          <label
            htmlFor="encounter-status-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Filter by Status:
          </label>
          <select
            id="encounter-status-filter"
            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3"
            value={selectedStatus}
            onChange={handleStatusChange}
            aria-label="Filter encounters by status"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-1/4">
          <label
            htmlFor="encounter-date-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Filter by Date:
          </label>
          <input
            id="encounter-date-filter"
            type="date"
            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3"
            value={dateFilter}
            onChange={handleDateFilterChange}
            aria-label="Filter encounters by date"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Pagination at top */}
        <Pagination
          bundle={currentBundle}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          onFirstPage={handleFirstPage}
          onLastPage={handleLastPage}
          onGoToPage={handleGoToPage}
          isLoading={isPaginationLoading}
          position="top"
        />

        {filteredEncounters.length === 0 ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-md">
            <p className="text-yellow-800 text-sm">
              No encounters match the selected filters.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chief Complaint / Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consult Note
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredEncounters.map((encounter) => (
                <tr
                  key={encounter.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-800">
                      {formatDate(encounter.periodStart)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {encounter.periodStart
                        ? new Date(encounter.periodStart).toLocaleTimeString(
                            'en-SG',
                            { timeStyle: 'short' },
                          )
                        : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-800 max-w-xs">
                      {encounter.reason}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {encounter.serviceProvider}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        CLASS_STYLES[encounter.class] ||
                        'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {encounter.class || encounter.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        STATUS_STYLES[encounter.status] ||
                        'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {encounter.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {encounter.periodEnd ? (
                      formatDateFull(encounter.periodEnd)
                    ) : (
                      <span className="text-gray-300">ongoing</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ConsultActionButton
                      patientId={id || ''}
                      encounterId={encounter.id}
                      status={encounter.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination at bottom */}
        <Pagination
          bundle={currentBundle}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          onFirstPage={handleFirstPage}
          onLastPage={handleLastPage}
          onGoToPage={handleGoToPage}
          isLoading={isPaginationLoading}
          position="bottom"
        />
      </div>
    </div>
  );
};

export default EncounterPage;
