import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataAssetsPage, { buildStructureTree } from './DataAssetsPage';

const serviceMocks = vi.hoisted(() => ({
  listDataAssets: vi.fn(),
  getDataAssetDetails: vi.fn(),
}));

vi.mock('../services/fhir/dataAssetsService', () => ({
  listDataAssets: serviceMocks.listDataAssets,
  getDataAssetDetails: serviceMocks.getDataAssetDetails,
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
        name: 'Data Assets (Including HL7 FHIR Resources and Custom Resources)',
      }),
    ).toBeTruthy();
    expect(await screen.findAllByText('Read')).toHaveLength(3);
    expect(screen.getAllByText('Supported Interactions')).toHaveLength(3);
    expect(screen.getAllByAltText('HL7 FHIR')).toHaveLength(1);
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(
      screen
        .getByRole('button', {
          name: 'View LegacyResource resource details',
        })
        .querySelector('img[alt="HL7 FHIR"]'),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'View Patient resource details' }),
    );

    expect(await screen.findByText('family')).toBeTruthy();
    const structureSection = screen
      .getByText('Structure definition')
      .closest('section');
    expect(structureSection).toBeTruthy();
    const structure = within(structureSection as HTMLElement);
    expect(structure.getAllByText('Patient').length).toBeGreaterThanOrEqual(2);
    expect(structure.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Flags' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Card.' })).toBeTruthy();
    expect(structure.getByRole('columnheader', { name: 'Type' })).toBeTruthy();
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
