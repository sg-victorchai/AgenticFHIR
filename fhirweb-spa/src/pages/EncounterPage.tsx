import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { useGetEncountersQuery } from '../services/fhir/client';
import { Encounter as FHIREncounter } from 'fhir/r5';

interface Encounter {
  id: string;
  type: string;
  status: string;
  class: string;
  periodStart: string;
  periodEnd: string;
  serviceProvider: string;
}

const EncounterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const patientContext = useOutletContext<any>();
  const [encounters, setEncounters] = useState<Encounter[]>([]);

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

  useEffect(() => {
    // Process the FHIR Encounter resources into our app's format
    if (encounterBundle && encounterBundle.entry) {
      const processedEncounters: Encounter[] = encounterBundle.entry
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

          return {
            id: resource.id || '',
            type: typeDisplay,
            status: resource.status || 'unknown',
            class: classDisplay,
            periodStart: resource.actualPeriod?.start || '',
            periodEnd: resource.actualPeriod?.end || '',
            serviceProvider: serviceProviderDisplay,
          };
        });

      setEncounters(processedEncounters);
    }
  }, [encounterBundle]);

  // Get unique types and statuses for filtering
  const types = Array.from(new Set(encounters.map((enc) => enc.type)));
  const statuses = Array.from(new Set(encounters.map((enc) => enc.status)));

  // Filter encounters based on selected filters
  const filteredEncounters = encounters.filter(
    (enc) =>
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

  if (filteredEncounters.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <p className="text-yellow-700">No encounters found for this patient.</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'in-progress':
        return 'blue';
      case 'finished':
      case 'completed':
        return 'green';
      case 'cancelled':
        return 'red';
      case 'planned':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          Encounters for {patientContext?.patient?.name?.[0]?.given?.[0]}{' '}
          {patientContext?.patient?.name?.[0]?.family}
        </h2>
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
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Class
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                End Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Service Provider
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEncounters.map((encounter) => (
              <tr key={encounter.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {encounter.type}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{encounter.class}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-${getStatusBadgeColor(
                      encounter.status,
                    )}-100 text-${getStatusBadgeColor(encounter.status)}-800`}
                  >
                    {encounter.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {formatDate(encounter.periodStart)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {formatDate(encounter.periodEnd)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {encounter.serviceProvider}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    to={`/patient/${id}/encounter/crud/${encounter.id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EncounterPage;
