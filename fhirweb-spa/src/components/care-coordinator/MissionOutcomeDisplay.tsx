import React from 'react';

interface OutcomeMetric {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

interface ParsedOutcome {
  assessmentType?: string;
  cohortCriteria?: string;
  metrics: OutcomeMetric[];
  status: 'success' | 'warning' | 'info';
  summary?: string;
  details?: string[];
  rawResponse: string;
}

const parseOutcome = (response: string): ParsedOutcome => {
  if (!response || !response.trim()) {
    return {
      metrics: [],
      status: 'info',
      summary: 'No outcome information available',
      details: [],
      rawResponse: response,
    };
  }

  const metrics: OutcomeMetric[] = [];
  let status: 'success' | 'warning' | 'info' = 'info';
  let assessmentType = '';
  let cohortCriteria = '';
  let summary = '';
  const details: string[] = [];

  // Try to parse as JSON first
  let jsonData: any = null;
  try {
    jsonData = JSON.parse(response);
  } catch (e) {
    // Not JSON, will use regex fallback
  }

  if (jsonData && typeof jsonData === 'object') {
    // Handle structured JSON response
    assessmentType = 'diabetic care-gap';

    // Check if summary contains nested markdown code block with JSON
    // New format: {"summary": "```json\n{...}\n```"}
    let nestedOutputs = null;
    if (jsonData.summary && typeof jsonData.summary === 'string') {
      try {
        // Extract JSON from markdown code block: ```json\n{...}\n```
        const jsonMatch = jsonData.summary.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const nestedJson = JSON.parse(jsonMatch[1]);
          nestedOutputs = nestedJson.parameters?.outputs;
        }
      } catch (e) {
        // Not a markdown code block or invalid JSON, continue
      }
    }

    // Extract metrics from different possible JSON structures
    // Structure 1: Nested summary format (new local dev format)
    let outputsToUse = nestedOutputs;

    // Structure 2: Direct outputs field
    if (!outputsToUse) {
      outputsToUse = jsonData.outputs;
    }

    let foundCarePlans: any[] = [];

    if (outputsToUse && typeof outputsToUse === 'object') {
      const {
        totalCandidates,
        excludedRecentHbA1c,
        excludedPriorCarePlan,
        finalCohortSize,
        finalCohortCount, // New field name in local dev format
        carePlansCreated = [],
      } = outputsToUse;

      foundCarePlans = carePlansCreated;

      // Use new structure if available
      if (totalCandidates !== undefined) {
        metrics.push({
          label: 'Candidate Patients',
          value: totalCandidates,
          color: 'blue',
        });

        if (excludedRecentHbA1c !== undefined) {
          metrics.push({
            label: 'With Recent HbA1c',
            value: totalCandidates - excludedRecentHbA1c,
            color: 'green',
          });
        }

        if (excludedPriorCarePlan !== undefined) {
          metrics.push({
            label: 'Excluded (Existing Plan)',
            value: excludedPriorCarePlan,
            color: 'gray',
          });
        }

        // Use finalCohortCount (new format) or finalCohortSize (old format)
        const cohortCount =
          finalCohortCount !== undefined ? finalCohortCount : finalCohortSize;
        if (cohortCount !== undefined && cohortCount > 0) {
          metrics.push({
            label: 'Care-Gap Cohort',
            value: cohortCount,
            color: 'amber',
          });
          status = 'success'; // Changed to success since these are approved/drafted
          summary = `${cohortCount} patient${cohortCount !== 1 ? 's' : ''} with care-gap identified and drafted for review`;
        }
      }
    }

    // Fallback: Structure 3: Legacy format with proposedPlan.steps
    // proposedPlan can be at root level (jsonData.proposedPlan) or nested in outputs
    const proposedPlan =
      jsonData.proposedPlan || (outputsToUse && outputsToUse.proposedPlan);
    const createdResourceIds =
      jsonData.createdResourceIds ||
      (outputsToUse && outputsToUse.createdResourceIds) ||
      [];

    if (
      metrics.length === 0 &&
      proposedPlan &&
      Array.isArray(proposedPlan.steps)
    ) {
      const step0 = proposedPlan.steps[0]?.description || '';
      const step1 = proposedPlan.steps[1]?.description || '';

      // Extract candidate patients from step 0: "30 patients found"
      const candidateMatch = step0.match(/(\d+)\s+patients?\s+found/i);
      if (candidateMatch) {
        const num = parseInt(candidateMatch[1]);
        if (num > 0 && num < 500) {
          metrics.push({
            label: 'Candidate Patients',
            value: num,
            color: 'blue',
          });
        }
      }

      // Extract HbA1c count from step 0: "28 already have a recent HbA1c"
      const hba1cMatch = step0.match(
        /(\d+)\s+already\s+have\s+a\s+recent\s+HbA1c/i,
      );
      if (hba1cMatch) {
        const num = parseInt(hba1cMatch[1]);
        if (num > 0 && num < 500) {
          metrics.push({
            label: 'With Recent HbA1c',
            value: num,
            color: 'green',
          });
        }
      }

      // Extract final cohort from step 1: "2 remain in finalCohort"
      const cohortMatch = step1.match(
        /(\d+)\s+remain\s+in\s+(?:final)?cohort/i,
      );
      if (cohortMatch) {
        const num = parseInt(cohortMatch[1]);
        if (num > 0 && num < 500) {
          metrics.push({
            label: 'Care-Gap Cohort',
            value: num,
            color: 'amber',
          });
          status = 'warning';
          summary = `${num} patient${num !== 1 ? 's' : ''} identified for HbA1c testing gap`;
        }
      }
    }

    // Extract care plans from multiple sources (new structure takes priority)
    let finalCarePlans = foundCarePlans;
    if (!finalCarePlans || finalCarePlans.length === 0) {
      finalCarePlans = createdResourceIds;
    }
    if (Array.isArray(finalCarePlans) && finalCarePlans.length > 0) {
      metrics.push({
        label: 'Care Plans Generated',
        value: finalCarePlans.length,
        color: 'blue',
      });
    }

    // Extract HITL trigger reason (can be at root or in outputs)
    const hitlTriggerReason =
      jsonData.hitlTriggerReason ||
      (outputsToUse && outputsToUse.hitlTriggerReason) ||
      '';
    if (hitlTriggerReason) {
      if (hitlTriggerReason.includes('Drafted')) {
        details.push('📋 Care plans were generated and await review');
      }
      if (hitlTriggerReason.includes('HbA1c')) {
        details.push('📊 Recommends HbA1c testing');
      }
      if (hitlTriggerReason.includes('clinical review')) {
        details.push('⚠️ Requires clinical review before action');
      }
    }
  } else {
    // Fallback to regex-based parsing for plain text responses
    assessmentType = '';
    const assessmentMatch = response.match(
      /diabetic\s+care-gap|care-gap|assessment/i,
    );
    if (assessmentMatch) {
      assessmentType = assessmentMatch[0];
    }

    // Extract candidate patients count - multiple patterns
    const candidateMatch =
      response.match(/(\d+)\s+candidate\s+patients/i) ||
      response.match(/Total.*?candidate[^:]*:\s*(\d+)/i) ||
      response.match(/found.*?(\d+)\s+patient/i);
    if (candidateMatch) {
      metrics.push({
        label: 'Candidate Patients',
        value: candidateMatch[1],
        color: 'blue',
      });
    }

    // Extract recent HbA1c count - multiple patterns
    // Look for "6 already had a recent HbA1c" (number BEFORE the phrase, not dates after)
    let recentHbA1cMatch =
      response.match(/(\d+)\s+already had a recent HbA1c/i) ||
      response.match(/candidatesWithRecentHbA1c\s*[=:]\s*(\d+)/i) ||
      response.match(/With\s+(?:recent\s+)?HbA1c[^:]*:\s*(\d+)/i) ||
      response.match(/HbA1c.*?already.*?(\d+)/i);

    if (recentHbA1cMatch) {
      const count = recentHbA1cMatch[1] || '0';
      const numValue = parseInt(count);
      if (numValue > 0 && numValue < 500) {
        metrics.push({
          label: 'With Recent HbA1c',
          value: count,
          color: 'green',
        });
      }
    }

    // Extract care-gap cohort count - multiple patterns
    const gapCohortMatch =
      response.match(/(\d+)\s+in\s+the\s+final\s+care-gap\s+cohort/i) ||
      response.match(/(?:Final\s+)?care-gap\s+cohort[^:]*:\s*(\d+)/i) ||
      response.match(/finalCohort[^:]*[":]*\s*[=:]\s*(\d+)/i) ||
      response.match(/"finalCohortSize"\s*:\s*(\d+)/i) ||
      response.match(/finalCohort.*?[=:]\s*(\d+)/i) ||
      response.match(/gapCohort.*?[=:]\s*(\d+)\s*patients/i);

    if (gapCohortMatch) {
      const count = parseInt(gapCohortMatch[1] || '0');
      if (count > 0 && count < 500) {
        metrics.push({
          label: 'Care-Gap Cohort',
          value: count,
          color: 'amber',
        });

        status = 'warning';
        summary = `${count} patient${count !== 1 ? 's' : ''} identified for HbA1c testing gap`;
      }
    }

    // Extract generated care plans count - multiple patterns
    const carePlansMatch =
      response.match(/(?:Drafted|Generated)\s+(\d+)\s+CarePlan/i) ||
      response.match(
        /(\d+)\s*care.?plans?\s*(?:were\s+)?(?:generated|drafted)/i,
      );
    if (carePlansMatch) {
      metrics.push({
        label: 'Care Plans Generated',
        value: carePlansMatch[1],
        color: carePlansMatch[1] === '0' ? 'gray' : 'blue',
      });
    }

    // Extract existing plans excluded
    const existingPlansMatch =
      response.match(
        /(\d+)\s+of\s+\d+\s+gap-cohort\s+patients\s+had\s+a\s+prior/i,
      ) ||
      response.match(/Already\s+had\s+an\s+active.*?CarePlan[^:]*:\s*(\d+)/i) ||
      response.match(/Existing\s+care-gap\s+CarePlan[^:]*:\s*(\d+)/i);

    if (existingPlansMatch) {
      const count = existingPlansMatch[1] || '0';
      const numValue = parseInt(count);
      if (numValue < 500) {
        metrics.push({
          label: 'Existing Plans',
          value: count,
          color: 'gray',
        });
      }
    }

    // Extract key details from plain text
    if (response.includes('no action needed')) {
      details.push('✓ No action required at this time');
    }
    if (response.includes('care plans') && response.includes('reviewed')) {
      details.push('✓ Care plans were reviewed and approved');
    }
    if (
      response.includes('drafted') ||
      response.includes('Drafted') ||
      response.includes('created')
    ) {
      details.push('📋 Care plans were generated and await review');
    }
    if (
      response.includes('HbA1c test') ||
      response.includes('ordering an HbA1c')
    ) {
      details.push('📊 Recommends HbA1c testing');
    }
    if (
      response.includes('disclaimer') ||
      response.includes('clinical review')
    ) {
      details.push('⚠️ Requires clinical review before action');
    }
  }

  return {
    assessmentType,
    cohortCriteria,
    metrics,
    status,
    summary,
    details: details.length > 0 ? details : undefined,
    rawResponse: response,
  };
};

const getStatusColor = (status: 'success' | 'warning' | 'info'): string => {
  switch (status) {
    case 'success':
      return 'bg-green-50 border-green-200';
    case 'warning':
      return 'bg-amber-50 border-amber-200';
    default:
      return 'bg-blue-50 border-blue-200';
  }
};

const getMetricColor = (
  color: 'blue' | 'green' | 'amber' | 'red' | 'gray',
): string => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-900',
    green: 'bg-green-100 text-green-900',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-900',
    gray: 'bg-gray-100 text-gray-900',
  };
  return colors[color] || colors.gray;
};

interface MissionOutcomeDisplayProps {
  response: string;
}

export const MissionOutcomeDisplay: React.FC<MissionOutcomeDisplayProps> = ({
  response,
}) => {
  const parsed = parseOutcome(response);

  // Fallback if no data was parsed
  if (parsed.metrics.length === 0 && !parsed.summary) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <p className="text-xs text-gray-600 mb-2">
          <span className="font-semibold">Outcome Details:</span>
        </p>
        <div className="text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono bg-white p-3 rounded border border-gray-200">
          {response || 'No outcome information available'}
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor(parsed.status)}`}>
      {/* Assessment Title */}
      {parsed.assessmentType && (
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          {parsed.assessmentType.charAt(0).toUpperCase() +
            parsed.assessmentType.slice(1)}{' '}
          Assessment
        </h4>
      )}

      {/* Key Metrics */}
      {parsed.metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {parsed.metrics.map((metric, idx) => (
            <div key={idx} className="flex flex-col">
              <p className="text-xs text-gray-600 font-medium mb-1">
                {metric.label}
              </p>
              <div
                className={`${getMetricColor(metric.color)} rounded-lg px-3 py-2 text-center`}
              >
                <p className="text-lg font-bold">{metric.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status Summary */}
      {parsed.summary && (
        <p className="text-sm font-medium text-gray-900 mb-3">
          {parsed.summary}
        </p>
      )}

      {/* Details/Actions */}
      {parsed.details && parsed.details.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {parsed.details.map((detail, idx) => (
            <li
              key={idx}
              className="text-xs text-gray-700 flex items-start gap-2"
            >
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Full Response in Collapsible */}
      <details className="mt-3 cursor-pointer">
        <summary className="text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 px-2 -mx-2 rounded hover:bg-black/5">
          View full details
        </summary>
        <div className="mt-2 p-3 bg-white/50 rounded border border-gray-200 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
          {parsed.rawResponse}
        </div>
      </details>
    </div>
  );
};
