import React from 'react';
import { AgentResponse, ResponseType, RiskFlag } from '../../types/agent';

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
    </div>
  );
};

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
