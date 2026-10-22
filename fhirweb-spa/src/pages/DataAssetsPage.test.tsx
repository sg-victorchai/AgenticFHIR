import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataAssetsPage, { buildStructureTree } from './DataAssetsPage';
import {
  listConfiguredAssets,
  getConfiguredAsset,
  getAssetBusinessRules,
} from '../services/configuredAssetsService';

const serviceMocks = vi.hoisted(() => ({
  listDataAssets: vi.fn(),
  getDataAssetDetails: vi.fn(),
}));

vi.mock('../services/fhir/dataAssetsService', () => ({
  listDataAssets: serviceMocks.listDataAssets,
  getDataAssetDetails: serviceMocks.getDataAssetDetails,
}));

vi.mock('../services/configuredAssetsService', () => ({
  listConfiguredAssets: vi.fn(async () => []),
  getConfiguredAsset: vi.fn(),
  getAssetBusinessRules: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DataAssetsPage', () => {
  it('lists metadata resources and opens definition, search, and operation details', async () => {
    serviceMocks.listDataAssets.mockResolvedValue([
      {
        type: 'Patient',
        supportedProfile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
        interaction: [{ code: 'read' }, { code: 'search-type' }],
        searchParam: [
          { name: '_id', type: 'token', documentation: 'Logical resource id' },
        ],
        operation: [
          { name: '$validate', definition: 'OperationDefinition/validate' },
        ],
      },
      {
        type: 'AbacPolicy',
        supportedProfile: [
          'http://fhir4java.org/StructureDefinition/AbacPolicy',
        ],
        interaction: [{ code: 'read' }],
      },
      {
        type: 'LegacyResource',
        interaction: [{ code: 'read' }],
      },
      { type: 'StructureDefinition' },
      { type: 'SearchParameter' },
      { type: 'OperationDefinition' },
    ]);
    serviceMocks.getDataAssetDetails.mockResolvedValue({
      structureDefinition: {
        resourceType: 'StructureDefinition',
        type: 'Patient',
        url: 'http://hl7.org/fhir/StructureDefinition/Patient',
        snapshot: {
          element: [
            { path: 'Patient' },
            {
              path: 'Patient.name',
              short: 'A name associated with the patient',
            },
            {
              path: 'Patient.name.family',
              min: 0,
              max: '1',
              type: [{ code: 'string' }],
            },
          ],
        },
      },
      operations: [
        {
          capability: {
            name: '$validate',
            definition: 'OperationDefinition/validate',
          },
          definition: {
            parameter: [
              {
                name: 'resource',
                use: 'in',
                min: 1,
                max: '1',
                type: 'Resource',
              },
              {
                name: 'return',
                use: 'out',
                min: 1,
                max: '1',
                type: 'OperationOutcome',
              },
            ],
          },
        },
      ],
    });

    render(<DataAssetsPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Data Assets (Data Model, Ontology Services, Sources, APIs, Business Rules & Workflow)',
      }),
    ).toBeTruthy();
    expect(await screen.findAllByText('Read')).toHaveLength(3);
    const resourceTab = screen.getByRole('tab', { name: 'Resource Catalog' });
    expect(resourceTab.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(resourceTab, { key: 'ArrowRight' });
    expect(
      screen
        .getByRole('tab', { name: 'Rules & Workflows' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Rules & Workflows' }), {
      key: 'Home',
    });
    expect(resourceTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Supported Interactions')).toHaveLength(3);
    expect(screen.getAllByAltText('HL7 FHIR')).toHaveLength(2);
    expect(screen.getByText('3 available resource types')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(
      screen
        .getByRole('button', {
          name: 'View LegacyResource resource details',
        })
        .querySelector('img[alt="HL7 FHIR"]'),
    ).toBeTruthy();
    for (const type of [
      'StructureDefinition',
      'SearchParameter',
      'OperationDefinition',
    ]) {
      expect(
        screen.queryByRole('button', {
          name: `View ${type} resource details`,
        }),
      ).toBeNull();
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'View Patient resource details' }),
    );

    expect(await screen.findByText('family')).toBeTruthy();
    const structureSection = screen
      .getByText('Structure definition')
      .closest('section');
    expect(structureSection).toBeTruthy();
    const structure = within(structureSection as HTMLElement);
    const structureTable = structure.getByRole('table');
    const columns = structureTable.querySelectorAll('colgroup col');
    expect(structureTable.classList.contains('table-fixed')).toBe(true);
    expect(columns).toHaveLength(5);
    expect(columns[4].getAttribute('style')).toContain('50%');
    expect(
      structure.getByRole('columnheader', { name: 'Name' }).className,
    ).toContain('py-1.5');
    expect(structure.getAllByText('Patient').length).toBeGreaterThanOrEqual(2);
    expect(structure.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Flags' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Card.' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Type' })).toBeTruthy();
    expect(
      structureSection?.querySelectorAll('.border-dotted').length,
    ).toBeGreaterThan(0);
    const rootRow = structure
      .getByRole('button', { name: 'Collapse Patient' })
      .closest('tr');
    expect(
      rootRow?.querySelector('.border-dotted.border-slate-500'),
    ).toBeTruthy();
    expect(
      structure.getByRole('columnheader', {
        name: 'Description & Constraints',
      }),
    ).toBeTruthy();
    expect(screen.getByText('_id')).toBeTruthy();
    expect(screen.getByText('$validate')).toBeTruthy();
    expect(screen.getAllByText('resource')).toHaveLength(2);
    expect(screen.getByText('return')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Data Assets' }),
    );
    expect(
      screen.getByRole('button', { name: 'View Patient resource details' }),
    ).toBeTruthy();
  });

  it('returns from the resource catalog to the same configured asset detail', async () => {
    const asset = {
      resourceType: 'Encounter',
      authoringSource: 'platform',
      enabled: true,
      fhirVersions: ['R5'],
      businessRuleCount: 1,
      workflowName: 'patient-visit',
    };
    serviceMocks.listDataAssets.mockResolvedValue([{ type: 'Encounter' }]);
    serviceMocks.getDataAssetDetails.mockResolvedValue({ operations: [] });
    vi.mocked(listConfiguredAssets).mockResolvedValueOnce([asset]);
    vi.mocked(getConfiguredAsset).mockResolvedValueOnce({
      ...asset,
      interactions: {},
      profileUrls: [],
      eventTriggerCount: 0,
      nlSearchSynonyms: [],
      embeddingEnabled: false,
    });
    vi.mocked(getAssetBusinessRules).mockResolvedValueOnce([]);
    render(<DataAssetsPage />);
    await screen.findByText('1 available resource types');
    fireEvent.click(screen.getByRole('tab', { name: 'Rules & Workflows' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View Encounter configuration',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'View in Resource Catalog' }),
    );
    expect(
      screen
        .getByRole('tab', { name: 'Resource Catalog' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(await screen.findByText('Structure definition')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Back to Encounter Rules & Workflows',
      }),
    );
    expect(
      screen
        .getByRole('tab', { name: 'Rules & Workflows' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'Encounter' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Manage Business Rules' }),
    ).toBeTruthy();
    expect(getConfiguredAsset).toHaveBeenCalledTimes(1);
  });

  it('builds a nested structure tree from differential elements when snapshot is absent', () => {
    const tree = buildStructureTree(
      {
        type: 'AbacPolicy',
        differential: {
          element: [
            { path: 'AbacPolicy' },
            { path: 'AbacPolicy.policy' },
            { path: 'AbacPolicy.policy.action', min: 1, max: '*' },
          ],
        },
      },
      'AbacPolicy',
    );

    expect(tree.children[0].name).toBe('policy');
    expect(tree.children[0].children[0].name).toBe('action');
    expect(tree.children[0].children[0].element?.min).toBe(1);
  });
});
