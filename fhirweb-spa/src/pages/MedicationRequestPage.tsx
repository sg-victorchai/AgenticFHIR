import React, { useState } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { Bundle, MedicationRequest as FHIRMedicationRequest } from 'fhir/r5';
import {
  useGetMedicationsQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
  useGoToPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';

interface MedicationRequest {
  id: string;
  status: string;
  medicationCodeableConcept?: {
    text: string;
    coding?: {
      system: string;
      code: string;
      display: string;
    }[];
  };
  dosageInstruction?: {
    text: string;
    timing?: {
      repeat?: {
        frequency: number;
        period: number;
        periodUnit: string;
      };
    };
  }[];
  authoredOn?: string;
}

interface Patient {
  id: string;
  name?: {
    given: string[];
    family: string;
  }[];
}

const MedicationRequestPage: React.FC = () => {
  useOutletContext<Patient>();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State to manage current bundle for pagination
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRMedicationRequest> | undefined
  >();

  // Use the FHIR client hook to fetch medication requests
  const {
    data,
    isLoading,
    error: apiError,
  } = useGetMedicationsQuery(id || '', {
    skip: !id,
  });

  // Update current bundle when data changes
  React.useEffect(() => {
    if (data) {
      setCurrentBundle(data);
    }
  }, [data]);

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
        setCurrentBundle(result.data);
      }
    }
  };

  const handlePreviousPage = async () => {
    if (currentBundle) {
      const result = await triggerPreviousPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data);
      }
    }
  };

  const handleFirstPage = async () => {
    if (currentBundle) {
      const result = await triggerFirstPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data);
      }
    }
  };

  const handleLastPage = async () => {
    if (currentBundle) {
      const result = await triggerLastPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data);
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
        setCurrentBundle(result.data);
      }
    }
  };

  // Format medication requests from the API response
  const medications: MedicationRequest[] = React.useMemo(() => {
    if (!currentBundle || !currentBundle.entry) return [];

    return currentBundle.entry
      .filter((entry) => entry.resource)
      .map((entry) => {
        const resource = entry.resource as any;

        // Handle different medication property structures
        let medicationInfo = null;

        if (resource.medicationCodeableConcept) {
          medicationInfo = resource.medicationCodeableConcept;
        } else if (resource.medication && 'concept' in resource.medication) {
          medicationInfo = resource.medication.concept;
        }

        return {
          id: resource.id || '',
          status: resource.status || 'unknown',
          medicationCodeableConcept: medicationInfo,
          dosageInstruction: resource.dosageInstruction as any,
          authoredOn: resource.authoredOn,
        };
      });
  }, [currentBundle]);

  // Handle error state
  const error = apiError ? 'Failed to load medication data' : null;

  const handleViewDetails = (medicationRequestId: string) => {
    if (id) {
      navigate(`/patient/${id}/medication/crud/${medicationRequestId}`);
    }
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
        <p>{error}</p>
        <button
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Medication Requests</h2>

      {medications.length === 0 ? (
        <p className="text-gray-500 italic">
          No medications found for this patient.
        </p>
      ) : (
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

          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  Medication
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  Prescribed Date
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  Dosage Instructions
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {medications.map((medication) => (
                <tr
                  key={medication.id}
                  className="border-t border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    {medication.medicationCodeableConcept?.text ||
                      medication.medicationCodeableConcept?.coding?.[0]
                        ?.display ||
                      'Unnamed Medication'}
                  </td>
                  <td className="px-4 py-3">
                    {medication.authoredOn || 'Unknown date'}
                  </td>
                  <td className="px-4 py-3">
                    {medication.dosageInstruction?.[0]?.text ||
                      'No instructions provided'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        medication.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {medication.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleViewDetails(medication.id)}
                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center"
                    >
                      <span>View Details</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 ml-1"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
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
      )}
    </div>
  );
};

export default MedicationRequestPage;
