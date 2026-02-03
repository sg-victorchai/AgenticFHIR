import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { Bundle, CarePlan as FHIRCarePlan } from 'fhir/r5';
import {
  useGetCarePlansQuery,
  useGetNextPageMutation,
  useGetPreviousPageMutation,
  useGetFirstPageMutation,
  useGetLastPageMutation,
  useGoToPageMutation,
} from '../services/fhir/client';
import { Pagination } from '../components/common/Pagination';

interface CarePlan {
  id: string;
  title: string;
  status: string;
  period?: {
    start: string;
    end?: string;
  };
  description?: string;
}

const CarePlanPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const patientContext = useOutletContext<any>();
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [currentBundle, setCurrentBundle] = useState<
    Bundle<FHIRCarePlan> | undefined
  >();
  const navigate = useNavigate();

  // Use the RTK Query hook to fetch care plans
  const {
    data: carePlanBundle,
    isLoading,
    error: carePlanError,
  } = useGetCarePlansQuery(id || '', {
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
        setCurrentBundle(result.data as Bundle<FHIRCarePlan>);
      }
    }
  };

  const handlePreviousPage = async () => {
    if (currentBundle) {
      const result = await triggerPreviousPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRCarePlan>);
      }
    }
  };

  const handleFirstPage = async () => {
    if (currentBundle) {
      const result = await triggerFirstPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRCarePlan>);
      }
    }
  };

  const handleLastPage = async () => {
    if (currentBundle) {
      const result = await triggerLastPage(currentBundle);
      if ('data' in result) {
        setCurrentBundle(result.data as Bundle<FHIRCarePlan>);
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
        setCurrentBundle(result.data as Bundle<FHIRCarePlan>);
      }
    }
  };

  // Update current bundle when data changes
  useEffect(() => {
    if (carePlanBundle) {
      setCurrentBundle(carePlanBundle);
    }
  }, [carePlanBundle]);

  useEffect(() => {
    // Process the FHIR CarePlan resources into our app's format
    if (currentBundle && currentBundle.entry) {
      const processedCarePlans: CarePlan[] = currentBundle.entry
        .filter((entry) => entry.resource)
        .map((entry) => {
          const resource = entry.resource as FHIRCarePlan;
          return {
            id: resource.id || '',
            title: resource.title || 'Untitled Care Plan',
            status: resource.status || 'unknown',
            period: resource.period
              ? {
                  start: resource.period.start || '',
                  end: resource.period.end,
                }
              : undefined,
            description: resource.description || '',
          };
        });

      setCarePlans(processedCarePlans);
    }
  }, [currentBundle]);

  const handleViewDetails = (carePlanId: string) => {
    if (id) {
      navigate(`/patient/${id}/careplan/crud/${carePlanId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (carePlanError) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to load care plan data</p>
      </div>
    );
  }

  if (carePlans.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <p className="text-yellow-700">No care plans found for this patient.</p>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Ongoing';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
            Active
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
            Completed
          </span>
        );
      case 'draft':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            Draft
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          Care Plans for {patientContext?.name?.[0]?.given?.[0]}{' '}
          {patientContext?.name?.[0]?.family}
        </h2>
      </div>

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

      <div className="space-y-4">
        {carePlans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200"
          >
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-medium">{plan.title}</h3>
              {getStatusBadge(plan.status)}
            </div>

            <div className="mt-2 text-sm text-gray-600">
              <p className="mb-1">
                <strong>Period:</strong> {formatDate(plan.period?.start)} to{' '}
                {formatDate(plan.period?.end)}
              </p>
              {plan.description && <p className="mt-2">{plan.description}</p>}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => handleViewDetails(plan.id)}
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination at bottom */}
      <div className="mt-6">
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

export default CarePlanPage;
