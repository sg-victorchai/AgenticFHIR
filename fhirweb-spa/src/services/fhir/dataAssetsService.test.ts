import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFHIRClient: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
}));

vi.mock('./client', () => ({
  createFHIRClient: mocks.createFHIRClient,
}));

import { getDataAssetDetails, listDataAssets } from './dataAssetsService';

afterEach(() => {
  vi.clearAllMocks();
});

describe('FHIR data assets service', () => {
  it('lists resource declarations from CapabilityStatement metadata', async () => {
    const resources = [
      {
        type: 'AbacPolicy',
        supportedProfile: [
          'http://fhir4java.org/StructureDefinition/AbacPolicy',
        ],
        interaction: [{ code: 'read' }],
      },
    ];
    mocks.request.mockResolvedValue({ rest: [{ resource: resources }] });
    mocks.createFHIRClient.mockResolvedValue({
      request: mocks.request,
      read: mocks.read,
    });

    await expect(listDataAssets()).resolves.toEqual(resources);
    expect(mocks.request).toHaveBeenCalledWith('metadata');
  });

  it('loads a custom resource definition and its linked operation definitions', async () => {
    const structureDefinition = {
      resourceType: 'StructureDefinition',
      id: 'AbacPolicy',
    };
    const operationDefinition = {
      resourceType: 'OperationDefinition',
      id: 'validate',
      parameter: [{ name: 'resource', use: 'in', type: 'Resource' }],
    };
    mocks.read
      .mockResolvedValueOnce(structureDefinition)
      .mockResolvedValueOnce(operationDefinition);
    mocks.createFHIRClient.mockResolvedValue({
      request: mocks.request,
      read: mocks.read,
    });

    const result = await getDataAssetDetails({
      type: 'AbacPolicy',
      supportedProfile: ['http://fhir4java.org/StructureDefinition/AbacPolicy'],
      operation: [
        { name: '$validate', definition: 'OperationDefinition/validate' },
      ],
    });

    expect(mocks.read).toHaveBeenNthCalledWith(1, {
      resourceType: 'StructureDefinition',
      id: 'AbacPolicy',
    });
    expect(mocks.read).toHaveBeenNthCalledWith(2, {
      resourceType: 'OperationDefinition',
      id: 'validate',
    });
    expect(result.structureDefinition).toEqual(structureDefinition);
    expect(result.operations[0].definition).toEqual(operationDefinition);
  });
});
