import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedHeaders } from './auth/oidc';
import {
  getAssetBusinessRules,
  getConfiguredAsset,
  getConfiguredAssetWorkflow,
  assignConfiguredAssetWorkflow,
  findWorkflowDefinition,
  listConfiguredAssets,
  listWorkflowDefinitions,
  listOnboardingSessions,
  getOnboardingSession,
  removeConfiguredAssetWorkflow,
  sendOnboardingMessage,
  streamOnboardingSession,
} from './configuredAssetsService';

vi.mock('./auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(async () => ({
    Authorization: 'Bearer test',
  })),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('configured asset API', () => {
  it('uses authenticated admin endpoints and encodes resource names', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL) => new Response(JSON.stringify([])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await listConfiguredAssets();
    await getConfiguredAsset('Custom/Type');
    await getAssetBusinessRules('Encounter');
    await getConfiguredAssetWorkflow('Encounter');
    await listWorkflowDefinitions();
    await findWorkflowDefinition('patient visit');
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('/api/admin/data-assets'),
      expect.stringContaining('/api/admin/data-assets/Custom%2FType'),
      expect.stringContaining('/api/admin/data-assets/Encounter/rules'),
      expect.stringContaining('/api/admin/data-assets/Encounter/workflow'),
      expect.stringContaining('/fhir/r5/WorkflowDefinition?_count=50'),
      expect.stringContaining(
        '/fhir/r5/WorkflowDefinition?identifier=patient+visit',
      ),
    ]);
    expect(getAuthenticatedHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ 'X-Tenant-ID': expect.any(String) }),
    );
  });
  it('assigns and removes workflows using the workflow assignment API', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{}'),
    );
    vi.stubGlobal('fetch', fetchMock);
    await assignConfiguredAssetWorkflow('AdverseEvent', 'adverse-event-review');
    await removeConfiguredAssetWorkflow('AdverseEvent');

    expect(
      fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method]),
    ).toEqual([
      [
        expect.stringContaining('/api/admin/data-assets/AdverseEvent/workflow'),
        'PUT',
      ],
      [
        expect.stringContaining('/api/admin/data-assets/AdverseEvent/workflow'),
        'DELETE',
      ],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      workflowDefinitionIdentifier: 'adverse-event-review',
    });
  });
  it('sends onboarding messages as a per-turn SSE request with the message field', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          'event: token\ndata: Welcome to onboarding\n\nevent: done\ndata:\n\n',
          {
            headers: { 'Content-Type': 'text/event-stream' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: Array<{ type: string; data: string }> = [];

    await sendOnboardingMessage(
      'session-1',
      'Describe a lab result',
      (event) => {
        events.push(event);
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/sessions/service-onboarding/session-1/messages',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test' }),
        body: JSON.stringify({ message: 'Describe a lab result' }),
      }),
    );
    expect(getAuthenticatedHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ Accept: 'text/event-stream' }),
    );
    expect(events).toEqual([
      { type: 'token', data: 'Welcome to onboarding' },
      { type: 'done', data: '' },
    ]);
  });
  it('normalizes snake_case onboarding session responses', async () => {
    const session = {
      session_id: 'session-1',
      entity_name: 'LabResult',
      current_phase: 2,
      phase_status: { '1': 'complete', '2': 'in-progress' },
      updated_at: '2026-10-22T01:30:00Z',
      spec_markdown: '# LabResult',
      status: 'IN_PROGRESS',
      conversation: [{ role: 'assistant', content: 'Welcome' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([session]))),
    );
    const [listed] = await listOnboardingSessions();
    expect(listed).toMatchObject({
      sessionId: 'session-1',
      entityName: 'LabResult',
      currentPhase: 2,
      updatedAt: '2026-10-22T01:30:00Z',
      specMarkdown: '# LabResult',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(session))),
    );
    await expect(getOnboardingSession('session-1')).resolves.toMatchObject({
      sessionId: 'session-1',
      entityName: 'LabResult',
      currentPhase: 2,
    });
  });
  it('infers missing onboarding entity names from the spec or assistant reply', async () => {
    const sessions = [
      {
        session_id: 'session-spec',
        status: 'IN_PROGRESS',
        spec_markdown: '# BusinessApplication\n\nFields: name, status',
      },
      {
        session_id: 'session-conversation',
        status: 'IN_PROGRESS',
        current_phase: 1,
        conversation: [
          {
            role: 'assistant',
            content:
              'This sounds like a **ClaimRequest** entity representing a claim.',
          },
        ],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(sessions))),
    );

    await expect(listOnboardingSessions()).resolves.toMatchObject([
      { sessionId: 'session-spec', entityName: 'BusinessApplication' },
      { sessionId: 'session-conversation', entityName: 'ClaimRequest' },
    ]);
  });
  it('uses a separate keepalive GET stream and receives connected events', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          'event: connected\ndata: ready\n\nevent: ping\ndata:\n\n',
          {
            headers: { 'Content-Type': 'text/event-stream' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: Array<{ type: string; data: string }> = [];
    await streamOnboardingSession(
      'session-1',
      (event) => events.push(event),
      new AbortController().signal,
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/sessions/service-onboarding/session-1/stream',
    );
    expect(events).toEqual([
      { type: 'connected', data: 'ready' },
      { type: 'ping', data: '' },
    ]);
  });
  it('surfaces permission and missing-resource errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(listConfiguredAssets()).rejects.toThrow('permission');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(getConfiguredAsset('Missing')).rejects.toThrow(
      'no longer configured',
    );
    await expect(getConfiguredAssetWorkflow('Encounter')).rejects.toThrow(
      'No workflow definition was found',
    );
  });
});
