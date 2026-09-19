import React from 'react';
import { createPortal } from 'react-dom';
import {
  AgentResponse,
  GroundingEvidence,
  ReasoningTraceStep,
  ResponseType,
  RiskFlag,
} from '../../types/agent';
import { useLazyGetResourceByIdQuery } from '../../services/fhir/client';

interface AgentResponseFormatterProps {
  response: AgentResponse;
  compact?: boolean; // Minimal mode (hide metadata)
}

/**
 * AgentResponseFormatter
 *
 * Generically renders any agent response type:
 * - Text/markdown responses with proper formatting
 * - Structured JSON as tables or key-value pairs
 * - Metadata (confidence, sources, disclaimers, cost)
 * - Risk flags with severity indicators
 *
 * Auto-detects response structure and adapts rendering accordingly.
 * No assumptions about response format; works with any agent persona.
 */
export const AgentResponseFormatter: React.FC<AgentResponseFormatterProps> = ({
  response,
  compact = false,
}) => {
  const responseType = detectResponseType(response.text);

  const renderResponseContent = () => {
    switch (responseType) {
      case 'json':
        return <JsonResponseRenderer text={response.text} />;

      case 'markdown':
        return <MarkdownResponseRenderer text={response.text} />;

      case 'table':
        return <TableResponseRenderer text={response.text} />;

      case 'error':
        return (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {response.text}
          </div>
        );

      case 'text':
      default:
        return <PlainTextResponseRenderer text={response.text} />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Main response content */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {renderResponseContent()}
      </div>

      {/* Risk flags (if any) */}
      {response.riskFlags && response.riskFlags.length > 0 && (
        <div className="space-y-2">
          {response.riskFlags.map((flag, idx) => (
            <RiskFlagRenderer key={idx} flag={flag} />
          ))}
        </div>
      )}

      {/* Metadata section (confidence, sources, cost, time) */}
      {!compact && (
        <ResponseMetadata
          confidence={response.confidence}
          sources={response.sources}
          disclaimer={response.disclaimer}
          executionTimeMs={response.executionTimeMs}
          tokensUsed={response.tokensUsed}
          costBreakdown={response.costBreakdown}
        />
      )}

      <GroundingEvidenceRenderer evidence={response.groundingEvidence || []} />

      <ReasoningTraceRenderer steps={response.reasoningTrace || []} />
    </div>
  );
};

const GroundingEvidenceRenderer: React.FC<{
  evidence: GroundingEvidence[];
}> = ({ evidence }) => {
  const [selectedResource, setSelectedResource] = React.useState<{
    resourceType: string;
    resourceId: string;
  } | null>(null);
  const [fetchResource, resourceQuery] = useLazyGetResourceByIdQuery();

  const openResource = (item: GroundingEvidence) => {
    if (!item.resourceId) return;
    const selection = {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
    };
    setSelectedResource(selection);
    void fetchResource({
      resourceType: selection.resourceType,
      id: selection.resourceId,
      summary: true,
    });
  };

  return (
    <>
      <details className="rounded-lg border border-emerald-200 bg-emerald-50/60">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-emerald-900">
          Grounding Evidence ({evidence.length})
        </summary>
        <div className="space-y-2 border-t border-emerald-200 px-3 py-3">
          {evidence.length === 0 && (
            <p className="text-xs text-gray-600">
              No grounding evidence was provided for this response.
            </p>
          )}
          {evidence.map((item, index) => (
            <div
              key={`${item.resourceType}-${item.resourceId || index}-${item.field}`}
              className="rounded border border-emerald-100 bg-white px-3 py-2"
            >
              <p className="text-sm font-medium text-gray-900">{item.claim}</p>
              <p className="mt-1 text-xs text-gray-600">
                {item.resourceId ? (
                  <button
                    type="button"
                    onClick={() => openResource(item)}
                    className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900"
                    title={`View summary of ${item.resourceType}/${item.resourceId}`}
                  >
                    {item.resourceType}/{item.resourceId}
                  </button>
                ) : (
                  item.resourceType
                )}{' '}
                · {item.field}: {item.value}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {[item.system, item.code, `Source: ${item.toolCall}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </details>

      {selectedResource && (
        <ResourceSummaryDialog
          resourceType={selectedResource.resourceType}
          resourceId={selectedResource.resourceId}
          resource={resourceQuery.data}
          isLoading={resourceQuery.isFetching}
          hasError={resourceQuery.isError}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </>
  );
};

const formatFieldLabel = (field: string) =>
  field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());

const formatDate = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        ...(value.includes('T') ? { timeStyle: 'short' as const } : {}),
      });
};

const getConceptText = (concept: any): string =>
  concept?.text ||
  concept?.coding?.find((coding: any) => coding.display)?.display ||
  concept?.coding?.[0]?.code ||
  '';

const formatHumanValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map(formatHumanValue)
      .filter((item) => item !== '—')
      .join('; ');
  }

  const objectValue = value as Record<string, any>;
  const conceptText = getConceptText(objectValue);
  if (conceptText) return conceptText;
  if (objectValue.value !== undefined) {
    return `${objectValue.value}${objectValue.unit ? ` ${objectValue.unit}` : ''}`;
  }
  if (objectValue.display || objectValue.reference) {
    return objectValue.display || objectValue.reference;
  }
  if (objectValue.start || objectValue.end) {
    return [formatDate(objectValue.start), formatDate(objectValue.end)]
      .filter((item) => item !== '—')
      .join(' to ');
  }

  return Object.entries(objectValue)
    .filter(([field]) => !['id', 'extension'].includes(field))
    .map(
      ([field, nestedValue]) =>
        `${formatFieldLabel(field)}: ${formatHumanValue(nestedValue)}`,
    )
    .join(' · ');
};

const SummaryRow: React.FC<{ label: string; value: unknown }> = ({
  label,
  value,
}) => {
  const displayValue = formatHumanValue(value);
  if (!displayValue || displayValue === '—') return null;
  return (
    <div className="grid gap-1 border-b border-gray-100 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-gray-800">
        {displayValue}
      </dd>
    </div>
  );
};

const StatusBadge: React.FC<{ value?: string }> = ({ value }) => {
  if (!value) return null;
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">
      {value.replace(/-/g, ' ')}
    </span>
  );
};

const ConditionSummary: React.FC<{ condition: any }> = ({ condition }) => {
  const clinicalStatus = getConceptText(condition.clinicalStatus);
  const verificationStatus = getConceptText(condition.verificationStatus);
  return (
    <div>
      <div className="border-b border-gray-200 pb-4">
        <p className="text-lg font-semibold text-gray-900">
          {getConceptText(condition.code) || 'Condition'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge value={clinicalStatus} />
          {verificationStatus && verificationStatus !== clinicalStatus && (
            <StatusBadge value={verificationStatus} />
          )}
        </div>
      </div>
      <dl>
        <SummaryRow label="Severity" value={condition.severity} />
        <SummaryRow label="Category" value={condition.category} />
        <SummaryRow
          label="Onset"
          value={
            condition.onsetDateTime ||
            condition.onsetPeriod ||
            condition.onsetString
          }
        />
        <SummaryRow
          label="Recorded"
          value={formatDate(condition.recordedDate)}
        />
        <SummaryRow label="Body site" value={condition.bodySite} />
        <SummaryRow label="Notes" value={condition.note} />
      </dl>
    </div>
  );
};

const getObservationValue = (observation: any): string => {
  if (observation.valueQuantity) {
    return formatHumanValue(observation.valueQuantity);
  }
  return (
    observation.valueString ||
    getConceptText(observation.valueCodeableConcept) ||
    (observation.component?.length
      ? `${observation.component.length} measured values`
      : '—')
  );
};

const formatReferenceRange = (ranges?: any[]): string => {
  if (!ranges?.length) return '—';
  return ranges
    .map((range) => {
      if (range.text) return range.text;
      const low = range.low ? formatHumanValue(range.low) : '';
      const high = range.high ? formatHumanValue(range.high) : '';
      return [low, high].filter(Boolean).join(' to ');
    })
    .filter(Boolean)
    .join('; ');
};

const ObservationSummary: React.FC<{ observation: any }> = ({
  observation,
}) => (
  <div>
    <div className="border-b border-gray-200 pb-4">
      <p className="text-sm font-medium text-gray-600">
        {getConceptText(observation.code) || 'Observation'}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {getObservationValue(observation)}
      </p>
      <div className="mt-2">
        <StatusBadge value={observation.status} />
      </div>
    </div>
    <dl>
      <SummaryRow
        label="Date"
        value={formatDate(observation.effectiveDateTime || observation.issued)}
      />
      <SummaryRow label="Category" value={observation.category} />
      <SummaryRow label="Interpretation" value={observation.interpretation} />
      <SummaryRow
        label="Reference range"
        value={formatReferenceRange(observation.referenceRange)}
      />
      <SummaryRow label="Measured values" value={observation.component} />
      <SummaryRow label="Notes" value={observation.note} />
    </dl>
  </div>
);

const GenericResourceSummary: React.FC<{ resource: any }> = ({ resource }) => {
  const fields = Object.entries(resource).filter(
    ([field]) =>
      !['resourceType', 'id', 'meta', 'text', 'contained'].includes(field),
  );
  return (
    <dl>
      {fields.map(([field, value]) => (
        <SummaryRow key={field} label={formatFieldLabel(field)} value={value} />
      ))}
    </dl>
  );
};

const ResourceSummaryContent: React.FC<{ resource: any }> = ({ resource }) => {
  if (resource.resourceType === 'Condition') {
    return <ConditionSummary condition={resource} />;
  }
  if (resource.resourceType === 'Observation') {
    return <ObservationSummary observation={resource} />;
  }
  return <GenericResourceSummary resource={resource} />;
};

const ResourceSummaryDialog: React.FC<{
  resourceType: string;
  resourceId: string;
  resource?: object;
  isLoading: boolean;
  hasError: boolean;
  onClose: () => void;
}> = ({ resourceType, resourceId, resource, isLoading, hasError, onClose }) => {
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-summary-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:max-h-[85vh] sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2
              id="resource-summary-title"
              className="text-base font-semibold text-gray-900"
            >
              {resourceType} Summary
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">
              {resourceType}/{resourceId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-2xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 sm:h-8 sm:w-8 sm:text-xl"
            aria-label="Close resource summary"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overscroll-contain overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          {isLoading ? (
            <p className="text-sm text-gray-600">Loading resource summary…</p>
          ) : hasError ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Unable to load this resource summary.
            </p>
          ) : resource ? (
            <ResourceSummaryContent resource={resource} />
          ) : (
            <p className="text-sm text-gray-600">
              No summary fields were returned for this resource.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ReasoningTraceRenderer: React.FC<{ steps: ReasoningTraceStep[] }> = ({
  steps,
}) => (
  <details className="rounded-lg border border-indigo-200 bg-indigo-50/60">
    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-indigo-900">
      Reasoning Trace ({steps.length} steps)
    </summary>
    <ol className="space-y-3 border-t border-indigo-200 px-3 py-3">
      {steps.length === 0 && (
        <li className="text-xs text-gray-600">
          No reasoning trace was provided for this response.
        </li>
      )}
      {steps.map((step, index) => (
        <li key={`${step.iteration}-${index}`} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {step.iteration + 1}
          </span>
          <div className="min-w-0">
            <p className="whitespace-pre-wrap text-sm text-gray-800">
              {step.thought}
            </p>
            {step.toolsCalled && (
              <p className="mt-1 break-words font-mono text-xs text-indigo-700">
                {step.toolsCalled}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  </details>
);

/**
 * Detect response type by analyzing content structure
 */
function detectResponseType(text: string): ResponseType {
  if (!text) return 'text';

  const trimmed = text.trim();

  // Detect JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Detect markdown (headers, bold/italic, lists)
  if (/^#+\s|__|\*\*|\*|^\-\s|^\d+\./m.test(trimmed)) {
    return 'markdown';
  }

  // Detect table-like content (pipes, dashes)
  if (/^\|.*\|$/m.test(trimmed)) {
    return 'table';
  }

  // Detect error patterns
  if (/^(error|error:|failed|exception)/i.test(trimmed)) {
    return 'error';
  }

  return 'text';
}

/**
 * Plain text renderer
 */
const PlainTextResponseRenderer: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
    {text}
  </p>
);

/**
 * JSON renderer - detects structure and renders as table, key-value pairs, or formatted JSON
 */
const JsonResponseRenderer: React.FC<{ text: string }> = ({ text }) => {
  try {
    const data = JSON.parse(text);

    // Array of objects → render as table
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      return <JsonTableRenderer data={data} />;
    }

    // Object → render as key-value pairs
    if (typeof data === 'object' && !Array.isArray(data)) {
      return <JsonObjectRenderer data={data} />;
    }

    // Fallback: render as formatted JSON
    return (
      <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  } catch {
    // If parsing fails, treat as text
    return <PlainTextResponseRenderer text={text} />;
  }
};

/**
 * JSON table renderer
 */
const JsonTableRenderer: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data.length) return <p className="text-xs text-gray-500">Empty data</p>;

  const columns = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border border-gray-200">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-medium text-gray-700"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              {columns.map((col) => (
                <td
                  key={`${rowIdx}-${col}`}
                  className="px-3 py-2 text-gray-700"
                >
                  {String(row[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * JSON object renderer - displays as key-value pairs
 */
const JsonObjectRenderer: React.FC<{ data: Record<string, any> }> = ({
  data,
}) => (
  <div className="space-y-2">
    {Object.entries(data).map(([key, value]) => (
      <div key={key} className="flex gap-2">
        <span className="font-medium text-gray-700 min-w-[130px]">{key}:</span>
        <span className="text-gray-800">
          {typeof value === 'object'
            ? JSON.stringify(value)
            : String(value ?? '—')}
        </span>
      </div>
    ))}
  </div>
);

/**
 * Markdown renderer (basic support)
 */
const MarkdownResponseRenderer: React.FC<{ text: string }> = ({ text }) => (
  <div className="prose prose-sm max-w-none">
    <div className="text-sm text-gray-800 space-y-2">
      {text.split('\n').map((line, idx) => {
        // Headers
        if (line.startsWith('###')) {
          return (
            <h4 key={idx} className="font-bold text-gray-900 mt-2">
              {line.replace(/^#+\s/, '')}
            </h4>
          );
        }
        if (line.startsWith('##')) {
          return (
            <h3 key={idx} className="font-bold text-gray-900 mt-2">
              {line.replace(/^#+\s/, '')}
            </h3>
          );
        }
        if (line.startsWith('#')) {
          return (
            <h2 key={idx} className="font-bold text-lg text-gray-900 mt-2">
              {line.replace(/^#+\s/, '')}
            </h2>
          );
        }

        // Lists
        if (line.match(/^\s*[-*]\s/)) {
          return (
            <li key={idx} className="ml-4 text-gray-800">
              {line.replace(/^\s*[-*]\s/, '')}
            </li>
          );
        }

        // Regular paragraph
        if (line.trim()) {
          return (
            <p key={idx} className="text-gray-800 leading-relaxed">
              {line}
            </p>
          );
        }

        return <br key={idx} />;
      })}
    </div>
  </div>
);

/**
 * Table renderer for table-formatted content
 */
const TableResponseRenderer: React.FC<{ text: string }> = ({ text }) => (
  <div className="overflow-x-auto">
    <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2">
      {text}
    </pre>
  </div>
);

/**
 * Risk flag renderer
 */
const RiskFlagRenderer: React.FC<{ flag: RiskFlag }> = ({ flag }) => {
  const bgColorByServerity = {
    INFO: 'bg-blue-50 border-blue-200',
    WARNING: 'bg-amber-50 border-amber-200',
    ERROR: 'bg-red-50 border-red-200',
    CRITICAL: 'bg-red-100 border-red-400',
  };

  const textColorBySeverity = {
    INFO: 'text-blue-800',
    WARNING: 'text-amber-800',
    ERROR: 'text-red-800',
    CRITICAL: 'text-red-900',
  };

  const badgeColorBySeverity = {
    INFO: 'bg-blue-100 text-blue-800',
    WARNING: 'bg-amber-100 text-amber-800',
    ERROR: 'bg-red-100 text-red-800',
    CRITICAL: 'bg-red-200 text-red-900',
  };

  return (
    <div
      className={`border rounded px-3 py-2 text-xs ${bgColorByServerity[flag.severity]}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`px-2 py-0.5 rounded font-semibold ${badgeColorBySeverity[flag.severity]}`}
        >
          {flag.severity}
        </span>
        <div className={`flex-1 ${textColorBySeverity[flag.severity]}`}>
          <p className="font-medium">{flag.message}</p>
          {flag.remediation && (
            <p className="mt-1 opacity-90">💡 {flag.remediation}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Response metadata (confidence, sources, disclaimer, cost)
 */
const ResponseMetadata: React.FC<{
  confidence: number;
  sources: any[];
  disclaimer?: string;
  executionTimeMs?: number;
  tokensUsed?: number;
  costBreakdown?: any;
}> = ({
  confidence,
  sources,
  disclaimer,
  executionTimeMs,
  tokensUsed,
  costBreakdown,
}) => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
    {/* Confidence and metrics */}
    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
      <span>✓ Confidence: {(confidence * 100).toFixed(0)}%</span>
      {executionTimeMs && <span>⏱ Time: {executionTimeMs}ms</span>}
      {tokensUsed && <span>📝 Tokens: {tokensUsed}</span>}
      {costBreakdown && (
        <span>💰 Cost: ${costBreakdown.costUsd?.toFixed(4)}</span>
      )}
    </div>

    {/* Sources */}
    {sources && sources.length > 0 && (
      <details className="cursor-pointer">
        <summary className="text-xs font-medium text-gray-700 hover:text-gray-900">
          📎 Based on {sources.length} source(s)
        </summary>
        <ul className="mt-2 ml-4 space-y-1 text-xs text-gray-600">
          {sources.map((src, idx) => (
            <li key={idx}>{src.display || `${src.resourceType}/${src.id}`}</li>
          ))}
        </ul>
      </details>
    )}

    {/* Disclaimer */}
    {disclaimer && (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        ⚠️ {disclaimer}
      </p>
    )}
  </div>
);

export default AgentResponseFormatter;
