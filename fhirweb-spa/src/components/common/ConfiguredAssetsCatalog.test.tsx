import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfiguredAssetsCatalog from './ConfiguredAssetsCatalog';
import {
  abandonOnboardingSession,
  assignConfiguredAssetWorkflow,
  createOnboardingSession,
  getAssetBusinessRules,
  getConfiguredAsset,
  getConfiguredAssetWorkflow,
  getOnboardingSession,
  findWorkflowDefinition,
  listConfiguredAssets,
  listOnboardingSessions,
  listWorkflowDefinitions,
  removeConfiguredAssetWorkflow,
  sendOnboardingMessage,
} from '../../services/configuredAssetsService';
import { getOidcUser, hasRealmRole } from '../../services/auth/oidc';

vi.mock('../../services/configuredAssetsService', () => ({
  abandonOnboardingSession: vi.fn(),
  listConfiguredAssets: vi.fn(),
  getConfiguredAsset: vi.fn(),
  getAssetBusinessRules: vi.fn(),
  getConfiguredAssetWorkflow: vi.fn(),
  assignConfiguredAssetWorkflow: vi.fn(),
  removeConfiguredAssetWorkflow: vi.fn(),
  listWorkflowDefinitions: vi.fn(),
  findWorkflowDefinition: vi.fn(),
  listOnboardingSessions: vi.fn(),
  getOnboardingSession: vi.fn(),
  createOnboardingSession: vi.fn(),
  sendOnboardingMessage: vi.fn(),
  streamOnboardingSession: vi.fn(() => new Promise<void>(() => {})),
}));
vi.mock('../../services/auth/oidc', () => ({
  getOidcUser: vi.fn().mockResolvedValue({ access_token: 'power-user-token' }),
  hasRealmRole: vi.fn((_token: string, role: string) => role === 'POWER_USER'),
}));
const encounter = {
  resourceType: 'Encounter',
  authoringSource: 'platform',
  enabled: true,
  fhirVersions: ['R5'],
  businessRuleCount: 2,
  workflowName: 'patient-visit',
};
beforeEach(() => {
  vi.mocked(getOidcUser).mockResolvedValue({
    access_token: 'power-user-token',
  } as never);
  vi.mocked(hasRealmRole).mockImplementation(
    (_token, role) => role === 'POWER_USER',
  );
  vi.mocked(listOnboardingSessions).mockResolvedValue([]);
  vi.mocked(abandonOnboardingSession).mockResolvedValue(undefined);
  vi.mocked(createOnboardingSession).mockResolvedValue({
    sessionId: 'new-onboarding-session',
    status: 'ACTIVE',
    entrySkill: 'fhir4java-model-business-workflow',
  });
  vi.mocked(listConfiguredAssets).mockResolvedValue([
    encounter,
    {
      ...encounter,
      resourceType: 'Observation',
      businessRuleCount: 0,
      workflowName: null,
    },
    {
      ...encounter,
      resourceType: 'Patient',
      businessRuleCount: 1,
      workflowName: null,
      enabled: false,
      authoringSource: 'portal',
    },
  ]);
  vi.mocked(getConfiguredAsset).mockResolvedValue({
    ...encounter,
    interactions: { create: true, delete: false },
    profileUrls: ['http://hl7.org/fhir/StructureDefinition/Encounter'],
    eventTriggerCount: 0,
    nlSearchSynonyms: ['patient visit'],
    embeddingEnabled: true,
    embeddingModel: 'bge-m3',
  });
  vi.mocked(getConfiguredAssetWorkflow).mockResolvedValue({
    resourceType: 'WorkflowDefinition',
    id: 'bc2b782d-5ba5-4a13-a1bb-c8167cf3646f',
    meta: {
      versionId: '1',
      lastUpdated: '2026-09-12T15:54:52.800+08:00',
      profile: ['http://fhir4java.org/StructureDefinition/WorkflowDefinition'],
    },
    identifier: [
      {
        system: 'http://fhir4java.org/identifiers/workflow-definition',
        value: 'patient-visit',
      },
    ],
    name: 'patient-visit',
    title: 'Patient Visit Workflow',
    status: 'active',
    targetResourceProfile:
      'http://fhir4java.org/StructureDefinition/ClinicalEncounter',
    stage: [
      {
        stageId: 'registration',
        label: 'Registration',
        actor: 'PSA',
        optional: false,
        description:
          'Patient registration — initial entry into workflow for planned encounters',
        stageExpression:
          "Encounter.status = 'planned' and Encounter.location.exists().not()",
        uiHint: { icon: 'user-plus' },
        action: [
          {
            actionId: 'apply-start-check-in',
            actionType: 'transition',
            label: 'Start Check-In',
            requiredRole: ['PSA'],
            toStage: 'awaiting-triage',
            fhirMutation: [
              {
                sequenceNumber: 1,
                mutationType: 'fhirpath',
                expression:
                  "Encounter.location.append({'location': {'identifier': {'value': 'triage'}}, 'status': 'planned'})",
              },
            ],
          },
        ],
      },
      {
        stageId: 'cancelled',
        label: 'Cancelled',
        actor: 'Any',
        optional: false,
        description: 'Visit cancelled by PSA at any pre-billing stage',
        stageExpression: "Encounter.status = 'cancelled'",
      },
      {
        stageId: 'completed',
        label: 'Completed',
        actor: 'Any',
        optional: false,
        description: 'Visit fully completed and payment collected.',
        stageExpression: "Encounter.status = 'completed'",
        uiHint: { icon: 'check-circle', terminal: true },
      },
      {
        stageId: 'awaiting-triage',
        label: 'Awaiting Triage',
        actor: 'PSA',
        optional: false,
        description:
          'Patient registered; PSA records vital signs and completes triage',
        stageExpression:
          "Encounter.location.last().where(location.identifier.value = 'triage').exists()",
        uiHint: { icon: 'clipboard-list' },
        action: [
          {
            actionId: 'apply-triage-complete',
            actionType: 'transition',
            label: 'Complete Triage',
            requiredRole: ['PSA'],
            toStage: 'awaiting-clinician',
            prerequisite: [
              {
                label: 'Vital Signs Recorded',
                description:
                  'A VitalSignsPanel Observation must be recorded before completing triage',
                checkQuery:
                  'Observation?encounter={subjectId}&category=vital-signs&status=final&_count=1',
                minCount: 1,
                onViolation: 'block',
                navigationKey: 'vital-signs-entry',
                profileUrl:
                  'http://fhir4java.org/StructureDefinition/VitalSignsPanel',
                resourceTemplate:
                  '{"resourceType":"Observation","status":"final"}',
              },
            ],
            fhirMutation: [
              {
                sequenceNumber: 1,
                mutationType: 'fhirpath',
                expression:
                  "Encounter.location.where(location.identifier.value = 'triage').status = 'completed'",
              },
            ],
          },
        ],
      },
      {
        stageId: 'awaiting-clinician',
        label: 'Awaiting Clinician',
        actor: 'Clinician',
        optional: false,
        description:
          'Triage complete; patient in waiting room until clinician calls',
        stageExpression:
          "Encounter.location.last().where(location.identifier.value = 'waiting-room' and status = 'active').exists()",
        action: [
          {
            actionId: 'call-patient',
            actionType: 'transition',
            label: 'Call Patient',
            requiredRole: ['Clinician'],
            toStage: 'waiting-patient',
          },
          {
            actionId: 'cancel-visit',
            actionType: 'transition',
            label: 'Cancel Visit',
            requiredRole: ['PSA'],
            toStage: 'cancelled',
          },
        ],
      },
      {
        stageId: 'waiting-patient',
        label: 'Waiting for Patient',
        actor: 'Clinician',
        optional: false,
        description:
          'Clinician called patient; patient walking to consult room',
        action: [
          {
            actionId: 'start-consult',
            actionType: 'transition',
            label: 'Start Consult',
            requiredRole: ['Clinician'],
            toStage: 'in-consultation',
          },
          {
            actionId: 'cancel',
            actionType: 'transition',
            label: 'Cancel',
            requiredRole: ['PSA'],
            toStage: 'cancelled',
          },
        ],
      },
      {
        stageId: 'in-consultation',
        label: 'In Consultation',
        actor: 'Clinician',
        optional: false,
        description: 'Clinician and patient in active consultation',
        action: [
          {
            actionId: 'apply-complete-consult',
            actionType: 'transition',
            label: 'Complete Consult',
            requiredRole: ['Clinician'],
            toStage: 'awaiting-billing',
            conditionalToStage: [
              {
                conditionQuery:
                  'MedicationRequest?encounter={subjectId}&status=active&_count=1',
                toStage: 'awaiting-medication',
                fhirMutation: [
                  {
                    sequenceNumber: 1,
                    mutationType: 'fhirpath',
                    expression:
                      "Encounter.location.append({'location': {'identifier': {'value': 'pharmacy'}}, 'status': 'planned'})",
                  },
                ],
              },
            ],
            fhirMutation: [
              {
                sequenceNumber: 1,
                mutationType: 'fhirpath',
                expression:
                  "Encounter.location.append({'location': {'identifier': {'value': 'billing'}}, 'status': 'planned'})",
              },
            ],
          },
          {
            actionId: 'view-notes',
            actionType: 'navigate',
            label: 'View / Edit Notes',
            requiredRole: ['Clinician'],
            navigationKey: 'note-editor',
          },
          {
            actionId: 'resume-consult',
            actionType: 'navigate',
            label: 'Resume Consult',
            requiredRole: ['Clinician'],
            navigationKey: 'consult-room',
          },
        ],
      },
      {
        stageId: 'awaiting-medication',
        label: 'Awaiting Medication',
        actor: 'PSA',
        optional: true,
        description: 'Medication prescribed; patient collecting from pharmacy',
        action: [
          {
            actionId: 'medication-dispensed',
            actionType: 'transition',
            label: 'Medication Dispensed',
            requiredRole: ['PSA'],
            toStage: 'awaiting-billing',
          },
        ],
      },
      {
        stageId: 'awaiting-billing',
        label: 'Awaiting Billing',
        actor: 'PSA',
        action: [
          {
            actionId: 'collect-payment',
            actionType: 'transition',
            label: 'Collect Payment',
            requiredRole: ['PSA'],
            toStage: 'completed',
          },
        ],
      },
    ],
  });
  vi.mocked(listWorkflowDefinitions).mockResolvedValue({
    resourceType: 'Bundle',
    entry: [
      {
        resource: {
          resourceType: 'WorkflowDefinition',
          id: 'patient-visit',
          identifier: [{ value: 'patient-visit' }],
          name: 'patient-visit',
          title: 'Patient Visit Workflow',
          stage: [{ stageId: 'registration' }],
        },
      },
    ],
  });
  vi.mocked(findWorkflowDefinition).mockResolvedValue({
    resourceType: 'Bundle',
    entry: [
      {
        resource: {
          resourceType: 'WorkflowDefinition',
          id: 'patient-visit',
          identifier: [{ value: 'patient-visit' }],
          name: 'patient-visit',
          title: 'Patient Visit Workflow',
          stage: [{ stageId: 'registration' }],
        },
      },
    ],
  });
  vi.mocked(assignConfiguredAssetWorkflow).mockResolvedValue({
    resourceType: 'Patient',
    workflowDefinitionIdentifier: 'patient-visit',
    ruleId: 'patient-workflow-bootstrap',
    authoringSource: 'portal',
  });
  vi.mocked(removeConfiguredAssetWorkflow).mockResolvedValue(undefined);
  vi.mocked(getAssetBusinessRules).mockResolvedValue([
    {
      ruleId: 'later',
      targetResourceType: 'Encounter',
      triggerOperation: 'CREATE',
      priority: 100,
      phase: 'AFTER',
      mode: 'ASYNC',
      pluginId: 'workflow-instantiator',
      description: 'Creates audit trail',
      enabled: false,
      properties: {
        'conditional-initial-stages': [
          { condition: "status = 'wrong-rule'", stage: 'incorrect-stage' },
        ],
      },
      authoringSource: 'portal',
    },
    {
      ruleId: 'first',
      targetResourceType: 'Encounter',
      triggerOperation: 'CREATE',
      priority: 4,
      phase: 'BEFORE',
      mode: 'SYNC',
      pluginId: 'workflow-bootstrap',
      description: 'Routes initial stage',
      enabled: true,
      properties: {
        'conditional-initial-stages': [
          { condition: "status = 'planned'", stage: 'registration' },
        ],
      },
      authoringSource: 'platform',
    },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('configured assets catalog', () => {
  it('hides asset authoring entry points for users without an authoring role', async () => {
    vi.mocked(hasRealmRole).mockReturnValue(false);
    render(<ConfiguredAssetsCatalog />);
    await screen.findByRole('button', { name: 'View Encounter configuration' });
    expect(screen.queryByRole('button', { name: '+ New Asset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My Sessions' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'View Encounter configuration' }),
    );
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(
      await screen.findByRole('heading', { name: 'Workflow' }),
    ).toBeTruthy();
  });

  it('shows asset authoring entry points to users with the route access role', async () => {
    vi.mocked(hasRealmRole).mockImplementation(
      (_token, role) => role === 'agentbuilder',
    );
    render(<ConfiguredAssetsCatalog />);
    expect(
      await screen.findByRole('button', { name: '+ New Asset' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'My Sessions' })).toBeTruthy();
  });

  it('returns from session history to the asset list using the prominent back action', async () => {
    render(<ConfiguredAssetsCatalog />);
    await screen.findByRole('button', { name: 'View Encounter configuration' });
    fireEvent.click(screen.getByRole('button', { name: 'My Sessions' }));
    const backButton = await screen.findByRole('button', {
      name: 'Back to Asset List',
    });
    expect(backButton.className).toContain('bg-cyan-50');
    fireEvent.click(backButton);
    expect(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    ).toBeTruthy();
  });

  it('renders onboarding session history as cards on mobile', async () => {
    vi.mocked(listOnboardingSessions).mockResolvedValue([
      {
        sessionId: 'claim-request-session',
        entityName: 'ClaimRequest',
        status: 'IN_PROGRESS',
        currentPhase: 1,
        updatedAt: '2026-10-22T10:30:00Z',
      },
    ]);
    render(<ConfiguredAssetsCatalog />);
    await screen.findByRole('button', { name: 'View Encounter configuration' });
    fireEvent.click(screen.getByRole('button', { name: 'My Sessions' }));

    const card = await screen.findByRole('article');
    expect(card.textContent).toContain('ClaimRequest');
    expect(card.textContent).toContain('1/4');
    expect(card.textContent).toContain('In progress');
    expect(within(card).getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Abandon' })).toBeTruthy();
    expect(card.parentElement?.className).toContain('sm:hidden');
  });

  it('shows the inferred entity name for unnamed phase-one history summaries', async () => {
    vi.mocked(listOnboardingSessions).mockResolvedValue([
      {
        sessionId: 'business-application-session',
        status: 'IN_PROGRESS',
        currentPhase: 1,
      },
    ]);
    vi.mocked(getOnboardingSession).mockResolvedValue({
      sessionId: 'business-application-session',
      status: 'IN_PROGRESS',
      entityName: 'BusinessApplication',
      currentPhase: 1,
    });
    render(<ConfiguredAssetsCatalog />);
    await screen.findByRole('button', { name: 'View Encounter configuration' });
    fireEvent.click(screen.getByRole('button', { name: 'My Sessions' }));

    expect((await screen.findAllByText('BusinessApplication')).length).toBe(2);
    expect(screen.queryByText('Untitled')).toBeNull();
    expect(getOnboardingSession).toHaveBeenCalledWith(
      'business-application-session',
    );
  });

  it('creates a new asset session only after the first message is submitted', async () => {
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New Asset' }));
    expect(
      await screen.findByRole('heading', { name: 'AI-assisted Setup' }),
    ).toBeTruthy();
    const phaseStepper = screen.getByRole('navigation', {
      name: 'Onboarding phases',
    });
    expect(within(phaseStepper).getByText('Data Sources')).toBeTruthy();
    expect(createOnboardingSession).not.toHaveBeenCalled();
    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize message input',
    });
    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('112');
    fireEvent.keyDown(resizeHandle, { key: 'ArrowUp' });
    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('128');

    const messageInput = screen.getByRole('textbox', {
      name: 'Type your message',
    });
    fireEvent.change(messageInput, {
      target: { value: 'Create a ClaimRequest asset' },
    });
    fireEvent.keyDown(messageInput, { key: 'Enter', code: 'Enter' });
    expect(createOnboardingSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await vi.waitFor(() => {
      expect(createOnboardingSession).toHaveBeenCalledOnce();
      expect(sendOnboardingMessage).toHaveBeenCalledWith(
        'new-onboarding-session',
        'Create a ClaimRequest asset',
        expect.any(Function),
        expect.any(AbortSignal),
      );
    });
  });

  it('formats assistant Markdown and hides internal tool call/results', async () => {
    vi.mocked(getOnboardingSession).mockResolvedValue({
      sessionId: 'new-onboarding-session',
      status: 'IN_PROGRESS',
      currentPhase: 1,
    });
    vi.mocked(sendOnboardingMessage).mockImplementation(
      async (_sessionId, _message, onEvent) => {
        onEvent({
          type: 'token',
          data: '[{"id":"call_123","name":"list_resource_types","input":{}},{"id":"call_456","name":"write_service_spec","input":{"content":"# BusinessApplication\\n\\n## Fields"}}]',
        });
        onEvent({
          type: 'token',
          data: '[call_123] AbacPolicy, AdverseEvent, BusinessApplication',
        });
        onEvent({
          type: 'token',
          data: '## Phase 1: Model\n\n- **Entity:** BusinessApplication\n- **Status:** Ready',
        });
        onEvent({ type: 'done', data: '' });
      },
    );
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New Asset' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Type your message' }),
      {
        target: { value: 'Create a BusinessApplication resource' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(
      await screen.findByRole('heading', { name: 'Phase 1: Model' }),
    ).toBeTruthy();
    expect(screen.getByText('Entity:')).toBeTruthy();
    expect(screen.getByText('Status:')).toBeTruthy();
    expect(screen.queryByText(/call_123|AbacPolicy, AdverseEvent/)).toBeNull();
  });

  it('requires typed session-name confirmation before abandoning a session', async () => {
    vi.mocked(listOnboardingSessions).mockResolvedValue([
      {
        sessionId: 'session-claim-request-1',
        entityName: 'ClaimRequest',
        status: 'IN_PROGRESS',
        currentPhase: 1,
      },
    ]);
    render(<ConfiguredAssetsCatalog />);
    await screen.findByRole('button', { name: 'View Encounter configuration' });
    fireEvent.click(screen.getByRole('button', { name: 'My Sessions' }));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Abandon' }))[0],
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Abandon this onboarding session?',
    });
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Yes, abandon this session',
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Type session name to confirm',
      }),
      { target: { value: 'ClaimRequest' } },
    );
    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmButton);
    await vi.waitFor(() =>
      expect(abandonOnboardingSession).toHaveBeenCalledWith(
        'session-claim-request-1',
      ),
    );
  });

  it('verifies a workflow definition and assigns it from an unassigned asset', async () => {
    vi.mocked(hasRealmRole).mockImplementation(
      (_token, role) => role === 'agentbuilder',
    );
    vi.mocked(getConfiguredAsset).mockResolvedValueOnce({
      ...encounter,
      resourceType: 'Patient',
      authoringSource: 'platform',
      workflowName: null,
      interactions: { read: true },
      profileUrls: [],
      eventTriggerCount: 0,
      nlSearchSynonyms: [],
      embeddingEnabled: false,
    });
    vi.mocked(getAssetBusinessRules).mockResolvedValueOnce([]);
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Patient configuration',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Assign Workflow' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: /Assign workflow · Patient/,
    });
    fireEvent.change(
      within(dialog).getByLabelText('WorkflowDefinition identifier'),
      {
        target: { value: 'patient-visit' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify' }));
    expect(
      await within(dialog).findByText(/Verified identifier: patient-visit/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(assignConfiguredAssetWorkflow).toHaveBeenCalledWith(
        'Patient',
        'patient-visit',
      ),
    );
  });

  it('opens the add-rule form directly from the asset detail section', async () => {
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Add Rule$/ }));

    expect(
      await screen.findByRole('form', { name: 'Add business rule' }),
    ).toBeTruthy();
  });

  it('opens workflow AI authoring directly from asset detail', async () => {
    vi.mocked(hasRealmRole).mockImplementation(
      (_token, role) => role === 'agentbuilder',
    );
    vi.mocked(getConfiguredAsset).mockResolvedValueOnce({
      ...encounter,
      workflowName: null,
      interactions: { create: true },
      profileUrls: [],
      eventTriggerCount: 0,
      nlSearchSynonyms: [],
      embeddingEnabled: false,
    });
    vi.mocked(getAssetBusinessRules).mockResolvedValueOnce([]);
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    const aiButtons = await screen.findAllByRole('button', {
      name: 'Author with AI',
    });
    const workflowButton = aiButtons.find((button) =>
      button.closest('#configured-Workflow'),
    );
    expect(workflowButton).toBeTruthy();
    fireEvent.click(workflowButton as HTMLElement);

    expect(
      await screen.findByText(
        'I found the existing Encounter asset. This session will update Workflow. What would you like to change?',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Message/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Encounter' })).toBeNull();
  });

  it('opens rule AI authoring directly from asset detail', async () => {
    vi.mocked(hasRealmRole).mockImplementation(
      (_token, role) => role === 'agentbuilder',
    );
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    const ruleButton = await screen.findByRole('button', {
      name: 'Author with AI',
    });
    fireEvent.click(ruleButton);

    expect(
      await screen.findByRole('heading', { name: 'Author Business Rules' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "What should a rule do for Encounter? Describe the behavior in plain English and I'll help author it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Encounter' })).toBeNull();
  });

  it('filters all asset cards and opens detail and manageable rules', async () => {
    vi.mocked(hasRealmRole).mockImplementation(
      (_token, role) => role === 'agentbuilder',
    );
    render(<ConfiguredAssetsCatalog />);
    expect(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', {
        name: 'View Observation configuration',
      }),
    ).toBeTruthy();
    const dataAssetsIntro = screen.getByText(
      /Data Foundry provides a governed foundation/,
    );
    expect(dataAssetsIntro).toBeTruthy();
    expect(dataAssetsIntro.textContent).toContain(
      'The platform normalizes terminology to create a semantic ontology layer',
    );
    expect(screen.getByText('Disabled')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'patient-visit' },
    });
    expect(
      screen.queryByRole('button', { name: 'View Patient configuration' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'View Encounter configuration' }),
    );
    expect(
      screen.queryByText(/Data Foundry provides a governed foundation/),
    ).toBeNull();
    expect(await screen.findByText('Embedding model: bge-m3')).toBeTruthy();
    expect(screen.queryByText('incorrect-stage')).toBeNull();
    expect(
      screen.getByText(/Patient Visit Workflow \(patient-visit\)/),
    ).toBeTruthy();
    expect(screen.getByText('9 stages')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove' }).hasAttribute('disabled'),
    ).toBe(true);
    const workflowDetailsToggle = screen.getByRole('button', {
      name: 'View workflow definition',
    });
    expect(workflowDetailsToggle.getAttribute('aria-expanded')).toBe('false');
    const workflowSummary = workflowDetailsToggle.closest('div.border');
    expect(workflowSummary).toBeTruthy();
    expect(
      screen.getByText(
        'registration → awaiting-triage → awaiting-clinician → waiting-patient → in-consultation → awaiting-billing → completed',
      ),
    ).toBeTruthy();
    expect(workflowSummary?.textContent).toContain(
      'Conditional: in-consultation → awaiting-medication',
    );
    expect(workflowSummary?.textContent).toContain(
      'Cancellation: awaiting-clinician → cancelled',
    );
    expect(screen.getByText("status = 'planned'")).toBeTruthy();
    expect(screen.queryByLabelText('Full workflow definition')).toBeNull();
    fireEvent.click(workflowDetailsToggle);
    expect(
      screen
        .getByRole('button', { name: 'Hide definition' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByText('9 stages · 10 transitions · active')).toBeTruthy();
    fireEvent.click(screen.getByText('Definition metadata'));
    for (const stage of [
      'Registration',
      'Awaiting Triage',
      'Awaiting Clinician',
      'Waiting for Patient',
      'In Consultation',
      'Awaiting Medication',
      'Awaiting Billing',
      'Cancelled',
      'Completed',
    ])
      expect(screen.getByText(stage)).toBeTruthy();
    const workflowPanel = screen.getByLabelText('Full workflow definition');
    const orderedStageIds = Array.from(
      workflowPanel.querySelectorAll(':scope > ol > li'),
    ).map((item) => item.querySelector('div div p.font-mono')?.textContent);
    expect(orderedStageIds).toEqual([
      'registration',
      'awaiting-triage',
      'awaiting-clinician',
      'waiting-patient',
      'in-consultation',
      'awaiting-medication',
      'awaiting-billing',
      'cancelled',
      'completed',
    ]);
    for (const action of [
      '(PSA: Start Check-In)',
      '(PSA: Complete Triage)',
      '(Clinician: Call Patient)',
      '(PSA: Cancel Visit)',
      '(Clinician: Start Consult)',
      '(PSA: Cancel)',
      '(Clinician: Complete Consult)',
      '(PSA: Medication Dispensed)',
      '(PSA: Collect Payment)',
    ])
      expect(screen.getByText(action)).toBeTruthy();
    expect(
      screen.getByText(/A VitalSignsPanel Observation must be recorded/),
    ).toBeTruthy();
    expect(screen.getByText(/Prerequisite: Vital Signs Recorded/)).toBeTruthy();
    expect(
      screen.getByText(
        'Observation?encounter={subjectId}&category=vital-signs&status=final&_count=1',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Minimum matching records: 1')).toBeTruthy();
    expect(screen.getByText('On failure: block')).toBeTruthy();
    expect(screen.getByText('Navigation: vital-signs-entry')).toBeTruthy();
    expect(screen.getByText('View / Edit Notes')).toBeTruthy();
    expect(screen.getByText('Navigation: note-editor')).toBeTruthy();
    expect(screen.getAllByText('FHIR mutations (1)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Terminal')).toHaveLength(2);
    for (const edge of [
      'registration → awaiting-triage',
      'awaiting-triage → awaiting-clinician',
      'awaiting-clinician → waiting-patient',
      'awaiting-clinician → cancelled',
      'waiting-patient → in-consultation',
      'waiting-patient → cancelled',
      'in-consultation → awaiting-billing',
      'in-consultation → awaiting-medication',
      'awaiting-medication → awaiting-billing',
      'awaiting-billing → completed',
    ])
      expect(workflowPanel.textContent).toContain(edge);
    expect(workflowPanel.textContent).toContain(
      'When MedicationRequest?encounter={subjectId}&status=active&_count=1:',
    );
    expect(screen.getByText('Definition metadata')).toBeTruthy();
    expect(
      screen.getByText(
        /FHIR resource ID: bc2b782d-5ba5-4a13-a1bb-c8167cf3646f/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Version: 1/)).toBeTruthy();
    expect(screen.getByText('Navigation: note-editor')).toBeTruthy();
    expect(screen.getByText('CREATE · Enabled')).toBeTruthy();
    expect(screen.getByText('DELETE · Disabled')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage Business Rules' }),
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1].textContent).toContain('workflow-bootstrap');
    expect(rows[2].textContent).toContain('workflow-instantiator');
    expect(screen.getByRole('button', { name: /Add Rule/ })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Asset Detail' }),
    );
    expect(screen.getByText('Embedding model: bge-m3')).toBeTruthy();
  });
  it('shows a retryable list error', async () => {
    vi.mocked(listConfiguredAssets).mockRejectedValueOnce(
      new Error('Access denied'),
    );
    render(<ConfiguredAssetsCatalog />);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Access denied'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    ).toBeTruthy();
  });
  it('shows an empty state for bare resources', async () => {
    vi.mocked(listConfiguredAssets).mockResolvedValue([]);
    render(<ConfiguredAssetsCatalog />);
    expect(
      await screen.findByText('No data assets are configured.'),
    ).toBeTruthy();
  });

  it('opens portal sections collapsed and links back to the resource catalog', async () => {
    const onViewResource = vi.fn();
    vi.mocked(getConfiguredAsset).mockResolvedValue({
      ...encounter,
      authoringSource: 'portal',
      interactions: {},
      profileUrls: [],
      eventTriggerCount: 0,
      nlSearchSynonyms: [],
      embeddingEnabled: false,
    });
    render(<ConfiguredAssetsCatalog onViewResource={onViewResource} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    const summary = (await screen.findAllByText('Search Parameters')).find(
      (element) => element.tagName === 'SPAN',
    );
    const section = summary?.closest('details');
    expect(section?.open).toBe(false);
    fireEvent.click(summary as HTMLElement);
    fireEvent.click(
      screen.getByRole('button', { name: 'View in Resource Catalog' }),
    );
    expect(onViewResource).toHaveBeenCalledWith('Encounter');
  });
  it('keeps asset details available when the rules endpoint fails', async () => {
    vi.mocked(getAssetBusinessRules).mockRejectedValue(
      new Error('Rules unavailable'),
    );
    render(<ConfiguredAssetsCatalog />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage Business Rules' }),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Rules unavailable',
    );
  });
});
