import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDataAssets } from './fhir/dataAssetsService';
import {
  agentBuilderService,
  normalizeSeedStatus,
} from './agentBuilderService';

vi.mock('./auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(async (headers) => headers),
}));
vi.mock('./fhir/dataAssetsService', () => ({ listDataAssets: vi.fn() }));
beforeEach(() => vi.mocked(listDataAssets).mockReset().mockResolvedValue([]));

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
  it('includes Observation code declared by the Data Assets capability source', async () => {
    vi.mocked(listDataAssets).mockResolvedValue([
      {
        type: 'Observation',
        searchParam: [
          { name: 'code', documentation: 'Observation coding' },
          { name: 'status' },
        ],
      },
      { type: 'Patient', searchParam: [{ name: 'birthdate' }] },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              entry: [
                {
                  resource: { resourceType: 'SearchParameter', code: 'status' },
                },
              ],
            }),
          ),
      ),
    );
    expect(
      await agentBuilderService.getSearchParameters('Observation'),
    ).toEqual([
      { code: 'code', description: 'Observation coding' },
      { code: 'status', description: undefined },
    ]);
  });

  it('uses capability parameters if the SearchParameter request fails', async () => {
    vi.mocked(listDataAssets).mockResolvedValue([
      { type: 'Observation', searchParam: [{ name: 'code' }] },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    expect(
      await agentBuilderService.getSearchParameters('Observation'),
    ).toEqual([{ code: 'code', description: undefined }]);
  });

  it('loads resource search parameters from the FHIR Bundle endpoint', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            resourceType: 'Bundle',
            entry: [
              {
                resource: {
                  resourceType: 'SearchParameter',
                  code: 'status',
                  description: 'Status filter',
                },
              },
              { resource: { resourceType: 'SearchParameter', code: 'code' } },
              { resource: { resourceType: 'SearchParameter', code: 'code' } },
              { resource: { resourceType: 'OperationOutcome' } },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await agentBuilderService.getSearchParameters('Observation'),
    ).toEqual([
      { code: 'code', description: undefined },
      { code: 'status', description: 'Status filter' },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/fhir/SearchParameter');
    expect(url.searchParams.get('base')).toBe('Observation');
    expect(fetchMock.mock.calls[0][1]?.headers).toBeTruthy();
  });

  it('forks a persona version through the experimental fork endpoint', async () => {
    const response = { newVersion: 'v1-exp-1728032401234' };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(response)),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentBuilderService.fork(
      'care/gap-manager',
      'v1',
      'my-tenant',
      'metadata:\n  description: Updated thresholds\n',
    );

    const requestUrl = new URL(
      String(fetchMock.mock.calls[0][0]),
      'http://localhost',
    );
    expect(requestUrl.pathname).toContain('/api/agentbuilder/experiments/fork');
    expect(requestUrl.searchParams.get('personaId')).toBe('care/gap-manager');
    expect(requestUrl.searchParams.get('baseVersion')).toBe('v1');
    expect(requestUrl.searchParams.get('tenantId')).toBe('my-tenant');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      patchYaml: 'metadata:\n  description: Updated thresholds\n',
    });
    expect(result.newVersion).toBe('v1-exp-1728032401234');
  });

  it('switches the model for an existing authoring session', async () => {
    const response = {
      sessionId: 'session/1',
      selectedModelId: 'gpt-6-luna',
      message: 'Model updated. Takes effect on the next message.',
    };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(response)),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await agentBuilderService.updateSessionModel(
      'session/1',
      'gpt-6-luna',
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/agentbuilder/sessions/session%2F1/model',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      modelId: 'gpt-6-luna',
    });
    expect(result.selectedModelId).toBe('gpt-6-luna');
  });

  it('lists evaluation runs for a specific encoded seed job ID', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(JSON.stringify([])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.listEvalRunsForSeedJob('seed/job-id');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/eval/seed/seed%2Fjob-id/runs',
    );
  });

  it('lists runs for one seed job using the scoped endpoint', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(JSON.stringify([])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.listEvalRunsForSeedJob('seed/job');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/eval/seed/seed%2Fjob/runs',
    );
  });

  it('tears down a sandbox tenant using the teardown operation', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.teardown('eval/tenant');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/eval/$teardown?evalTenantId=eval%2Ftenant',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });
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
  it('applies a system prompt with the documented persona version query', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.updateSystemPrompt(
      'care/gap-manager',
      'v1-exp-2',
      'my-tenant',
      'Prompt text',
    );
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe(
      '/api/agentbuilder/experiments/persona-system-prompt',
    );
    expect(url.searchParams.get('personaId')).toBe('care/gap-manager');
    expect(url.searchParams.get('version')).toBe('v1-exp-2');
    expect(url.searchParams.get('tenantId')).toBe('my-tenant');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      systemPrompt: 'Prompt text',
    });
  });
  it('refines a system prompt from a selected eval run and optional guidance', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ suggestedSystemPrompt: 'Better prompt' }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.refineSystemPrompt(
      'care-gap-manager',
      'v1',
      'tenant',
      'run-1',
      'Query Conditions first',
    );
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe(
      '/api/agentbuilder/experiments/eval/$refine-prompt',
    );
    expect(url.searchParams.get('runId')).toBe('run-1');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      guidance: 'Query Conditions first',
    });
  });
  it('submits a three-strategy HITL comparison for the selected scenario and tenant', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            comparisonGroup: 'group-1',
            runIds: ['a', 'b', 'c'],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await agentBuilderService.submitHitlComparison({
      personaId: 'care-gap-manager',
      version: 'v1',
      scenarioId: 'scenario-1',
      tenantId: 'tenant',
      evalTenantId: 'eval-tenant',
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe(
      '/api/agentbuilder/experiments/eval/$submit-hitl-comparison',
    );
    expect(url.searchParams.get('scenarioId')).toBe('scenario-1');
    expect(url.searchParams.get('evalTenantId')).toBe('eval-tenant');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(result.runIds).toEqual(['a', 'b', 'c']);
  });
  it('lists and creates tenant terminology through the AgentBuilder API', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      String(_init?.method || 'GET') === 'POST'
        ? new Response(JSON.stringify({ id: 7, code: 'HTN-1' }), {
            status: 201,
          })
        : new Response(JSON.stringify([])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await agentBuilderService.listTenantTerminology(
      'Condition',
      'hypertension',
    );
    await agentBuilderService.createTenantTerminology({
      resourceType: 'Condition',
      name: 'hypertension',
      system: 'https://hospital.example/codes',
      code: 'HTN-1',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/agentbuilder/terminology?resourceType=Condition&q=hypertension',
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/agentbuilder/terminology',
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      resourceType: 'Condition',
      name: 'hypertension',
      system: 'https://hospital.example/codes',
      code: 'HTN-1',
    });
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
