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
  getAssetBusinessRules,
  getConfiguredAsset,
  getConfiguredAssetWorkflow,
  listConfiguredAssets,
} from '../../services/configuredAssetsService';

vi.mock('../../services/configuredAssetsService', () => ({
  listConfiguredAssets: vi.fn(),
  getConfiguredAsset: vi.fn(),
  getAssetBusinessRules: vi.fn(),
  getConfiguredAssetWorkflow: vi.fn(),
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
  it('filters all asset cards and opens detail and manageable rules', async () => {
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
    expect(await screen.findByText('Embedding model: bge-m3')).toBeTruthy();
    expect(screen.queryByText('incorrect-stage')).toBeNull();
    expect(
      screen.getByText(/Patient Visit Workflow \(patient-visit\)/),
    ).toBeTruthy();
    expect(screen.getByText('9 stages')).toBeTruthy();
    const workflowDetailsToggle = screen.getByRole('button', {
      name: 'Show details',
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
        .getByRole('button', { name: 'Hide details' })
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
