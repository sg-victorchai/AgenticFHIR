import { createFHIRClient } from './client';

export interface CapabilitySearchParameter {
  name: string;
  type?: string;
  documentation?: string;
  definition?: string;
}

export interface CapabilityOperation {
  name: string;
  definition?: string;
}

export interface CapabilityResource {
  type: string;
  profile?: string;
  supportedProfile?: string[];
  interaction?: Array<{ code: string } & Record<string, unknown>>;
  searchParam?: CapabilitySearchParameter[];
  operation?: CapabilityOperation[];
}

export interface StructureDefinitionElement {
  id?: string;
  path: string;
  sliceName?: string;
  short?: string;
  definition?: string;
  min?: number;
  max?: string;
  type?: Array<{ code?: string; targetProfile?: string[] }>;
  representation?: string[];
  contentReference?: string;
  mustSupport?: boolean;
  isModifier?: boolean;
  isSummary?: boolean;
  isModifierReason?: string;
  constraint?: Array<{
    key?: string;
    severity?: string;
    human?: string;
  }>;
  binding?: {
    strength?: string;
    valueSet?: string;
  };
}

export interface StructureDefinitionData {
  resourceType?: string;
  id?: string;
  url?: string;
  name?: string;
  title?: string;
  description?: string;
  type?: string;
  kind?: string;
  derivation?: string;
  baseDefinition?: string;
  snapshot?: { element?: StructureDefinitionElement[] };
  differential?: { element?: StructureDefinitionElement[] };
}

export interface OperationDefinitionParameter {
  name: string;
  use?: 'in' | 'out' | string;
  min?: number;
  max?: string;
  type?: string;
  documentation?: string;
  part?: OperationDefinitionParameter[];
}

export interface OperationDefinitionData {
  resourceType?: string;
  id?: string;
  name?: string;
  title?: string;
  code?: string;
  system?: boolean;
  type?: boolean;
  instance?: boolean;
  parameter?: OperationDefinitionParameter[];
}

export interface DataAssetOperation {
  capability: CapabilityOperation;
  definition?: OperationDefinitionData;
  error?: string;
}

export interface DataAssetDetails {
  structureDefinition?: StructureDefinitionData;
  structureDefinitionError?: string;
  operations: DataAssetOperation[];
}

interface CapabilityStatementData {
  rest?: Array<{ resource?: CapabilityResource[] }>;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The FHIR server request failed.';

const operationDefinitionId = (operation: CapabilityOperation) => {
  const reference = operation.definition?.split('|')[0];
  const id = reference?.split('/').filter(Boolean).pop();
  return id || operation.name.replace(/^\$/, '');
};

export const listDataAssets = async (): Promise<CapabilityResource[]> => {
  const client = await createFHIRClient();
  const metadata = (await client.request(
    'metadata',
  )) as CapabilityStatementData;
  return metadata.rest?.flatMap((rest) => rest.resource ?? []) ?? [];
};

export const getDataAssetDetails = async (
  resource: CapabilityResource,
): Promise<DataAssetDetails> => {
  const client = await createFHIRClient();
  const operations = resource.operation ?? [];

  const [structureResult, operationResults] = await Promise.all([
    client
      .read({ resourceType: 'StructureDefinition', id: resource.type })
      .then(
        (definition) => ({ definition: definition as StructureDefinitionData }),
        (error: unknown) => ({ error: errorMessage(error) }),
      ),
    Promise.all(
      operations.map(async (operation): Promise<DataAssetOperation> => {
        try {
          const definition = await client.read({
            resourceType: 'OperationDefinition',
            id: operationDefinitionId(operation),
          });
          return {
            capability: operation,
            definition: definition as OperationDefinitionData,
          };
        } catch (error) {
          return { capability: operation, error: errorMessage(error) };
        }
      }),
    ),
  ]);

  return {
    structureDefinition:
      'definition' in structureResult ? structureResult.definition : undefined,
    structureDefinitionError:
      'error' in structureResult ? structureResult.error : undefined,
    operations: operationResults,
  };
};
