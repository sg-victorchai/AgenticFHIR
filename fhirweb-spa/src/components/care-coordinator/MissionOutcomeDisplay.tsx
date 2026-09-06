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

  // Extract assessment type
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
    // Validate that the count is reasonable (should be less than or equal to candidates)
    // and not a year like 1966 from dates
    const numValue = parseInt(count);
    if (numValue > 0 && numValue < 500) {
      // Avoid matching years from dates and skip 0 values
      metrics.push({
        label: 'With Recent HbA1c',
        value: count,
        color: 'green',
      });
    }
  }

  // Extract care-gap cohort count - multiple patterns
  // Look for "4 in the final care-gap cohort" or "finalCohortSize": 4 or other formats
  const gapCohortMatch =
    response.match(/(\d+)\s+in\s+the\s+final\s+care-gap\s+cohort/i) ||
    response.match(/(?:Final\s+)?care-gap\s+cohort[^:]*:\s*(\d+)/i) ||
    response.match(/finalCohort[^:]*[":]*\s*[=:]\s*(\d+)/i) ||
    response.match(/"finalCohortSize"\s*:\s*(\d+)/i) ||
    response.match(/finalCohort.*?[=:]\s*(\d+)/i) ||
    response.match(/gapCohort.*?[=:]\s*(\d+)\s*patients/i);

  if (gapCohortMatch) {
    const count = parseInt(gapCohortMatch[1] || '0');
    // Validate that the count is reasonable (should be < 500 to avoid matching years like 1966)
    if (count > 0 && count < 500) {
      metrics.push({
        label: 'Care-Gap Cohort',
        value: count,
        color: 'amber',
      });

      // Determine status based on cohort
      status = 'warning';
      summary = `${count} patient${count !== 1 ? 's' : ''} identified for HbA1c testing gap`;
    }
  }

  // Extract generated care plans count - multiple patterns
  const carePlansMatch =
    response.match(/(?:Drafted|Generated)\s+(\d+)\s+CarePlan/i) ||
    response.match(/(\d+)\s*care.?plans?\s*(?:were\s+)?(?:generated|drafted)/i);
  if (carePlansMatch) {
    metrics.push({
      label: 'Care Plans Generated',
      value: carePlansMatch[1],
      color: carePlansMatch[1] === '0' ? 'gray' : 'blue',
    });
  }

  // Extract existing plans excluded - be specific to avoid matching dates
  // Look for "0 of 4 gap-cohort" (number BEFORE the phrase)
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
      // Avoid matching years from dates
      metrics.push({
        label: 'Existing Plans',
        value: count,
        color: 'gray',
      });
    }
  }

  // Extract key details
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
  if (response.includes('disclaimer') || response.includes('clinical review')) {
    details.push('⚠️  Requires clinical review before action');
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
