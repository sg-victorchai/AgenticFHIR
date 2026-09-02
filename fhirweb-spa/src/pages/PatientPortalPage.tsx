import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Patient as FHIRPatient } from 'fhir/r5';
import { useSearchPatientsQuery } from '../services/fhir/client';
import { setRole } from '../store/slices/uiSlice';

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

  const searchParams: Record<string, string> = searchTerm.trim()
    ? { 'name:contains': searchTerm.trim(), _count: '20', _offset: '0' }
    : { _count: '20', _offset: '0' };

  const { data: patientBundle, isLoading: patientListLoading } =
    useSearchPatientsQuery(searchParams, {
      skip: !hasSearched || !searchTerm.trim(),
    });

  const patientOptions: PatientOption[] = React.useMemo(() => {
    if (!patientBundle?.entry) return [];
    return patientBundle.entry
      .filter((entry) => entry.resource?.resourceType === 'Patient')
      .map((entry) => {
        const patient = entry.resource as FHIRPatient;
        const nameObj = patient.name?.[0];
        const name =
          nameObj?.text ||
          [nameObj?.prefix?.join(' '), nameObj?.given?.join(' '), nameObj?.family]
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
  }, [patientBundle]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setHasSearched(true);
    }
  };

  const handleSelectPatient = (patientId: string) => {
    sessionStorage.setItem('smartPatientId', patientId);
    dispatch(setRole('patient'));
    navigate(`/patient/${patientId}/records`);
  };

  const handleBack = () => {
    navigate('/smartapp');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-violet-100 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="text-violet-600 hover:text-violet-800 font-medium mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Patient Portal</h1>
          <p className="text-gray-600">
            Search for your patient account to view your medical records and consultation progress
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-2xl shadow-md p-8 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <input
              type="text"
              placeholder="Enter your name to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
            >
              Search
            </button>
          </form>
        </div>

        {/* Results */}
        {hasSearched && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            {patientListLoading && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
              </div>
            )}

            {!patientListLoading && patientOptions.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                {searchTerm.trim() ? 'No patient records found.' : 'Enter a name to search.'}
              </p>
            )}

            {!patientListLoading && patientOptions.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-700 mb-4">
                  Found {patientOptions.length} patient{patientOptions.length !== 1 ? 's' : ''}:
                </h3>
                <div className="divide-y divide-gray-200">
                  {patientOptions.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => handleSelectPatient(patient.id)}
                      className="w-full px-4 py-4 text-left hover:bg-violet-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400"
                    >
                      <p className="font-medium text-gray-800">{patient.name}</p>
                      <p className="text-sm text-gray-500 mt-1">ID: {patient.identifier}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientPortalPage;
