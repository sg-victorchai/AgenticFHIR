import React, { useMemo } from 'react';
import { IconCheckCircle } from './missionUi';

interface CohortSummary {
  totalCandidates: number;
  withRecentHbA1c: number;
  withExistingPlan: number;
  finalCohort: number;
}

interface PatientCarePlan {
  number: number;
  name: string;
  mrn: string;
  dob: string;
  age: number;
  gender: string;
  carePlanId: string;
  lastHbA1cDate: string;
  recommendation: string;
}

interface ParsedCarePlanIntervention {
  summary: string;
  cohortSummary: CohortSummary | null;
  carePlans: PatientCarePlan[];
  finalNote: string;
}

const parseCarePlanIntervention = (
  message: string,
): ParsedCarePlanIntervention => {
  const cohortSummary: CohortSummary | null = (() => {
    const totalMatch = message.match(/Total diabetic candidates aged 45\+:\s*(\d+)/);
    const hbA1cMatch = message.match(/Already had a recent HbA1c \(excluded\):\s*(\d+)/);
    const existingMatch = message.match(/Already had an active care-gap CarePlan from a prior run \(excluded\):\s*(\d+)/);
    const finalMatch = message.match(/Final care-gap cohort:\s*(\d+)\s*patients/);

    if (totalMatch && hbA1cMatch && existingMatch && finalMatch) {
      return {
        totalCandidates: parseInt(totalMatch[1], 10),
        withRecentHbA1c: parseInt(hbA1cMatch[1], 10),
        withExistingPlan: parseInt(existingMatch[1], 10),
        finalCohort: parseInt(finalMatch[1], 10),
      };
    }
    return null;
  })();

  // Extract summary from the beginning
  const summaryMatch = message.match(
    /^([^.]+\. Please review and approve to finalise this run\.)/,
  );
  const summary = summaryMatch ? summaryMatch[1] : '';

  // Parse patient care plans
  const carePlans: PatientCarePlan[] = [];
  const planPattern =
    /(\d+)\.\s+([^\(]+?)\s+\(MRN:\s+([^,]+),\s+DOB:\s+([^,]+),\s+age\s+(\d+),\s+(\w+)\)\s+CarePlan ID:\s+([^\s]+)\s+Gap:\s+([^\|]+)\|\s+Recommendation:\s+([^\n]+)/g;

  let match;
  while ((match = planPattern.exec(message)) !== null) {
    carePlans.push({
      number: parseInt(match[1], 10),
      name: match[2].trim(),
      mrn: match[3].trim(),
      dob: match[4].trim(),
      age: parseInt(match[5], 10),
      gender: match[6].trim(),
      carePlanId: match[7].trim(),
      lastHbA1cDate: match[8].trim(),
      recommendation: match[9].trim(),
    });
  }

  // Extract final note
  const finalNoteMatch = message.match(
    /All CarePlans are in draft status and require clinical review before any action is taken\..*/,
  );
  const finalNote = finalNoteMatch ? finalNoteMatch[0] : '';

  return {
    summary,
    cohortSummary,
    carePlans,
    finalNote,
  };
};

export const CarePlanInterventionDisplay: React.FC<{
  message: string;
}> = ({ message }) => {
  const parsed = useMemo(() => parseCarePlanIntervention(message), [message]);

  if (!parsed.cohortSummary || parsed.carePlans.length === 0) {
    // Fallback to plain text if parsing fails
    return (
      <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
        {message}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <p className="text-sm font-medium text-gray-900">{parsed.summary}</p>

      {/* Cohort Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Total Candidates
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {parsed.cohortSummary.totalCandidates}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Had Recent HbA1c
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {parsed.cohortSummary.withRecentHbA1c}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Existing Plan
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {parsed.cohortSummary.withExistingPlan}
          </p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-3 bg-amber-50">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Final Cohort
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-1">
            {parsed.cohortSummary.finalCohort}
          </p>
        </div>
      </div>

      {/* Care Plans List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <IconCheckCircle className="h-4 w-4 text-amber-600" />
          Drafted CarePlans for Review ({parsed.carePlans.length})
        </h4>

        <div className="space-y-2">
          {parsed.carePlans.map((plan) => (
            <div
              key={plan.carePlanId}
              className="border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors p-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-semibold shrink-0">
                  {plan.number}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Patient Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-1.5">
                    <h5 className="font-semibold text-gray-900 text-sm">
                      {plan.name}
                    </h5>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
                      Age {plan.age} • {plan.gender}
                    </span>
                  </div>

                  {/* Patient Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2.5 text-xs">
                    <div>
                      <p className="text-gray-500 font-medium">MRN</p>
                      <p className="text-gray-700 font-mono">{plan.mrn}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">DOB</p>
                      <p className="text-gray-700">{plan.dob}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500 font-medium">Care Plan ID</p>
                      <p className="text-gray-700 font-mono truncate">
                        {plan.carePlanId}
                      </p>
                    </div>
                  </div>

                  {/* Care Gap & Recommendation */}
                  <div className="bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 space-y-1">
                    <p className="text-xs">
                      <span className="font-semibold text-amber-900">Gap:</span>{' '}
                      <span className="text-amber-800">{plan.lastHbA1cDate}</span>
                    </p>
                    <p className="text-xs">
                      <span className="font-semibold text-amber-900">
                        Recommendation:
                      </span>{' '}
                      <span className="text-amber-800">
                        {plan.recommendation}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final Note */}
      {parsed.finalNote && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
          <p className="font-medium mb-1">📋 Important:</p>
          <p>{parsed.finalNote}</p>
        </div>
      )}
    </div>
  );
};
