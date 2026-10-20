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
  listConfiguredAssets,
} from '../../services/configuredAssetsService';

vi.mock('../../services/configuredAssetsService', () => ({
  listConfiguredAssets: vi.fn(),
  getConfiguredAsset: vi.fn(),
  getAssetBusinessRules: vi.fn(),
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
      properties: {},
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
  it('filters configured cards and opens detail and sorted read-only rules', async () => {
    render(<ConfiguredAssetsCatalog />);
    expect(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'View Observation configuration' }),
    ).toBeNull();
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
    expect(screen.getByText('registration')).toBeTruthy();
    expect(screen.getByText('CREATE · Enabled')).toBeTruthy();
    expect(screen.getByText('DELETE · Disabled')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'View Business Rules' }),
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1].textContent).toContain('workflow-bootstrap');
    expect(rows[2].textContent).toContain('workflow-instantiator');
    expect(
      screen.queryByRole('button', { name: /Add|Edit|Delete/ }),
    ).toBeNull();
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
      await screen.findByText(
        'No resources have business rules or workflows configured.',
      ),
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
    const summary = await screen.findByText('Search Parameters', {
      selector: 'summary',
    });
    const section = summary.closest('details');
    expect(section?.open).toBe(false);
    fireEvent.click(summary);
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
      await screen.findByRole('button', { name: 'View Business Rules' }),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Rules unavailable',
    );
  });
});
