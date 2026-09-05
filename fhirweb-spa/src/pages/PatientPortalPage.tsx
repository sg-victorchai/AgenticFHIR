import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Bundle, Patient as FHIRPatient } from 'fhir/r5';
import {
  useSearchPatientsQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
} from '../services/fhir/client';
import { setRole } from '../store/slices/uiSlice';
import { Pagination } from '../components/common/Pagination';

interface PatientOption {
  id: string;
  name: string;
  identifier: string;
}

const PatientPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchTerm, setSearchTerm] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRPatient> | undefined
  >();

  // Initial search params - load all patients
  const initialSearchParams: Record<string, string> = {
    _count: '10',
    _offset: '0',
  };

  // Dynamic search params - when user searches
  const searchParams: Record<string, string> =
    hasSearched && searchTerm.trim()
      ? { 'name:contains': searchTerm.trim(), _count: '10', _offset: '0' }
      : initialSearchParams;

  // Query for patient list
  const { data: patientBundle, isLoading: patientListLoading } =
    useSearchPatientsQuery(searchParams);

  // Update current bundle when results change
  useEffect(() => {
    if (patientBundle) {
      setCurrentBundle(patientBundle);
    }
  }, [patientBundle]);

  // Pagination hooks
  const [triggerNextPage, { isLoading: isLoadingNext }] =
    useGetNextPageMutation();
  const [triggerPreviousPage, { isLoading: isLoadingPrevious }] =
    useGetPreviousPageMutation();
  const [triggerFirstPage, { isLoading: isLoadingFirst }] =
    useGetFirstPageMutation();
  const [triggerLastPage, { isLoading: isLoadingLast }] =
    useGetLastPageMutation();

  const isPaginationLoading =
    isLoadingNext || isLoadingPrevious || isLoadingFirst || isLoadingLast;

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

  const handleGoToPage = async (_pageNumber: number) => {
    // Go to page is not implemented for this simple flow
    // The pagination component will show navigation controls
  };

  const patientOptions: PatientOption[] = React.useMemo(() => {
    if (!currentBundle?.entry) return [];
    return currentBundle.entry
      .filter((entry) => entry.resource?.resourceType === 'Patient')
      .map((entry) => {
        const patient = entry.resource as FHIRPatient;
        const nameObj = patient.name?.[0];
        const name =
          nameObj?.text ||
          [
            nameObj?.prefix?.join(' '),
            nameObj?.given?.join(' '),
            nameObj?.family,
          ]
            .filter(Boolean)
            .join(' ') ||
          'Unknown Name';

        return {
          id: patient.id || '',
          name,
          identifier: patient.identifier?.[0]?.value || 'N/A',
        };
      })
      .filter((p) => p.id);
  }, [currentBundle]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setHasSearched(true);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setHasSearched(false);
  };

  const handleSelectPatient = (patientId: string) => {
    sessionStorage.setItem('smartPatientId', patientId);
    dispatch(setRole('patient'));
    navigate(`/patient/${patientId}/records`);
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-violet-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="text-violet-600 hover:text-violet-800 font-medium mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Patient Portal
          </h1>
          <p className="text-gray-600">
            View your records, upload medical reports and ask AI to check your health conditions
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-2xl shadow-md p-4 sm:p-8 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <input
              type="text"
              placeholder="Enter your name to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 w-full"
            />
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="flex-1 sm:flex-none px-4 sm:px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium whitespace-nowrap"
              >
                Search
              </button>
              {hasSearched && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="flex-1 sm:flex-none px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Results / Initial List */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700">
              {hasSearched
                ? `Search Results (${patientOptions.length})`
                : 'All Patients'}
            </h3>
            {patientListLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600" />
            )}
          </div>

          {patientListLoading && patientOptions.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
            </div>
          )}

          {!patientListLoading && patientOptions.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {hasSearched && searchTerm.trim()
                ? 'No patient records found.'
                : 'No patients available.'}
            </p>
          )}

          {!patientListLoading && patientOptions.length > 0 && (
            <>
              <div className="divide-y divide-gray-200">
                {patientOptions.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient.id)}
                    className="w-full px-4 py-4 text-left hover:bg-violet-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400"
                  >
                    <p className="font-medium text-gray-800">{patient.name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      ID: {patient.identifier}
                    </p>
                  </button>
                ))}
              </div>

              {/* Pagination Controls */}
              {currentBundle && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <Pagination
                    bundle={currentBundle}
                    onFirstPage={handleFirstPage}
                    onPreviousPage={handlePreviousPage}
                    onNextPage={handleNextPage}
                    onLastPage={handleLastPage}
                    onGoToPage={handleGoToPage}
                    isLoading={isPaginationLoading}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientPortalPage;
