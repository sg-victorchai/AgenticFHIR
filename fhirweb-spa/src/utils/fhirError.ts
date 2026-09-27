// Extracts a human-readable message from a FHIR OperationOutcome error payload.

interface OperationOutcomeIssue {
  severity?: string;
  code?: string;
  diagnostics?: string;
  details?: { text?: string };
}

interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue?: OperationOutcomeIssue[];
}

const isOperationOutcome = (data: unknown): data is OperationOutcome =>
  !!data &&
  typeof data === 'object' &&
  (data as Record<string, unknown>).resourceType === 'OperationOutcome';

/**
 * Returns the joined issue diagnostics if `payload` is itself an
 * OperationOutcome resource (e.g. a parsed fetch response body), else null.
 */
export function extractOperationOutcomeText(payload: unknown): string | null {
  if (!isOperationOutcome(payload) || !payload.issue?.length) return null;
  return (
    payload.issue
      .map((issue) => issue.diagnostics || issue.details?.text)
      .filter(Boolean)
      .join(' ') || null
  );
}

/**
 * Returns the backend's OperationOutcome diagnostics (e.g. a 403 access-denied
 * reason) if present on an error, otherwise null.
 *
 * Checked defensively in multiple shapes since the payload location differs
 * by call path: RTK Query errors expose it at `error.data`, while raw
 * fhir-kit-client throws nest it at `error.response.data` — and the backend
 * is not guaranteed to always include an OperationOutcome at all.
 */
export function getOperationOutcomeMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const candidates = [
    (error as { data?: unknown }).data,
    (error as { response?: { data?: unknown } }).response?.data,
  ];

  for (const data of candidates) {
    if (!isOperationOutcome(data) || !data.issue?.length) continue;
    const message = data.issue
      .map((issue) => issue.diagnostics || issue.details?.text)
      .filter(Boolean)
      .join(' ');
    if (message) return message;
  }

  return null;
}
