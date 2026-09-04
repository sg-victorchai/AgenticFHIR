import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Bundle, Patient as FHIRPatient } from 'fhir/r5';
import {
  useSearchPatientsQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
  useGoToPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';
import { RootState } from '../store';

interface PatientResult {
  id: string;
  name: string;
  gender: string;
  birthDate: string;
  identifier: string;
  address?: string;
  contactNumber?: string;
  nextOfKin?: {
    name: string;
    relationship: string;
    phone?: string;
  };
}

const PatientSearchPage: React.FC = () => {
  const role = useSelector((state: RootState) => state.ui.role);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'name' | 'identifier'>('name');
  const [shouldSearch, setShouldSearch] = useState(false);
  const [searchParams, setSearchParams] = useState<Record<string, string>>({});
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRPatient> | undefined
  >();
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);

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

  const handleFirstPage = async () => {
    if (currentBundle) {
      const result = await triggerFirstPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRPatient>);
      }
    }
  };

  const handleLastPage = async () => {
    if (currentBundle) {
      const result = await triggerLastPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRPatient>);
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

        // Extract the primary identifier value
        const idEntry = patient.identifier?.[0];
        const primaryIdentifier = idEntry?.value || 'Unknown';

        // Extract address
        const addressObj = patient.address?.[0];
        const address = addressObj
          ? [
              addressObj.line?.join(', '),
              addressObj.city,
              addressObj.state,
              addressObj.postalCode,
              addressObj.country,
            ]
              .filter(Boolean)
              .join(', ')
          : undefined;

        // Extract contact number (telecom of type 'phone')
        const phoneEntry = patient.telecom?.find(
          (t) => t.system === 'phone'
        );
        const contactNumber = phoneEntry?.value;

        // Extract next of kin (contact with relationship)
        const nokEntry = patient.contact?.[0];
        const nextOfKin = nokEntry
          ? {
              name: nokEntry.name?.text || 'Unknown',
              relationship: nokEntry.relationship?.[0]?.coding?.[0]?.display || nokEntry.relationship?.[0]?.text || 'Relative',
              phone: nokEntry.telecom?.find((t) => t.system === 'phone')?.value,
            }
          : undefined;

        return {
          id: patient.id || '',
          name: fullName,
          gender: patient.gender || 'unknown',
          birthDate: patient.birthDate || 'unknown',
          identifier: primaryIdentifier,
          address,
          contactNumber,
          nextOfKin,
        };
      });
  }, [currentBundle]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchTerm.trim()) {
      return;
    }

    // Set up the search parameters for the FHIR query
    if (searchType === 'identifier') {
      setSearchParams({ identifier: searchTerm });
    } else {
      setSearchParams({ 'name:contains': searchTerm });
    }
    setShouldSearch(true);
  };

  // Determine error message from the RTK query error
  const errorMessage = searchError
    ? 'Failed to search patients. Please try again.'
    : null;

  return (
    <div className="container mx-auto px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Patient Search</h1>
        {role === 'psa' && (
          <Link
            to="/queue"
            className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Patient Queue
          </Link>
        )}
      </div>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="mb-4">
          {/* Search type toggle */}
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="searchType"
                value="name"
                checked={searchType === 'name'}
                onChange={() => setSearchType('name')}
                className="accent-blue-600"
              />
              Search by Name
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="searchType"
                value="identifier"
                checked={searchType === 'identifier'}
                onChange={() => setSearchType('identifier')}
                className="accent-blue-600"
              />
              Search by Identifier / MRN
            </label>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <input
                type="text"
                placeholder={searchType === 'name' ? 'Search by patient name…' : 'Enter identifier or MRN…'}
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
              onFirstPage={handleFirstPage}
              onLastPage={handleLastPage}
              onGoToPage={handleGoToPage}
              isLoading={isPaginationLoading}
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
                    Register
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {patientResults.map((patient) => (
                  <React.Fragment key={patient.id}>
                    <tr>
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
                        <button
                          onClick={() => setExpandedPatientId(expandedPatientId === patient.id ? null : patient.id)}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          {expandedPatientId === patient.id ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-row gap-2">
                          {role === 'psa' && (
                            <Link
                              to={`/patient/${patient.id}/visit/new`}
                              className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white font-medium py-1.5 px-3 rounded-md transition-colors text-xs"
                            >
                              Register
                            </Link>
                          )}
                          {role === 'clinician' && (
                            <Link
                              to={`/patient/${patient.id}/encounter`}
                              className="inline-flex items-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-1.5 px-3 rounded-md transition-colors text-xs"
                            >
                              Consult
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedPatientId === patient.id && (
                      <tr className="bg-blue-50 border-t-2 border-blue-200">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="space-y-4">
                            {/* Demographics Section */}
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-3">Patient Demographics</h3>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600 font-medium">Full Name</span>
                                  <p className="text-gray-900 mt-1">{patient.name}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-medium">Identifier / MRN</span>
                                  <p className="text-gray-900 mt-1">{patient.identifier}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-medium">Gender</span>
                                  <p className="text-gray-900 mt-1 capitalize">{patient.gender}</p>
                                </div>
                                <div className="col-span-2 md:col-span-3">
                                  <span className="text-gray-600 font-medium">Date of Birth</span>
                                  <p className="text-gray-900 mt-1">{patient.birthDate}</p>
                                </div>
                              </div>
                            </div>

                            {/* Contact Information Section */}
                            <div className="border-t border-blue-200 pt-4">
                              <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600 font-medium">Phone Number</span>
                                  <p className="text-gray-900 mt-1">{patient.contactNumber || 'N/A'}</p>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                  <span className="text-gray-600 font-medium">Address</span>
                                  <p className="text-gray-900 mt-1">{patient.address || 'N/A'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Next of Kin Section */}
                            {patient.nextOfKin && (
                              <div className="border-t border-blue-200 pt-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Next of Kin</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-600 font-medium">Name</span>
                                    <p className="text-gray-900 mt-1">{patient.nextOfKin.name}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600 font-medium">Relationship</span>
                                    <p className="text-gray-900 mt-1 capitalize">{patient.nextOfKin.relationship}</p>
                                  </div>
                                  {patient.nextOfKin.phone && (
                                    <div className="col-span-1 md:col-span-2">
                                      <span className="text-gray-600 font-medium">Phone Number</span>
                                      <p className="text-gray-900 mt-1">{patient.nextOfKin.phone}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
        ) : (
          shouldSearch &&
          !isLoading && (
            <div className="py-6 text-center">
              <p className="text-gray-500 italic mb-4">
                No patients found matching &ldquo;{searchTerm}&rdquo;
              </p>
              <Link
                to="/patient/new"
                className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-md transition-colors w-full sm:w-auto"
              >
                Create New Patient
              </Link>
            </div>
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
