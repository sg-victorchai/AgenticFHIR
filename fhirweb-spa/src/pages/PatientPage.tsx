import React from 'react';
import { useParams, Outlet, Link, useLocation } from 'react-router-dom';
import { useGetPatientQuery } from '../services/fhir/client';
import { Patient as FHIRPatient } from 'fhir/r5';

interface PatientContextProps {
  patient: FHIRPatient | null;
  patientId: string;
}

const PatientPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const patientId = id || '';
  const location = useLocation();

  // Use the FHIR API hook to fetch patient data
  const { data: patient, isLoading, error } = useGetPatientQuery(patientId);

  const isActive = (path: string) => {
    return location.pathname.includes(path);
  };

  // Check if we're on a CRUD page
  const isOnCrudPage = () => {
    return (
      location.pathname.includes('/new') ||
      location.pathname.includes('/careplan/') ||
      location.pathname.includes('/observation/') ||
      location.pathname.includes('/medication/') ||
      location.pathname.includes('/encounter/crud/')
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to load patient data</p>
        <button
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // Extract name components from FHIR Patient resource
  const nameDisplay =
    patient?.name?.[0]?.text ||
    (patient?.name?.[0]
      ? [
          patient.name[0].prefix?.join(' '),
          patient.name[0].given?.join(' '),
          patient.name[0].family,
        ]
          .filter(Boolean)
          .join(' ')
      : 'Unknown');

  return (
    <div className="container mx-auto px-4">
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">{nameDisplay}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            {/* Display patient identifiers - moved to be first */}
            {patient?.identifier && patient.identifier.length > 0 && (
              <div className="mb-2">
                <strong>Identifiers:</strong>
                <ul className="list-disc list-inside pl-2">
                  {patient.identifier.map((id, index) => (
                    <li key={index} className="text-sm">
                      {id.system ? `${id.system.split('/').pop()}: ` : ''}
                      {id.value}
                      {id.type?.text && (
                        <span className="text-gray-500 ml-1">
                          ({id.type.text})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              <strong>Gender:</strong> {patient?.gender || 'Unknown'}
            </p>
            <p>
              <strong>Date of Birth:</strong> {patient?.birthDate || 'Unknown'}
            </p>
          </div>
          <div>
            {patient?.address && patient.address.length > 0 && (
              <>
                <p>
                  <strong>Address:</strong>
                </p>
                <p>{patient.address[0].line?.join(', ')}</p>
                <p>
                  {patient.address[0].city}, {patient.address[0].state}{' '}
                  {patient.address[0].postalCode}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Navigation tabs for nested routes */}
        <div className="border-b border-gray-200 mb-6">
          <nav>
            <div className="flex space-x-8">
              <Link
                to={`/patient/${patientId}/encounter`}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive('/encounter')
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Encounters
              </Link>
              <Link
                to={`/patient/${patientId}/observation`}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive('/observation')
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Observations
              </Link>
              <Link
                to={`/patient/${patientId}/medication`}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive('/medication')
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Medications
              </Link>
              <Link
                to={`/patient/${patientId}/careplan`}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive('/careplan')
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Care Plans
              </Link>
            </div>
          </nav>
        </div>

        {/* Content section with outlet and "New" button for each tab */}
        <div className="relative">
          {/* Render the "New" button when appropriate tabs are active but not when on CRUD pages */}
          {(isActive('/careplan') ||
            isActive('/observation') ||
            isActive('/medication')) &&
            !isOnCrudPage() && (
              <div className="absolute right-0 top-0">
                <Link
                  to={`/patient/${patientId}/${
                    isActive('/careplan')
                      ? 'careplan/new'
                      : isActive('/observation')
                        ? 'observation/new'
                        : 'medication/new'
                  }`}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  New{' '}
                  {isActive('/careplan')
                    ? 'Care Plan'
                    : isActive('/observation')
                      ? 'Observation'
                      : 'Medication'}
                </Link>
              </div>
            )}

          {/* Outlet renders the nested route components */}
          <Outlet context={{ patient, patientId } as PatientContextProps} />

          {/* Default content when no nested route is active */}
          {location.pathname === `/patient/${patientId}` && (
            <div className="bg-gray-50 p-4 rounded">
              <h2 className="text-lg font-medium mb-4">Patient Summary</h2>
              <p>Select a tab above to view specific patient information.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientPage;
