import React, { useState } from 'react';
import { IconSpinner } from './missionUi';
import { useGetResourceByIdQuery } from '../../services/fhir/client';

interface CarePlanModalProps {
  carePlanId: string;
  patientName: string;
  onClose: () => void;
}

export const CarePlanModal: React.FC<CarePlanModalProps> = ({
  carePlanId,
  patientName,
  onClose,
}) => {
  const { data: carePlanData, isLoading, error } = useGetResourceByIdQuery({
    resourceType: 'CarePlan',
    id: carePlanId,
  });

  const [showFullText, setShowFullText] = useState(false);

  const carePlan = carePlanData as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-0">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-lg shadow-xl flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              Care Plan
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
              {patientName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <IconSpinner className="h-6 w-6 text-blue-600 animate-spin" />
              <span className="ml-2 text-sm text-gray-600">Loading care plan...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">
                Failed to load care plan. Please try again.
              </p>
            </div>
          ) : carePlan ? (
            <>
              {/* ID Section */}
              <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                <label className="font-medium text-gray-700 block mb-1">
                  Care Plan ID
                </label>
                <p className="text-gray-600 font-mono break-all">{carePlanId}</p>
              </div>

              {/* Status */}
              {carePlan.status && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-1">
                    Status
                  </label>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    {carePlan.status}
                  </span>
                </div>
              )}

              {/* Intent */}
              {carePlan.intent && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-1">
                    Intent
                  </label>
                  <p className="text-gray-600">{carePlan.intent}</p>
                </div>
              )}

              {/* Category */}
              {carePlan.category && carePlan.category.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-2">
                    Category
                  </label>
                  <div className="space-y-1">
                    {carePlan.category.map((cat: any, idx: number) => (
                      <div key={idx}>
                        {cat.coding && cat.coding.length > 0 && (
                          <div>
                            {cat.coding[0].display && (
                              <p className="text-gray-900 font-medium">
                                {cat.coding[0].display}
                              </p>
                            )}
                            {cat.coding[0].code && (
                              <p className="text-gray-500 text-xs">
                                {cat.coding[0].code}
                              </p>
                            )}
                          </div>
                        )}
                        {cat.text && (
                          <p className="text-gray-600">{cat.text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              {carePlan.title && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-1">
                    Title
                  </label>
                  <p className="text-gray-600">{carePlan.title}</p>
                </div>
              )}

              {/* Description */}
              {carePlan.description && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-2">
                    Description
                  </label>
                  <div
                    className={`text-gray-600 whitespace-pre-wrap ${
                      !showFullText && carePlan.description.length > 300
                        ? 'line-clamp-4'
                        : ''
                    }`}
                  >
                    {carePlan.description}
                  </div>
                  {carePlan.description.length > 300 && (
                    <button
                      onClick={() => setShowFullText(!showFullText)}
                      className="mt-2 text-blue-600 hover:text-blue-700 font-medium text-xs"
                    >
                      {showFullText ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}

              {/* Addresses */}
              {carePlan.addresses && carePlan.addresses.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-2">
                    Care Gaps/Conditions
                  </label>
                  <div className="space-y-2">
                    {carePlan.addresses.map((addr: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 bg-white border border-gray-200 rounded text-xs sm:text-sm"
                      >
                        {addr.display && (
                          <p className="font-medium text-gray-900">
                            {addr.display}
                          </p>
                        )}
                        {addr.reference && (
                          <p className="text-gray-500 text-xs font-mono break-all">
                            {addr.reference}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Goals */}
              {carePlan.goal && carePlan.goal.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs sm:text-sm">
                  <label className="font-medium text-gray-700 block mb-2">
                    Goals
                  </label>
                  <div className="space-y-2">
                    {carePlan.goal.map((goal: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 bg-white border border-gray-200 rounded text-xs sm:text-sm"
                      >
                        {goal.description && (
                          <p className="text-gray-900">
                            {goal.description.text ||
                              goal.description.coding?.[0]?.display ||
                              JSON.stringify(goal.description)}
                          </p>
                        )}
                        {goal.target && (
                          <div className="mt-1 text-gray-500 text-xs space-y-1">
                            {goal.target.map((t: any, tidx: number) => (
                              <div key={tidx}>
                                {t.measure?.coding?.[0]?.display && (
                                  <span>{t.measure.coding[0].display}: </span>
                                )}
                                {t.dueDate && <span>{t.dueDate}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Created/Updated Dates */}
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                {carePlan.created && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="font-medium text-gray-700 block mb-1">
                      Created
                    </label>
                    <p className="text-gray-600">
                      {new Date(carePlan.created).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {carePlan.meta?.lastUpdated && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="font-medium text-gray-700 block mb-1">
                      Updated
                    </label>
                    <p className="text-gray-600">
                      {new Date(carePlan.meta.lastUpdated).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600">No care plan data available</p>
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
