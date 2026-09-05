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
}

const parseOutcome = (response: string): ParsedOutcome => {
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

  // Extract candidate patients count
  const candidateMatch = response.match(/(\d+)\s+candidate\s+patients/i);
  if (candidateMatch) {
    metrics.push({
      label: 'Candidate Patients',
      value: candidateMatch[1],
      color: 'blue',
    });
  }

  // Extract recent HbA1c count
  const recentHbA1cMatch = response.match(
    /candidatesWithRecentHbA1c\s*[=:]\s*(\d+)|already have a (?:recent|qualifying) HbA1c.*?[:\s](\d+)/is,
  );
  if (recentHbA1cMatch) {
    const count = recentHbA1cMatch[1] || recentHbA1cMatch[2] || '0';
    metrics.push({
      label: 'With Recent HbA1c',
      value: count,
      color: 'green',
    });
  }

  // Extract care-gap cohort count
  const gapCohortMatch = response.match(/gapCohort.*?[=:]\s*(\d+)\s*patients/i);
  if (gapCohortMatch) {
    const count = parseInt(gapCohortMatch[1]);
    metrics.push({
      label: 'Care-Gap Cohort',
      value: count,
      color: count === 0 ? 'green' : 'amber',
    });

    // Determine status based on cohort
    if (count === 0) {
      status = 'success';
      summary = 'All patients are up-to-date with HbA1c testing';
    } else {
      status = 'warning';
      summary = `${count} patient${count !== 1 ? 's' : ''} need HbA1c testing`;
    }
  }

  // Extract generated care plans count
  const carePlansMatch = response.match(
    /(\d+)\s*care.?plans?\s*(?:were\s+)?(?:generated|drafted)/i,
  );
  if (carePlansMatch) {
    metrics.push({
      label: 'Care Plans Generated',
      value: carePlansMatch[1],
      color: carePlansMatch[1] === '0' ? 'gray' : 'blue',
    });
  }

  // Extract key details
  if (response.includes('no action needed')) {
    details.push('✓ No action required at this time');
  }
  if (response.includes('care plans')) {
    details.push('Care plans were reviewed and approved');
  }
  if (response.includes('drafted')) {
    details.push('Care plans were generated for review');
  }

  return {
    assessmentType,
    cohortCriteria,
    metrics,
    status,
    summary,
    details,
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
          {response}
        </div>
      </details>
    </div>
  );
};
