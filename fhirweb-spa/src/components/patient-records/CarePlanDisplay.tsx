import React, { useMemo } from 'react';

interface ParsedCarePlan {
  isCarePlanGap: boolean;
  draftWarning: string | null;
  gapIdentified: {
    date: string;
    patient: {
      mrn: string;
      dob: string;
      age: number;
      gender: string;
    };
    description: string;
  } | null;
  recommendation: string | null;
  clinicalNote: string | null;
}

const parseCarePlanDescription = (description?: string): ParsedCarePlan => {
  if (!description) {
    return {
      isCarePlanGap: false,
      draftWarning: null,
      gapIdentified: null,
      recommendation: null,
      clinicalNote: null,
    };
  }

  const isCarePlanGap = description.includes('Care Gap Identified');

  // Extract draft warning
  const draftMatch = description.match(
    /^(DRAFT — REQUIRES CLINICAL REVIEW[^\n.]*\.)/,
  );
  const draftWarning = draftMatch ? draftMatch[1] : null;

  // Extract care gap details
  let gapIdentified = null;
  if (isCarePlanGap) {
    const gapPattern =
      /Care Gap Identified \(([^)]+)\):\s*This patient \(MRN:\s*([^,]+),\s*DOB:\s*([^,]+),\s*age\s+(\d+),\s*([^)]+)\)\s*(.+?)\s*Screening Recommendation:/;
    const gapMatch = description.match(gapPattern);

    if (gapMatch) {
      gapIdentified = {
        date: gapMatch[1],
        patient: {
          mrn: gapMatch[2].trim(),
          dob: gapMatch[3].trim(),
          age: parseInt(gapMatch[4], 10),
          gender: gapMatch[5].trim(),
        },
        description: gapMatch[6].trim(),
      };
    }
  }

  // Extract screening recommendation
  const recommendationMatch = description.match(
    /Screening Recommendation:\s*(.+?)(?:Clinical review|$)/,
  );
  const recommendation = recommendationMatch
    ? recommendationMatch[1].trim()
    : null;

  // Extract clinical review note
  const clinicalMatch = description.match(
    /Clinical review is required before any action is taken on this recommendation\./,
  );
  const clinicalNote = clinicalMatch
    ? 'Clinical review is required before any action is taken on this recommendation.'
    : null;

  return {
    isCarePlanGap,
    draftWarning,
    gapIdentified,
    recommendation,
    clinicalNote,
  };
};

export const CarePlanDisplay: React.FC<{
  description?: string;
  category?: Array<{
    coding?: Array<{ code?: string; display?: string; system?: string }>;
    text?: string;
  }>;
}> = ({ description, category }) => {
  const parsed = useMemo(
    () => parseCarePlanDescription(description),
    [description],
  );

  // Extract category codes and displays
  const categoryItems = useMemo(() => {
    if (!category || !Array.isArray(category)) return [];
    return category.flatMap((cat) => {
      const items = [];
      if (cat.coding && Array.isArray(cat.coding)) {
        items.push(
          ...cat.coding.map((code) => ({
            code: code.code,
            display: code.display,
            system: code.system,
          })),
        );
      }
      if (cat.text) {
        items.push({ code: undefined, display: cat.text, system: undefined });
      }
      return items;
    });
  }, [category]);

  // Show plain text if not a care plan gap
  if (!parsed.isCarePlanGap) {
    return (
      <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
        {description || '—'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category */}
      {categoryItems.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
            📂 Category
          </p>
          <div className="space-y-1.5">
            {categoryItems.map((item, idx) => (
              <div key={idx} className="text-sm text-indigo-900">
                {item.display && (
                  <span className="font-medium">{item.display}</span>
                )}
                {item.code && (
                  <span className="text-indigo-700 ml-2">({item.code})</span>
                )}
                {item.system && (
                  <p className="text-xs text-indigo-600 mt-0.5 font-mono">
                    System: {item.system}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Draft Warning */}
      {parsed.draftWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <p className="text-amber-900 font-medium">{parsed.draftWarning}</p>
        </div>
      )}

      {/* Care Gap Details */}
      {parsed.gapIdentified && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Care Gap Identified
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {parsed.gapIdentified.date}
                </p>
              </div>
            </div>

            {/* Patient Information Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-semibold text-gray-500">MRN</p>
                <p className="text-sm font-mono text-gray-700 mt-0.5">
                  {parsed.gapIdentified.patient.mrn}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">DOB</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  {parsed.gapIdentified.patient.dob}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Age</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  {parsed.gapIdentified.patient.age}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Gender</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  {parsed.gapIdentified.patient.gender}
                </p>
              </div>
            </div>

            {/* Gap Description */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-2">
                ⚠️ Care Gap Identified
              </p>
              <p className="text-sm text-red-800">
                {parsed.gapIdentified.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Screening Recommendation */}
      {parsed.recommendation && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            📋 Screening Recommendation
          </p>
          <p className="text-sm text-blue-900">{parsed.recommendation}</p>
        </div>
      )}

      {/* Clinical Review Note */}
      {parsed.clinicalNote && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-yellow-800">
            ✓ {parsed.clinicalNote}
          </p>
        </div>
      )}
    </div>
  );
};
