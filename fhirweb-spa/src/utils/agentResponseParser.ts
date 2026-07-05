import { AgentResponse, RawAgentResponse, AgentSource } from '../types/agent';

/**
 * Agent Response Parser Utility
 *
 * Normalizes responses from any agent persona into a standard AgentResponse structure.
 * Uses text-first parsing strategy (robust to multiple response formats).
 */

/**
 * Parse a raw agent response into normalized AgentResponse structure
 */
export function parseAgentResponse(raw: RawAgentResponse): AgentResponse {
  if (!raw) {
    return {
      text: '',
      confidence: 0,
      sources: [],
    };
  }

  // Extract main response text
  const text = raw.text || '';

  // Extract metadata from headers or HTTP response
  const confidence = extractConfidence(raw);
  const sources = extractSources(raw);
  const disclaimer = extractDisclaimer(raw);
  const executionTimeMs = extractExecutionTime(raw);
  const tokensUsed = extractTokensUsed(raw);
  const costBreakdown = extractCostBreakdown(raw);
  const riskFlags = extractRiskFlags(raw);

  return {
    text,
    confidence,
    sources,
    disclaimer,
    executionTimeMs,
    tokensUsed,
    costBreakdown,
    riskFlags,
  };
}

/**
 * Extract mission ID from various locations
 */
export function extractMissionId(raw: RawAgentResponse): string | null {
  if (!raw) return null;

  // Try headers first (common header names)
  if (raw.headers) {
    for (const key of [
      'x-mission-id',
      'X-Mission-ID',
      'x-execution-id',
      'X-Execution-ID',
    ]) {
      if (raw.headers[key]) {
        return raw.headers[key];
      }
    }
  }

  // Try metadata
  if (raw.metadata) {
    if (typeof raw.metadata.missionId === 'string') {
      return raw.metadata.missionId;
    }
    if (typeof raw.metadata.executionId === 'string') {
      return raw.metadata.executionId;
    }
    if (typeof raw.metadata.id === 'string') {
      return raw.metadata.id;
    }
  }

  // Try extracting from Location header (e.g., "/api/agent/AgentMission/mission-xyz")
  if (raw.headers?.location) {
    const match = raw.headers.location.match(/AgentMission\/([^/?#]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract confidence score (0.0-1.0)
 */
function extractConfidence(raw: RawAgentResponse): number {
  if (!raw.metadata) return 0.5;

  // Try explicit confidence field
  if (typeof raw.metadata.confidence === 'number') {
    const conf = raw.metadata.confidence;
    return conf >= 0 && conf <= 1 ? conf : 0.5;
  }

  // Try percentage formatting (0-100)
  if (typeof raw.metadata.confidence === 'string') {
    const parsed = parseFloat(raw.metadata.confidence);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed / 100;
    }
  }

  // Default to moderate confidence if not specified
  return 0.5;
}

/**
 * Extract source references (FHIR resources, URLs, etc.)
 */
function extractSources(raw: RawAgentResponse): AgentSource[] {
  if (!raw.metadata?.sources) return [];

  const sources = raw.metadata.sources;

  // If already an array of source objects, use as-is
  if (Array.isArray(sources)) {
    return sources.map((src) => {
      if (typeof src === 'string') {
        // Parse "Observation/obs-123" format
        const [resourceType, id] = src.split('/');
        return { resourceType, id };
      }
      // Assume it's already a source object
      return src as AgentSource;
    });
  }

  // If single source
  if (typeof sources === 'object') {
    return [sources as AgentSource];
  }

  return [];
}

/**
 * Extract medical/legal disclaimer
 */
function extractDisclaimer(raw: RawAgentResponse): string | undefined {
  return raw.metadata?.disclaimer || raw.headers?.['x-disclaimer'] || undefined;
}

/**
 * Extract execution time in milliseconds
 */
function extractExecutionTime(raw: RawAgentResponse): number | undefined {
  const meta = raw.metadata;
  if (!meta) return undefined;

  if (typeof meta.executionTimeMs === 'number') {
    return meta.executionTimeMs;
  }

  if (typeof meta.duration === 'number') {
    return meta.duration;
  }

  if (typeof meta.processingTimeMs === 'number') {
    return meta.processingTimeMs;
  }

  return undefined;
}

/**
 * Extract LLM tokens used
 */
function extractTokensUsed(raw: RawAgentResponse): number | undefined {
  const meta = raw.metadata;
  if (!meta) return undefined;

  if (typeof meta.tokensUsed === 'number') {
    return meta.tokensUsed;
  }

  if (typeof meta.tokens === 'number') {
    return meta.tokens;
  }

  return undefined;
}

/**
 * Extract cost breakdown if available
 */
function extractCostBreakdown(raw: RawAgentResponse): any | undefined {
  const meta = raw.metadata;
  if (!meta?.costBreakdown) return undefined;

  return {
    provider: meta.costBreakdown.provider || 'unknown',
    model: meta.costBreakdown.model || 'unknown',
    inputTokens: meta.costBreakdown.inputTokens,
    outputTokens: meta.costBreakdown.outputTokens,
    costUsd: meta.costBreakdown.costUsd,
  };
}

/**
 * Extract risk flags (data quality issues, safety concerns)
 */
function extractRiskFlags(raw: RawAgentResponse): any[] {
  const meta = raw.metadata;
  if (!meta?.riskFlags) return [];

  if (!Array.isArray(meta.riskFlags)) return [];

  return meta.riskFlags.map((flag) => ({
    type: flag.type || 'UNKNOWN',
    severity: flag.severity || 'WARNING',
    message: flag.message || 'Unknown issue',
    remediation: flag.remediation,
  }));
}

/**
 * Parse a Digital Twin specific response (contains JSON in text field)
 *
 * Digital Twin may return:
 * - Plain text explanation
 * - JSON with structured response
 * - Mixed markdown + metadata
 */
export function parseDigitalTwinResponse(raw: RawAgentResponse): AgentResponse {
  if (!raw.text) {
    return parseAgentResponse(raw);
  }

  // Try to extract JSON from text field
  const jsonMatch = raw.text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);

      // If JSON has response field, use that
      if (parsed.response) {
        return {
          text: parsed.response,
          confidence: parsed.confidence || 0.8,
          sources: parsed.sources || [],
          disclaimer: parsed.disclaimer,
          executionTimeMs: parsed.executionTimeMs,
          tokensUsed: parsed.tokensUsed,
          costBreakdown: parsed.costBreakdown,
          riskFlags: parsed.riskFlags,
        };
      }

      // Otherwise treat entire JSON as response
      return parseAgentResponse({
        ...raw,
        metadata: { ...raw.metadata, ...parsed },
      });
    } catch {
      // If JSON parse fails, fall back to text
    }
  }

  // No JSON found, use text-first parsing
  return parseAgentResponse(raw);
}

/**
 * Parse response from a generic HTTP API response
 */
export function parseHttpResponse(
  status: number,
  responseText: string,
  headers?: Record<string, string>,
): AgentResponse {
  if (status >= 400) {
    return {
      text: `Error ${status}: ${responseText || 'Request failed'}`,
      confidence: 0,
      sources: [],
    };
  }

  // Try JSON first
  let metadata: any = {};
  try {
    const json = JSON.parse(responseText);
    if (typeof json === 'object') {
      metadata = json;
    }
  } catch {
    // Not JSON, will parse as raw text
  }

  return parseAgentResponse({
    text: typeof metadata === 'string' ? metadata : responseText,
    headers,
    metadata,
  });
}
