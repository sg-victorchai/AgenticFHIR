import { getAuthenticatedHeaders } from './auth/oidc';
import { extractOperationOutcomeText } from '../utils/fhirError';

export interface HarmonizerReviewRecord {
  recordId: string;
  resourceType: string;
  resourceId?: string;
  resource?: Record<string, unknown>;
  status?: string;
  outcome?: string;
  confidence?: number;
  evidence?: string | string[];
  dedup?: Record<string, unknown>;
  terminology?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HarmonizerReviewResponse {
  jobId?: string;
  status?: string;
  records?: HarmonizerReviewRecord[];
  items?: HarmonizerReviewRecord[];
  review?: HarmonizerReviewRecord[];
}

export interface HarmonizerPendingMission {
  missionId: string;
  status?: string;
  review?: Record<string, unknown>;
  interventionId?: string;
  counts?: Record<string, number>;
  submittedAt?: string;
  createdAt?: string;
  links?: Record<string, string>;
}

const reviewUrl = (baseUrl: string, jobId: string, operation: string) =>
  `${baseUrl}/api/persona/DataPipelinePersona/clinical-docs-harmonizer/${operation}?job=${encodeURIComponent(jobId)}`;

const parseResponse = async (response: Response): Promise<any> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      extractOperationOutcomeText(payload) ||
        payload?.message ||
        payload?.error ||
        `Harmonizer review request failed (${response.status})`,
    );
  }
  return payload;
};

export const createHarmonizerReviewService = (baseUrl: string) => ({
  async getPendingMissions(): Promise<HarmonizerPendingMission[]> {
    const headers = await getAuthenticatedHeaders();
    const url = `${baseUrl}/api/persona/DataPipelinePersona/clinical-docs-harmonizer/$missions?status=awaiting_review&submittedBy=me&_count=100&_offset=0`;
    const payload = await parseResponse(await fetch(url, { headers }));
    return payload.missions || payload.items || payload.data || [];
  },

  async getReview(
    jobId: string,
  ): Promise<{ data: HarmonizerReviewResponse; etag?: string }> {
    const headers = await getAuthenticatedHeaders();
    const response = await fetch(reviewUrl(baseUrl, jobId, '$review'), {
      headers,
    });
    return {
      data: await parseResponse(response),
      etag: response.headers.get('ETag') || undefined,
    };
  },

  async updateRecord(
    jobId: string,
    recordId: string,
    resource: Record<string, unknown>,
    etag?: string,
  ) {
    const headers: Record<string, string> = {
      ...(await getAuthenticatedHeaders({
        'Content-Type': 'application/json',
      })),
    };
    if (etag) headers['If-Match'] = etag;
    return parseResponse(
      await fetch(
        `${reviewUrl(baseUrl, jobId, '$review-record')}&record=${encodeURIComponent(recordId)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(resource),
        },
      ),
    );
  },

  async approve(jobId: string, notes: string, etag?: string) {
    const headers: Record<string, string> = {
      ...(await getAuthenticatedHeaders({
        'Content-Type': 'application/json',
      })),
    };
    if (etag) headers['If-Match'] = etag;
    return parseResponse(
      await fetch(reviewUrl(baseUrl, jobId, '$approve'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes }),
      }),
    );
  },

  async reject(
    jobId: string,
    mode: 'REVISE' | 'DISCARD',
    instructions: string,
    etag?: string,
  ) {
    const headers: Record<string, string> = {
      ...(await getAuthenticatedHeaders({
        'Content-Type': 'application/json',
      })),
    };
    if (etag) headers['If-Match'] = etag;
    return parseResponse(
      await fetch(reviewUrl(baseUrl, jobId, '$reject'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode, instructions }),
      }),
    );
  },
});
