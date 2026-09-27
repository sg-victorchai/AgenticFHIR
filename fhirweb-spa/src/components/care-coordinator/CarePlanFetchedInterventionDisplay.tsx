import React, { useEffect, useState } from 'react';
import { IconCheckCircle, IconSpinner } from './missionUi';
import { CarePlanCreated } from '../../types/agent';
import { getAuthenticatedHeaders } from '../../services/auth/oidc';

interface CarePlanFetch {
  id: string;
  patientName?: string;
  patientMRN?: string;
  status?: string;
  title?: string;
  loading: boolean;
  error?: string;
}

export const CarePlanFetchedInterventionDisplay: React.FC<{
  resourceIds?: string[];
  hitlTriggerReason?: string;
  question?: string;
  onSelectCarePlan?: (carePlan: CarePlanCreated) => void;
}> = ({ resourceIds, hitlTriggerReason, question, onSelectCarePlan }) => {
  const [carePlans, setCarePlans] = useState<CarePlanFetch[]>([]);

  // Initialize fetch states for each resource ID
  useEffect(() => {
    if (resourceIds && resourceIds.length > 0) {
      setCarePlans(
        resourceIds.map((id) => ({
          id,
          loading: true,
        })),
      );
    }
  }, [resourceIds]);

  // Fetch each CarePlan - using individual queries won't work well with RTK Query
  // So we'll use direct fetch instead
  useEffect(() => {
    if (!resourceIds || resourceIds.length === 0) return;

    const fetchCarePlans = async () => {
      const results: CarePlanFetch[] = [];

      for (const resourceRef of resourceIds) {
        try {
          // Extract ID from "CarePlan/id" format
          const carePlanId = resourceRef.includes('/')
            ? resourceRef.split('/')[1]
            : resourceRef;

          const response = await fetch(
            `${import.meta.env.VITE_FHIR_BASE_URL || '/fhir'}/CarePlan/${encodeURIComponent(carePlanId)}`,
            { headers: await getAuthenticatedHeaders() },
          );

          if (response.ok) {
            const carePlan = await response.json();

            // Extract patient info and relevant fields
            let patientName = 'Unknown Patient';
            let patientMRN = 'N/A';

            if (carePlan.subject?.display) {
              patientName = carePlan.subject.display;
            }

            // Try to extract MRN from identifier
            if (carePlan.subject?.identifier?.value) {
              patientMRN = carePlan.subject.identifier.value;
            } else if (
              carePlan.identifier &&
              Array.isArray(carePlan.identifier)
            ) {
              const mrnId = carePlan.identifier.find(
                (id: any) =>
                  id.type?.coding?.some((c: any) => c.code === 'MR') ||
                  id.system?.includes('mrn'),
              );
              if (mrnId?.value) {
                patientMRN = mrnId.value;
              }
            }

            results.push({
              id: carePlanId,
              patientName,
              patientMRN,
              status: carePlan.status || 'draft',
              title: carePlan.title || carePlan.description || 'Care Plan',
              loading: false,
            });
          } else {
            results.push({
              id: carePlanId,
              loading: false,
              error: `Failed to load (${response.status})`,
            });
          }
        } catch (err) {
          results.push({
            id: resourceRef,
            loading: false,
            error: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      }

      setCarePlans(results);
    };

    fetchCarePlans();
  }, [resourceIds]);

  if (!resourceIds || resourceIds.length === 0) {
    // Fallback to plain text if no resource IDs
    return (
      <div className="space-y-3">
        {hitlTriggerReason && (
          <p className="text-sm text-gray-700">{hitlTriggerReason}</p>
        )}
        {question && <p className="text-sm text-gray-700">{question}</p>}
      </div>
    );
  }

  const hasError = carePlans.some((p) => p.error);
  const allLoaded = carePlans.every((p) => !p.loading);

  return (
    <div className="space-y-5">
      {/* Context Info */}
      {hitlTriggerReason && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-900">{hitlTriggerReason}</p>
        </div>
      )}

      {/* Loading State */}
      {!allLoaded && (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <IconSpinner className="h-4 w-4" />
          Loading care plans…
        </div>
      )}

      {/* Care Plans List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <IconCheckCircle className="h-4 w-4 text-amber-600" />
          Drafted CarePlans for Review ({carePlans.length})
        </h4>

        <div className="space-y-2">
          {carePlans.map((plan, idx) => (
            <div
              key={`${plan.id}-${idx}`}
              className={`border rounded-lg p-3.5 ${
                plan.error
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.loading ? (
                <div className="flex items-center gap-2">
                  <IconSpinner className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    Loading care plan…
                  </span>
                </div>
              ) : plan.error ? (
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-red-700 mt-0.5">
                    ⚠
                  </span>
                  <div>
                    <p className="text-sm font-medium text-red-900">
                      {plan.id}
                    </p>
                    <p className="text-xs text-red-700">{plan.error}</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (onSelectCarePlan && plan.patientName) {
                      onSelectCarePlan({
                        patientId: '', // Not available from CarePlan fetch
                        carePlanId: plan.id,
                        name: plan.patientName || 'Unknown',
                        mrn: plan.patientMRN || 'N/A',
                      });
                    }
                  }}
                  className="w-full text-left hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Patient Header */}
                      <div className="flex items-baseline gap-2 mb-1">
                        <h5 className="font-semibold text-gray-900 text-sm">
                          {plan.patientName}
                        </h5>
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
                          {plan.status}
                        </span>
                      </div>

                      {/* Patient Details */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2 text-xs">
                        <div>
                          <p className="text-gray-500 font-medium">MRN</p>
                          <p className="text-gray-700 font-mono">
                            {plan.patientMRN}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-gray-500 font-medium">
                            Care Plan ID
                          </p>
                          <p className="text-gray-700 font-mono truncate">
                            {plan.id}
                          </p>
                        </div>
                      </div>

                      {/* Care Plan Title */}
                      {plan.title && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {plan.title}
                        </p>
                      )}

                      {/* View/Edit badge */}
                      {onSelectCarePlan && (
                        <div className="flex justify-end">
                          <span className="inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            View/Edit
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {hasError && (
          <p className="text-xs text-red-600 mt-2">
            Some care plans failed to load. Please try again.
          </p>
        )}
      </div>
    </div>
  );
};
