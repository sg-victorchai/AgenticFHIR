import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { Bundle, Observation as FHIRObservation } from 'fhir/r5';
import {
  useGetObservationsQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
  useGoToPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';

interface Observation {
  id: string;
  code: string;
  display: string;
  value: string;
  unit?: string;
  date: string;
  status: string;
}

const ObservationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const patientContext = useOutletContext<any>();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRObservation> | undefined
  >();

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Use the RTK Query hook to fetch observations
  const {
    data: observationBundle,
    isLoading,
    error,
  } = useGetObservationsQuery(
    {
      patientId: id || '',
      date: dateFilter || undefined,
    },
    {
      skip: !id,
    },
  );

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
        setCurrentBundle(result.data as Bundle<FHIRObservation>);
      }
    }
  };

  const handlePreviousPage = async () => {
    if (currentBundle) {
      const result = await triggerPreviousPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRObservation>);
      }
    }
  };

  const handleFirstPage = async () => {
    if (currentBundle) {
      const result = await triggerFirstPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRObservation>);
      }
    }
  };

  const handleLastPage = async () => {
    if (currentBundle) {
      const result = await triggerLastPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRObservation>);
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
        setCurrentBundle(result.data as Bundle<FHIRObservation>);
      }
    }
  };

  // Update current bundle when data changes
  useEffect(() => {
    if (observationBundle) {
      setCurrentBundle(observationBundle);
    }
  }, [observationBundle]);

  useEffect(() => {
    // Process the FHIR Observation resources into our app's format
    if (currentBundle && currentBundle.entry) {
      const processedObservations: Observation[] = currentBundle.entry
        .filter((entry) => entry.resource)
        .map((entry) => {
          const resource = entry.resource as FHIRObservation;

          // Extract the display name from the code.text or code.coding array
          const coding = resource.code?.coding?.[0];
          const display =
            resource.code?.text || coding?.display || 'Unknown Observation';

          // Extract value from different value[x] fields
          let value = 'No Value';
          let unit = '';

          if (resource.valueQuantity) {
            value = resource.valueQuantity.value?.toString() || 'No Value';
            unit = resource.valueQuantity.unit || '';
          } else if (resource.valueString) {
            value = resource.valueString;
          } else if (resource.valueBoolean !== undefined) {
            value = resource.valueBoolean ? 'True' : 'False';
          } else if (resource.valueInteger !== undefined) {
            value = resource.valueInteger.toString();
          } else if (resource.valueCodeableConcept?.coding?.[0]?.display) {
            value = resource.valueCodeableConcept.coding[0].display;
          }

          return {
            id: resource.id || '',
            code: coding?.code || '',
            display,
            value,
            unit,
            date: resource.effectiveDateTime || resource.issued || '',
            status: resource.status || 'unknown',
          };
        });

      setObservations(processedObservations);
    }
  }, [currentBundle]);

  // Get unique categories for filtering
  const categories = Array.from(
    new Set(observations.map((obs) => obs.code.split('-')[0])),
  );

  // Filter observations based on selected category
  const filteredObservations = selectedCategory
    ? observations.filter((obs) => obs.code.startsWith(selectedCategory))
    : observations;

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
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
        <p>Failed to load observation data</p>
      </div>
    );
  }

  if (filteredObservations.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <p className="text-yellow-700">
          No observations found for this patient.
        </p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          Observations for {patientContext?.patient?.name?.[0]?.given?.[0]}{' '}
          {patientContext?.patient?.name?.[0]?.family}
        </h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="sm:w-1/3">
          <label
            htmlFor="category-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Filter by Category:
          </label>
          <select
            id="category-filter"
            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3"
            value={selectedCategory}
            onChange={handleCategoryChange}
            aria-label="Filter observations by category"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-1/3">
          <label
            htmlFor="date-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Filter by Date:
          </label>
          <input
            type="date"
            id="date-filter"
            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3"
            value={dateFilter}
            onChange={handleDateFilterChange}
            aria-label="Filter observations by date"
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

        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Observation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                View Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredObservations.map((observation) => (
              <tr key={observation.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {observation.display}
                  </div>
                  <div className="text-xs text-gray-500">
                    {observation.code}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {observation.value} {observation.unit}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {formatDate(observation.date)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-${
                      observation.status === 'final'
                        ? 'green'
                        : observation.status === 'preliminary'
                          ? 'yellow'
                          : 'gray'
                    }-100 text-${
                      observation.status === 'final'
                        ? 'green'
                        : observation.status === 'preliminary'
                          ? 'yellow'
                          : 'gray'
                    }-800`}
                  >
                    {observation.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    to={`/patient/${id}/observation/crud/${observation.id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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

export default ObservationPage;
