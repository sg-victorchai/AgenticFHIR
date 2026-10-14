import React, { useEffect, useMemo, useState } from 'react';
import {
  CapabilityResource,
  DataAssetDetails,
  OperationDefinitionParameter,
  StructureDefinitionData,
  StructureDefinitionElement,
  getDataAssetDetails,
  listDataAssets,
} from '../services/fhir/dataAssetsService';

interface StructureTreeNode {
  key: string;
  name: string;
  element?: StructureDefinitionElement;
  children: StructureTreeNode[];
}

export const buildStructureTree = (
  definition: StructureDefinitionData | undefined,
  resourceType: string,
): StructureTreeNode => {
  const elements =
    definition?.snapshot?.element ?? definition?.differential?.element ?? [];
  const rootName = definition?.type || resourceType;
  const root: StructureTreeNode = {
    key: rootName,
    name: rootName,
    element: elements.find((element) => element.path === rootName),
    children: [],
  };

  elements.forEach((element) => {
    const segments = element.path.split('.').slice(1);
    if (!segments.length) return;
    let parent = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const slice = isLeaf ? element.sliceName : undefined;
      const key = `${parent.key}.${segment}${slice ? `:${slice}` : ''}`;
      let child = parent.children.find((item) => item.key === key);
      if (!child) {
        child = {
          key,
          name: slice ? `${segment} (${slice})` : segment,
          children: [],
        };
        parent.children.push(child);
      }
      if (isLeaf) child.element = element;
      parent = child;
    });
  });

  return root;
};

const interactionLabel = (code: string) =>
  code.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const resourceProfile = (resource: CapabilityResource) =>
  resource.supportedProfile?.find(Boolean) || resource.profile || '';

const profileOrigin = (profile: string) => {
  if (
    profile.startsWith('http://hl7.org/fhir/') ||
    profile.startsWith('https://hl7.org/fhir/')
  )
    return 'fhir';
  if (profile.startsWith('http://fhir4java.org/')) return 'custom';
  return 'other';
};

const parameterRows = (
  parameters: OperationDefinitionParameter[] | undefined,
  use: string,
): OperationDefinitionParameter[] =>
  (parameters ?? []).filter((parameter) => parameter.use === use);

const ParameterList: React.FC<{
  parameters: OperationDefinitionParameter[];
}> = ({ parameters }) =>
  parameters.length ? (
    <ul className="space-y-1">
      {parameters.map((parameter, index) => (
        <li key={`${parameter.name}-${index}`} className="break-words">
          <span className="font-medium">{parameter.name}</span>
          <span className="text-slate-500">
            {' '}
            ({parameter.type || 'unspecified'}, {parameter.min ?? 0}..
            {parameter.max || '1'})
          </span>
          {parameter.documentation && (
            <span className="block text-slate-500">
              {parameter.documentation}
            </span>
          )}
          {parameter.part && (
            <div className="ml-3 mt-1 border-l border-slate-200 pl-2">
              <ParameterList parameters={parameter.part} />
            </div>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-slate-400">None</span>
  );

interface StructureTreeRow {
  node: StructureTreeNode;
  depth: number;
}

const collectVisibleStructureRows = (
  node: StructureTreeNode,
  expanded: Set<string>,
  depth = 0,
): StructureTreeRow[] => [
  { node, depth },
  ...(expanded.has(node.key)
    ? node.children.flatMap((child) =>
        collectVisibleStructureRows(child, expanded, depth + 1),
      )
    : []),
];

const collectStructureKeys = (node: StructureTreeNode): string[] => [
  node.key,
  ...node.children.flatMap(collectStructureKeys),
];

const StructureDefinitionTable: React.FC<{ tree: StructureTreeNode }> = ({
  tree,
}) => {
  const [expanded, setExpanded] = useState(
    () => new Set(collectStructureKeys(tree)),
  );
  const rows = collectVisibleStructureRows(tree, expanded);

  const toggle = (key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[940px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white text-xs font-semibold text-sky-700 shadow-[0_1px_0_#e2e8f0]">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="w-28 px-3 py-2">Flags</th>
            <th className="w-20 px-3 py-2">Card.</th>
            <th className="w-40 px-3 py-2">Type</th>
            <th className="px-3 py-2">Description &amp; Constraints</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ node, depth }) => {
            const element = node.element;
            const hasChildren = node.children.length > 0;
            const flags = [
              ...(element?.isSummary ? ['Σ'] : []),
              ...(element?.mustSupport ? ['Must support'] : []),
              ...(element?.isModifier ? ['Modifier'] : []),
            ];

            return (
              <tr key={node.key} className="align-top even:bg-slate-50/70">
                <td className="px-3 py-2">
                  <div
                    className="flex min-w-0 items-start gap-1.5"
                    style={{ paddingLeft: `${depth * 18}px` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        aria-label={`${expanded.has(node.key) ? 'Collapse' : 'Expand'} ${node.name}`}
                        aria-expanded={expanded.has(node.key)}
                        onClick={() => toggle(node.key)}
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className={`h-3 w-3 transition-transform ${expanded.has(node.key) ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="m5 3 5 5-5 5" />
                        </svg>
                      </button>
                    ) : (
                      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span
                      className={`min-w-0 break-words ${depth === 0 ? 'font-semibold text-slate-800' : 'text-sky-700'}`}
                    >
                      {node.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {flags.map((flag) => (
                      <span
                        key={flag}
                        className={`rounded border px-1 py-0.5 text-[10px] font-semibold ${flag === 'Modifier' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 bg-slate-50 text-slate-700'}`}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                  {element ? `${element.min ?? 0}..${element.max || '1'}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-sky-700">
                  {element?.type?.length
                    ? element.type
                        .map((type) => type.code)
                        .filter(Boolean)
                        .join(' | ')
                    : '—'}
                </td>
                <td className="max-w-[36rem] px-3 py-2 text-xs leading-relaxed text-slate-700">
                  {element?.short && <p>{element.short}</p>}
                  {element?.definition &&
                    element.definition !== element.short && (
                      <p className="mt-1 text-slate-500">
                        {element.definition}
                      </p>
                    )}
                  {element?.binding && (
                    <p className="mt-1 text-slate-500">
                      Binding: {element.binding.strength || 'unspecified'}
                      {element.binding.valueSet
                        ? ` · ${element.binding.valueSet}`
                        : ''}
                    </p>
                  )}
                  {element?.constraint?.map((constraint) => (
                    <p
                      key={constraint.key || constraint.human}
                      className="mt-1 text-slate-600"
                    >
                      {constraint.key && <strong>{constraint.key}: </strong>}
                      {constraint.human}
                    </p>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const DataAssetsPage: React.FC = () => {
  const [resources, setResources] = useState<CapabilityResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<CapabilityResource | null>(null);
  const [details, setDetails] = useState<DataAssetDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listDataAssets().then(
      (items) => {
        if (!active) return;
        setResources(items);
        setLoadError(null);
        setLoading(false);
      },
      (error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load FHIR data assets.',
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetails(null);
      return;
    }
    let active = true;
    setDetails(null);
    setDetailsLoading(true);
    void getDataAssetDetails(selected).then(
      (result) => {
        if (!active) return;
        setDetails(result);
        setDetailsLoading(false);
      },
      () => {
        if (!active) return;
        setDetailsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [selected]);

  const visibleResources = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return resources;
    return resources.filter((resource) =>
      `${resource.type} ${resource.supportedProfile?.join(' ') ?? ''}`
        .toLowerCase()
        .includes(value),
    );
  }, [filter, resources]);

  const structureTree = useMemo(
    () =>
      selected
        ? buildStructureTree(details?.structureDefinition, selected.type)
        : null,
    [details?.structureDefinition, selected],
  );
  const selectedProfile = selected ? resourceProfile(selected) : '';
  const selectedProfileOrigin = profileOrigin(selectedProfile);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Platform catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Data Assets (Including HL7 FHIR Resources and Custom Resources)
          </h1>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span aria-hidden="true">←</span>
            Back to Data Assets
          </button>
        )}
      </div>

      {!selected && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Filter data assets</span>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter resources by name or profile..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <span className="text-xs text-slate-500">
              {resources.length} available resource types
            </span>
          </div>

          {loading && (
            <p
              className="py-12 text-center text-sm text-slate-500"
              role="status"
            >
              Loading FHIR resources...
            </p>
          )}
          {loadError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              Unable to load data assets: {loadError}
            </div>
          )}
          {!loading && !loadError && (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleResources.map((resource) => (
                <button
                  key={resource.type}
                  type="button"
                  onClick={() => setSelected(resource)}
                  className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-50/30 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  aria-label={`View ${resource.type} resource details`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold text-slate-900 group-hover:text-cyan-800">
                        {resource.type}
                      </h2>
                      {resourceProfile(resource) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {profileOrigin(resourceProfile(resource)) ===
                          'fhir' ? (
                            <img
                              src="https://hl7.org/fhir/assets/images/fhir-logo.png"
                              alt="HL7 FHIR"
                              title="HL7 FHIR"
                              className="h-6 w-auto max-w-24 object-contain object-left"
                            />
                          ) : profileOrigin(resourceProfile(resource)) ===
                            'custom' ? (
                            <span className="rounded bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                              Custom
                            </span>
                          ) : null}
                          <span className="break-all font-mono text-[10px] text-slate-400">
                            {resourceProfile(resource)}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-slate-400"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Supported Interactions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(resource.interaction ?? []).map((interaction) => (
                        <span
                          key={interaction.code}
                          className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600"
                        >
                          {interactionLabel(interaction.code)}
                        </span>
                      ))}
                      {!resource.interaction?.length && (
                        <span className="text-xs text-slate-400">
                          None declared
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {visibleResources.length === 0 && (
                <p className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No resource types match this filter.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                    Structure definition
                  </p>
                  <h2 className="mt-1 break-words text-xl font-semibold text-slate-900">
                    {selected.type}
                  </h2>
                  {selectedProfile && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {selectedProfileOrigin === 'fhir' ? (
                        <a
                          href="https://hl7.org/fhir/index.html"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center"
                        >
                          <img
                            src="https://hl7.org/fhir/assets/images/fhir-logo.png"
                            alt="HL7 FHIR"
                            className="h-6 w-auto max-w-24 object-contain object-left"
                          />
                        </a>
                      ) : selectedProfileOrigin === 'custom' ? (
                        <span className="rounded bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Custom
                        </span>
                      ) : null}
                      <p className="break-all font-mono text-xs text-slate-500">
                        {details?.structureDefinition?.url || selectedProfile}
                      </p>
                    </div>
                  )}
                </div>
                {details?.structureDefinition && (
                  <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase text-slate-600">
                    {details.structureDefinition.kind || 'resource'}
                    {details.structureDefinition.derivation
                      ? ` · ${details.structureDefinition.derivation}`
                      : ''}
                  </span>
                )}
              </div>
            </div>
            {detailsLoading && (
              <p className="py-8 text-sm text-slate-500" role="status">
                Loading resource definition and operations...
              </p>
            )}
            {!detailsLoading && details?.structureDefinitionError && (
              <p role="status" className="text-sm text-amber-800">
                StructureDefinition unavailable:{' '}
                {details.structureDefinitionError}
              </p>
            )}
            {!detailsLoading &&
              structureTree &&
              (structureTree.children.length || structureTree.element ? (
                <StructureDefinitionTable tree={structureTree} />
              ) : (
                <p className="text-sm text-slate-500">
                  No snapshot elements are available for this resource.
                </p>
              ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-slate-900">
                Search Parameters
              </h2>
            </div>
            {(selected.searchParam ?? []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Name</th>
                      <th className="px-4 py-2 font-semibold">Type</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selected.searchParam?.map((parameter) => (
                      <tr key={parameter.name}>
                        <td className="px-4 py-2 font-mono text-xs font-medium text-slate-800">
                          {parameter.name}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">
                          {parameter.type || '—'}
                        </td>
                        <td className="max-w-xl px-4 py-2 text-xs leading-relaxed text-slate-600">
                          {parameter.documentation || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-slate-500">
                No search parameters are declared for this resource.
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-slate-900">
                Operations
              </h2>
            </div>
            {detailsLoading ? (
              <p className="px-4 py-5 text-sm text-slate-500" role="status">
                Loading operation definitions...
              </p>
            ) : details?.operations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Operation</th>
                      <th className="px-4 py-2 font-semibold">
                        Input parameters
                      </th>
                      <th className="px-4 py-2 font-semibold">
                        Output parameters
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 align-top">
                    {details.operations.map((operation, index) => (
                      <tr key={`${operation.capability.name}-${index}`}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-800">
                            {operation.capability.name}
                          </p>
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                            {operation.capability.definition ||
                              'OperationDefinition'}
                          </p>
                          {operation.error && (
                            <p className="mt-1 text-xs text-amber-700">
                              Definition unavailable: {operation.error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <ParameterList
                            parameters={parameterRows(
                              operation.definition?.parameter,
                              'in',
                            )}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <ParameterList
                            parameters={parameterRows(
                              operation.definition?.parameter,
                              'out',
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-slate-500">
                No operations are declared for this resource.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default DataAssetsPage;
