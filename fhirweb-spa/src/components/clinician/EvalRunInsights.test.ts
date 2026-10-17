import { describe, expect, it } from 'vitest';
import { parseQualityDimensions, parseReplayTrace } from './EvalRunInsights';

describe('eval run parsing', () => {
  it('parses quality dimensions from a JSON string with explanations', () => {
    const parsed = parseQualityDimensions(
      '{"dataAccuracy":0,"responseQuality":0.65,"responseQualityExplanation":"Partial."}',
    );
    expect(parsed?.responseQuality).toBe(0.65);
    expect(parsed?.responseQualityExplanation).toBe('Partial.');
    expect(parseQualityDimensions('not json')).toBeNull();
  });

  it('parses a flat replay trace array and tolerates a wrapped object', () => {
    const step = {
      stepNumber: 1,
      stepType: 'FHIR_QUERY',
      toolName: 'fhir_query',
    };
    expect(parseReplayTrace(JSON.stringify([step]))).toEqual([step]);
    expect(parseReplayTrace({ steps: [step] })).toEqual([step]);
    expect(parseReplayTrace(null)).toBeNull();
  });
});
