import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentBuilderService,
  normalizeSeedStatus,
} from './agentBuilderService';

vi.mock('./auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(async (headers) => headers),
}));

const mockStream = (chunks: string[]) => {
  const encoder = new TextEncoder();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        },
      }),
    })),
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('persisted evaluation data endpoints', () => {
  it('searches terminology using encoded query and resource type', async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify([
            {
              displayName: 'Metoprolol',
              primaryCode: '866427',
              primarySystem: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            },
          ]),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await agentBuilderService.searchTerminology(
      'metoprolol tartrate',
      'Medication',
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/terminology/search?q=metoprolol+tartrate&resourceType=Medication',
    );
    expect(result[0].primaryCode).toBe('866427');
  });
  it('requests resource-type pages with encoded IDs and pagination defaults', async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify({
            resourceType: 'Bundle',
            type: 'collection',
            total: 0,
            entry: [],
            _meta: { page: 0, pageSize: 50, totalPages: 0, hasNextPage: false },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.getSeededResources('job/id', 'Observation');
    await agentBuilderService.getSeededResources('job/id', 'Patient', 2, 100);
    expect(fetchMock.mock.calls[0][0]).toContain(
      '/eval/seed/job%2Fid/resources/Observation?page=0&size=50',
    );
    expect(fetchMock.mock.calls[1][0]).toContain(
      '/eval/seed/job%2Fid/resources/Patient?page=2&size=100',
    );
  });
  it.each([
    { Patient: 41, Condition: 20, Observation: 82 },
    '{"Patient":41,"Condition":20,"Observation":82}',
  ])('normalizes resource counts from backend payloads', (seededCounts) => {
    const normalized = normalizeSeedStatus({
      seedJobId: 'job',
      evalTenantId: 'tenant',
      seedStatus: 'COMPLETED',
      seededCounts,
    });
    expect(normalized.seededCounts).toEqual({
      Patient: 41,
      Condition: 20,
      Observation: 82,
    });
  });

  it('ignores malformed counts instead of rendering character-indexed entries', () => {
    expect(
      normalizeSeedStatus({
        seedJobId: 'job',
        evalTenantId: 'tenant',
        seedStatus: 'COMPLETED',
        seededCounts: 'invalid JSON',
      }).seededCounts,
    ).toBeUndefined();
  });

  it('normalizes both polled seed status and seed history responses', async () => {
    const payload = {
      seedJobId: 'job',
      evalTenantId: 'tenant',
      seedStatus: 'COMPLETED',
      seededCounts: '{"Patient":20,"Observation":10}',
      errorMessage: null,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
        .mockResolvedValueOnce(new Response(JSON.stringify([payload]))),
    );
    expect(
      (await agentBuilderService.getSeedStatus('job')).seededCounts,
    ).toEqual({ Patient: 20, Observation: 10 });
    expect(
      (await agentBuilderService.listSeedJobs('scenario'))[0].seededCounts,
    ).toEqual({ Patient: 20, Observation: 10 });
  });
  it('encodes scenario, job and patient IDs using authenticated GET requests', async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.listSeedJobs('scenario/id');
    await agentBuilderService.getSeededPatients('job/id');
    await agentBuilderService.getSeededPatientBundle('job/id', 'patient/id');
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('/eval/seed?scenarioId=scenario%2Fid'),
      expect.stringContaining('/eval/seed/job%2Fid/patients'),
      expect.stringContaining('/eval/seed/job%2Fid/patients/patient%2Fid'),
    ]);
  });
});

describe('authoring SSE steps', () => {
  it('keeps fragmented step events out of response tokens', async () => {
    mockStream([
      'event: token\ndata: Hello\n\nevent: st',
      'ep\ndata: P0_PROXY_',
      'QUESTIONS\n\nevent: done\ndata: \n\n',
    ]);
    const onToken = vi.fn();
    const onStep = vi.fn();
    await agentBuilderService.streamMessage(
      'session',
      'outcome',
      onToken,
      onStep,
    );
    expect(onToken).toHaveBeenCalledExactlyOnceWith('Hello');
    expect(onStep).toHaveBeenCalledExactlyOnceWith('P0_PROXY_QUESTIONS');
  });

  it('clears Phase 0 for an empty step event', async () => {
    mockStream(['event: step\r\ndata: \r\n\r\nevent: done\r\ndata: \r\n\r\n']);
    const onStep = vi.fn();
    await agentBuilderService.streamMessage(
      'session',
      'dynamic-agent',
      vi.fn(),
      onStep,
    );
    expect(onStep).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('does not change steps when an adaptation omits the event', async () => {
    mockStream(['event: token\ndata: Draft\n\nevent: done\ndata: \n\n']);
    const onStep = vi.fn();
    await agentBuilderService.streamMessage(
      'session',
      'adapt',
      vi.fn(),
      onStep,
    );
    expect(onStep).not.toHaveBeenCalled();
  });

  it('rejects streamed errors so the composer can display retry feedback', async () => {
    mockStream(['event: error\ndata: Please retry\n\n']);
    await expect(
      agentBuilderService.streamMessage('session', 'outcome', vi.fn()),
    ).rejects.toThrow('Please retry');
  });
});
