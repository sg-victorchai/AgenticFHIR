import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bundle, Patient as FHIRPatient } from 'fhir/r5';
import {
  useSearchPatientsQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';

interface PatientResult {
  id: string;
  name: string;
  gender: string;
  birthDate: string;
  identifier: string;
}

const PatientSearchPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [shouldSearch, setShouldSearch] = useState(false);
  const [searchParams, setSearchParams] = useState<Record<string, string>>({});
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRPatient> | undefined
  >();

  // Only trigger the query when shouldSearch is true and we have search parameters
  const {
    data: searchResults,
    error: searchError,
    isLoading,
  } = useSearchPatientsQuery(searchParams, {
    skip: !shouldSearch || Object.keys(searchParams).length === 0,
  });

  // Update current bundle when search results change
  React.useEffect(() => {
    if (searchResults) {
      setCurrentBundle(searchResults);
    }
  }, [searchResults]);

  // Pagination hooks
  const [triggerNextPage, { isLoading: isLoadingNext }] =
    useGetNextPageMutation();
  const [triggerPreviousPage, { isLoading: isLoadingPrevious }] =
    useGetPreviousPageMutation();

  const handleNextPage = async () => {
    if (currentBundle) {
      const result = await triggerNextPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRPatient>);
      }
    }
  };

  const handlePreviousPage = async () => {
    if (currentBundle) {
      const result = await triggerPreviousPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRPatient>);
      }
    }
  };

  // Convert FHIR patients to our simplified PatientResult format
  const patientResults: PatientResult[] = React.useMemo(() => {
    if (!currentBundle || !currentBundle.entry) return [];

    return currentBundle.entry
      .filter(
        (entry) => entry.resource && entry.resource.resourceType === 'Patient',
      )
      .map((entry) => {
        const patient = entry.resource as FHIRPatient;

        // Extract the full name from the complex name structure
        const nameObj = patient.name?.[0];
        // Use name.text if available, otherwise construct from parts
        const fullName =
          nameObj?.text ||
          (nameObj
            ? [
                nameObj.prefix?.join(' '),
                nameObj.given?.join(' '),
                nameObj.family,
              ]
                .filter(Boolean)
                .join(' ')
            : 'Unknown Name');

        // Extract the primary identifier (usually MRN or National ID)
        const primaryIdentifier = patient.identifier?.length
          ? `${
              patient.identifier[0].system
                ? patient.identifier[0].system.split('/').pop() + ': '
                : ''
            }${patient.identifier[0].value || ''}`
          : 'Unknown';

        return {
          id: patient.id || '',
          name: fullName,
          gender: patient.gender || 'unknown',
          birthDate: patient.birthDate || 'unknown',
          identifier: primaryIdentifier,
        };
      });
  }, [currentBundle]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchTerm.trim()) {
      return;
    }

    // Set up the search parameters for the FHIR query
    // The 'name:contains' search parameter allows for partial name matching
    setSearchParams({ 'name:contains': searchTerm });
    setShouldSearch(true);
  };

  // Determine error message from the RTK query error
  const errorMessage = searchError
    ? 'Failed to search patients. Please try again.'
    : null;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-6">Patient Search</h1>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <input
                type="text"
                placeholder="Search by patient name..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition duration-300"
              disabled={isLoading}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p>{errorMessage}</p>
          </div>
        )}

        {patientResults.length > 0 ? (
          <div className="overflow-x-auto">
            {/* Pagination at top */}
            <Pagination
              bundle={currentBundle}
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
              isLoadingNext={isLoadingNext}
              isLoadingPrevious={isLoadingPrevious}
              position="top"
            />

            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Identifier
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Gender
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date of Birth
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Patient Details
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Summary Care Records
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {patientResults.map((patient) => (
                  <tr key={patient.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {patient.identifier}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {patient.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {patient.gender}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {patient.birthDate}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        to={`/patient/${patient.id}/details`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        to={`/patient/${patient.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Summary
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
              isLoadingNext={isLoadingNext}
              isLoadingPrevious={isLoadingPrevious}
              position="bottom"
            />
          </div>
        ) : (
          shouldSearch &&
          !isLoading && (
            <p className="text-gray-500 italic">
              No patients found matching "{searchTerm}"
            </p>
          )
        )}

        {isLoading && (
          <div className="flex justify-center items-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientSearchPage;
