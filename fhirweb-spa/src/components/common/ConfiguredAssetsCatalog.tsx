import { useEffect, useState } from 'react';
import {
  AssetBusinessRule,
  assignConfiguredAssetWorkflow,
  ConfiguredAsset,
  ConfiguredAssetDetail,
  disableConfiguredAsset,
  findWorkflowDefinition,
  getStorageArtifacts,
  getAssetBusinessRules,
  getConfiguredAsset,
  getConfiguredAssetWorkflow,
  listConfiguredAssets,
  listWorkflowDefinitions,
  removeConfiguredAssetWorkflow,
  WorkflowAction,
  WorkflowConditionalRoute,
  WorkflowDefinition,
  WorkflowMutation,
  WorkflowPrerequisite,
  WorkflowStage,
} from '../../services/configuredAssetsService';
import BusinessRuleManager from './BusinessRuleManager';
import EventTriggerManager from './EventTriggerManager';
import ServiceOnboarding from './ServiceOnboarding';
import AiBrandIcon from './AiBrandIcon';
import ExpandableIntro from './ExpandableIntro';
import { getOidcUser, hasRealmRole } from '../../services/auth/oidc';
import JSZip from 'jszip';

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load configured assets.';
const controlClass =
  'rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100';
const sourceLabel = (source: string) =>
  source === 'platform' ? 'Platform' : source === 'portal' ? 'Portal' : source;
const defaultSkill = 'fhir4java-model-resource-entity';

const workflowPrerequisites = (value: unknown): WorkflowPrerequisite[] => {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.filter(
    (entry): entry is WorkflowPrerequisite =>
      Boolean(entry) && typeof entry === 'object',
  );
};

const conditionalRoutes = (value: unknown): WorkflowConditionalRoute[] => {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const route = entry as Record<string, unknown>;
    const stage = route.toStage ?? route.stage;
    if (typeof stage !== 'string') return [];
    return [
      {
        ...(typeof route.conditionQuery === 'string'
          ? { conditionQuery: route.conditionQuery }
          : typeof route.condition === 'string'
            ? { conditionQuery: route.condition }
            : {}),
        toStage: stage,
        fhirMutation: Array.isArray(route.fhirMutation)
          ? (route.fhirMutation as WorkflowMutation[])
          : undefined,
      },
    ];
  });
};

const transitionAction = (action: WorkflowAction) =>
  action.actionType?.toLowerCase() === 'transition';

const transitionTargets = (action: WorkflowAction) => [
  ...conditionalRoutes(action.conditionalToStage).map((route) => route.toStage),
  ...(action.toStage ? [action.toStage] : []),
];

const isTerminalStage = (stage: WorkflowStage) =>
  stage.uiHint?.terminal === true || !(stage.action?.length ?? 0);

const orderWorkflowStages = (stages: WorkflowStage[]): WorkflowStage[] => {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  const incoming = new Set(
    stages.flatMap((stage) =>
      (stage.action ?? []).filter(transitionAction).flatMap(transitionTargets),
    ),
  );
  const ordered: WorkflowStage[] = [];
  const visited = new Set<string>();
  const visit = (stageId: string) => {
    if (visited.has(stageId)) return;
    visited.add(stageId);
    const stage = byId.get(stageId);
    if (!stage) return;
    if (isTerminalStage(stage)) return;
    ordered.push(stage);
    (stage.action ?? [])
      .filter(transitionAction)
      .flatMap(transitionTargets)
      .forEach(visit);
  };

  stages
    .filter((stage) => !incoming.has(stage.stageId) && !isTerminalStage(stage))
    .forEach((stage) => visit(stage.stageId));
  stages
    .filter((stage) => !isTerminalStage(stage) && !visited.has(stage.stageId))
    .forEach((stage) => visit(stage.stageId));
  return [...ordered, ...stages.filter((stage) => isTerminalStage(stage))];
};

const workflowPrimaryPath = (stages: WorkflowStage[]): string[] => {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  const incoming = new Set(
    stages.flatMap((stage) =>
      (stage.action ?? []).filter(transitionAction).flatMap(transitionTargets),
    ),
  );
  const start = stages.find(
    (stage) => !incoming.has(stage.stageId) && !isTerminalStage(stage),
  );
  if (!start) return [];

  const path: string[] = [];
  const visited = new Set<string>();
  let current: WorkflowStage | undefined = start;
  while (current && !visited.has(current.stageId)) {
    visited.add(current.stageId);
    path.push(current.stageId);
    const destinations = (current.action ?? [])
      .filter(transitionAction)
      .flatMap((action) => [
        ...(action.toStage ? [action.toStage] : []),
        ...conditionalRoutes(action.conditionalToStage).map(
          (route) => route.toStage,
        ),
      ]);
    const nextActive = destinations.find((id) => {
      const candidate = byId.get(id);
      return candidate && !isTerminalStage(candidate);
    });
    if (nextActive) {
      current = byId.get(nextActive);
      continue;
    }
    const terminal = destinations.find((id) => {
      const candidate = byId.get(id);
      return candidate && isTerminalStage(candidate);
    });
    if (terminal) path.push(terminal);
    break;
  }
  return path;
};

const workflowTerminalRoutes = (
  stages: WorkflowStage[],
  primaryPath: string[],
) =>
  stages.flatMap((stage) =>
    (stage.action ?? [])
      .filter(transitionAction)
      .flatMap((action) => transitionTargets(action))
      .filter((target) => {
        const targetStage = stages.find(
          (candidate) => candidate.stageId === target,
        );
        return (
          targetStage &&
          isTerminalStage(targetStage) &&
          !primaryPath.includes(target)
        );
      })
      .map((target) => `${stage.stageId} → ${target}`),
  );

function WorkflowMutationDetails({
  mutations,
  label = 'FHIR mutations',
}: {
  mutations?: WorkflowMutation[];
  label?: string;
}) {
  if (!mutations?.length) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-slate-600">
        {label} ({mutations.length})
      </summary>
      <ol className="mt-1 space-y-1 pl-4">
        {mutations.map((mutation, index) => (
          <li
            key={`${mutation.sequenceNumber ?? index}-${index}`}
            className="break-words"
          >
            <span className="text-slate-500">
              {mutation.sequenceNumber ?? index + 1}.{' '}
              {mutation.mutationType || 'mutation'}
            </span>{' '}
            <code>{mutation.expression || 'No expression provided'}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}

function AssetSection({
  title,
  expanded,
  children,
  action,
  summaryContent,
}: {
  title: string;
  expanded: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
  summaryContent?: React.ReactNode;
}) {
  return (
    <details open={expanded} className="group border-b border-slate-200 py-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 text-base font-semibold text-slate-900">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden="true"
            className="text-slate-500 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <span>{title}</span>
        </span>
        {action && (
          <span onClick={(event) => event.stopPropagation()}>{action}</span>
        )}
        {summaryContent && (
          <div className="basis-full pl-7">{summaryContent}</div>
        )}
      </summary>
      <div className="mt-3 min-w-0 text-sm text-slate-700">{children}</div>
    </details>
  );
}

function AiActionLabel({ children }: { children: string }) {
  return (
    <>
      <AiBrandIcon />
      <span>{children}</span>
    </>
  );
}

export default function ConfiguredAssetsCatalog({
  onViewResource,
}: {
  onViewResource?: (resourceType: string) => void;
}) {
  const [canManage, setCanManage] = useState(false);
  const [canDeleteAssets, setCanDeleteAssets] = useState(false);
  const [assets, setAssets] = useState<ConfiguredAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConfiguredAssetDetail | null>(null);
  const [rules, setRules] = useState<AssetBusinessRule[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowDetailsOpen, setWorkflowDetailsOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [workflowIdentifier, setWorkflowIdentifier] = useState('');
  const [workflowSuggestions, setWorkflowSuggestions] = useState<
    WorkflowDefinition[]
  >([]);
  const [workflowSuggestionsLoading, setWorkflowSuggestionsLoading] =
    useState(false);
  const [workflowVerified, setWorkflowVerified] =
    useState<WorkflowDefinition | null>(null);
  const [workflowDialogError, setWorkflowDialogError] = useState<string | null>(
    null,
  );
  const [workflowActionError, setWorkflowActionError] = useState<string | null>(
    null,
  );
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [openAddRuleOnRulesView, setOpenAddRuleOnRulesView] = useState(false);
  const [view, setView] = useState<
    'detail' | 'rules' | 'triggers' | 'sessions' | 'onboarding'
  >('detail');
  const [onboardingLaunch, setOnboardingLaunch] = useState<{
    context: 'new' | 'storage' | 'rule' | 'reconcile';
    entrySkill: string;
    entityName?: string;
    phase?: number;
  }>({ context: 'new', entrySkill: 'fhir4java-model-resource-entity' });
  const [updateMenuOpen, setUpdateMenuOpen] = useState(false);
  const [returnToSection, setReturnToSection] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const setPermissions = (accessToken: string | null) => {
      const platformAdmin = hasRealmRole(accessToken, 'PLATFORM_ADMIN');
      setCanDeleteAssets(platformAdmin);
      setCanManage(
        platformAdmin ||
          hasRealmRole(accessToken, 'POWER_USER') ||
          hasRealmRole(accessToken, 'agentbuilder'),
      );
    };
    void getOidcUser().then((user) => {
      if (active) setPermissions(user?.access_token || null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setRulesError(null);
    setDetail(null);
    setRules([]);
    setWorkflow(null);
    setWorkflowError(null);
    setWorkflowDetailsOpen(false);
    const load = async () => {
      if (!selected) {
        const result = await listConfiguredAssets();
        if (active) setAssets(result);
        return;
      }
      const [assetResult, rulesResult] = await Promise.allSettled([
        getConfiguredAsset(selected),
        getAssetBusinessRules(selected),
      ]);
      if (!active) return;
      if (assetResult.status === 'fulfilled') setDetail(assetResult.value);
      else throw assetResult.reason;
      if (rulesResult.status === 'fulfilled') setRules(rulesResult.value);
      else setRulesError(messageFor(rulesResult.reason));
      if (assetResult.value.workflowName) {
        setWorkflowLoading(true);
        const workflowResult = await getConfiguredAssetWorkflow(selected).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        );
        if (!active) return;
        if (workflowResult.status === 'fulfilled') {
          setWorkflow(workflowResult.value);
          setWorkflowError(null);
        } else {
          setWorkflowError(messageFor(workflowResult.reason));
        }
        setWorkflowLoading(false);
      }
    };
    void load()
      .catch((failure) => {
        if (active) setError(messageFor(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, attempt]);

  useEffect(() => {
    if (!returnToSection || loading || !detail) return;
    document.getElementById(returnToSection)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    setReturnToSection(null);
  }, [returnToSection, loading, detail]);

  const visible = assets.filter((asset) =>
    `${asset.resourceType} ${asset.workflowName || ''} ${asset.authoringSource}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const expanded = detail?.authoringSource === 'platform';
  const workflowBootstrap = rules.find(
    (rule) => rule.pluginId === 'workflow-bootstrap',
  );
  const activeWorkflowRule =
    rules.find(
      (rule) =>
        rule.pluginId === 'workflow-bootstrap' &&
        rule.authoringSource === 'platform' &&
        rule.enabled,
    ) ||
    rules.find(
      (rule) => rule.pluginId === 'workflow-bootstrap' && rule.enabled,
    );
  const stages = workflowBootstrap?.properties?.['conditional-initial-stages'];
  const resourceArticle =
    detail && /^[aeiou]/i.test(detail.resourceType) ? 'an' : 'a';
  const mappings = Array.isArray(stages)
    ? stages.filter((stage): stage is { condition: string; stage: string } =>
        Boolean(
          stage &&
          typeof stage === 'object' &&
          typeof stage.condition === 'string' &&
          typeof stage.stage === 'string',
        ),
      )
    : [];
  const workflowStages = orderWorkflowStages(workflow?.stage ?? []);
  const primaryWorkflowPath = workflowPrimaryPath(workflowStages);
  const conditionalWorkflowRoutes = workflowStages.flatMap((stage) =>
    (stage.action ?? []).filter(transitionAction).flatMap((action) =>
      conditionalRoutes(action.conditionalToStage).map((route) => ({
        from: stage.stageId,
        condition: route.conditionQuery,
        to: route.toStage,
      })),
    ),
  );
  const terminalWorkflowRoutes = workflowTerminalRoutes(
    workflowStages,
    primaryWorkflowPath,
  );
  const transitionCount = workflowStages.reduce((count, stage) => {
    const actions = (stage.action ?? []).filter(transitionAction);
    return (
      count +
      actions.reduce(
        (total, action) =>
          total +
          (action.toStage ? 1 : 0) +
          conditionalRoutes(action.conditionalToStage).length,
        0,
      )
    );
  }, 0);

  const openWorkflowDialog = () => {
    setWorkflowIdentifier(detail?.workflowName || '');
    setWorkflowVerified(null);
    setWorkflowDialogError(null);
    setWorkflowDialogOpen(true);
    setWorkflowSuggestionsLoading(true);
    void listWorkflowDefinitions()
      .then(
        (bundle) => {
          setWorkflowSuggestions(
            (bundle.entry || [])
              .map((entry) => entry.resource)
              .filter((resource): resource is WorkflowDefinition =>
                Boolean(resource),
              ),
          );
        },
        () => setWorkflowSuggestions([]),
      )
      .finally(() => setWorkflowSuggestionsLoading(false));
  };

  const verifyWorkflowIdentifier = async () => {
    const value = workflowIdentifier.trim();
    if (!value) {
      setWorkflowDialogError('WorkflowDefinition identifier is required.');
      setWorkflowVerified(null);
      return;
    }
    setWorkflowDialogError(null);
    setWorkflowVerified(null);
    try {
      const bundle = await findWorkflowDefinition(value);
      const match = (bundle.entry || [])
        .map((entry) => entry.resource)
        .find((candidate) =>
          candidate?.identifier?.some(
            (identifier) => identifier.value === value,
          ),
        );
      if (!match) {
        setWorkflowDialogError(
          `No WorkflowDefinition was found for identifier “${value}”.`,
        );
        return;
      }
      setWorkflowVerified(match);
    } catch (failure) {
      setWorkflowDialogError(
        failure instanceof Error
          ? failure.message
          : 'Unable to verify this workflow identifier.',
      );
    }
  };

  const saveWorkflowAssignment = async () => {
    if (!selected || !workflowVerified) return;
    setWorkflowSaving(true);
    setWorkflowDialogError(null);
    try {
      await assignConfiguredAssetWorkflow(selected, workflowIdentifier.trim());
      setWorkflowDialogOpen(false);
      setWorkflowActionError(null);
      setAttempt((value) => value + 1);
    } catch (failure) {
      setWorkflowDialogError(
        failure instanceof Error
          ? failure.message
          : 'Unable to assign this workflow.',
      );
    } finally {
      setWorkflowSaving(false);
    }
  };

  const removeWorkflowAssignment = async () => {
    if (
      !selected ||
      !detail?.workflowName ||
      activeWorkflowRule?.authoringSource === 'platform'
    )
      return;
    if (
      !window.confirm(
        `Remove the workflow assignment for ${selected}? The WorkflowDefinition itself will not be deleted.`,
      )
    )
      return;
    setWorkflowSaving(true);
    setWorkflowDialogError(null);
    try {
      await removeConfiguredAssetWorkflow(selected);
      setAttempt((value) => value + 1);
    } catch (failure) {
      setWorkflowActionError(
        failure instanceof Error
          ? failure.message
          : 'Unable to remove this workflow assignment.',
      );
    } finally {
      setWorkflowSaving(false);
    }
  };

  const launchOnboarding = (
    context: 'new' | 'storage' | 'rule' | 'reconcile',
    entrySkill: string,
    entityName = '',
    phase?: number,
  ) => {
    setOnboardingLaunch({ context, entrySkill, entityName, phase });
    setUpdateMenuOpen(false);
    setView('onboarding');
  };

  const downloadAssetStorageArtifacts = async () => {
    if (!detail) return;
    const saved = getStorageArtifacts(detail.resourceType);
    if (!saved?.[1].artifacts.length) return;
    const zip = new JSZip();
    saved[1].artifacts.forEach((artifact) =>
      zip.file(artifact.fileName, artifact.content),
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${detail.resourceType}-storage-artifacts.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {selected && view !== 'onboarding' && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 break-words text-xl font-semibold text-slate-900">
            {view === 'rules'
              ? `Business Rules — ${selected}`
              : view === 'triggers'
                ? `Event Triggers — ${selected}`
                : view === 'sessions'
                  ? 'My Sessions'
                  : selected}
          </h2>
          <button
            type="button"
            className="max-w-full rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100 hover:text-cyan-950 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
            onClick={() => {
              if (view === 'rules' || view === 'triggers') setView('detail');
              else if (view === 'sessions') {
                setView('detail');
                setSelected(null);
              } else {
                setSelected(null);
                setFilter('');
              }
            }}
          >
            {view === 'rules' || view === 'triggers'
              ? 'Back to Asset Detail'
              : 'Back to Asset List'}
          </button>
          {view === 'detail' &&
            detail?.authoringSource === 'portal' &&
            canManage && (
              <div className="relative ml-auto flex">
                <button
                  type="button"
                  onClick={() =>
                    launchOnboarding(
                      'reconcile',
                      'fhir4java-model-resource-entity',
                      selected,
                      1,
                    )
                  }
                  className="rounded-l border border-cyan-800 bg-cyan-800 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-900"
                >
                  Update with AI ✦
                </button>
                <button
                  type="button"
                  aria-label="Choose Update with AI phase"
                  aria-expanded={updateMenuOpen}
                  onClick={() => setUpdateMenuOpen((open) => !open)}
                  className="rounded-r border border-l border-cyan-700 bg-cyan-800 px-2.5 py-2 text-sm font-semibold text-white hover:bg-cyan-900"
                >
                  ▾
                </button>
                {updateMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-64 border border-slate-200 bg-white py-1 shadow-lg">
                    {[
                      [
                        'Update model / fields',
                        'fhir4java-model-resource-entity',
                        1,
                      ],
                      [
                        'Update APIs / search params',
                        'fhir4java-define-entity-apis',
                        2,
                      ],
                      [
                        'Update workflow',
                        'fhir4java-model-business-workflow',
                        3,
                      ],
                      ['Update data source', 'fhir4java-map-entity-storage', 4],
                    ].map(([label, skill, phase]) => (
                      <button
                        key={String(skill)}
                        type="button"
                        onClick={() =>
                          launchOnboarding(
                            'reconcile',
                            String(skill),
                            selected,
                            Number(phase),
                          )
                        }
                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50"
                      >
                        {String(label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      )}
      {loading && (
        <p role="status" className="py-8 text-sm text-slate-500">
          Loading {selected ? 'asset configuration' : 'configured assets'}...
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="border-l-4 border-rose-400 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}{' '}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {!selected && view === 'detail' && !loading && !error && (
        <>
          <ExpandableIntro>
            Data Foundry provides a governed foundation for the data your
            business depends on. Define standard FHIR resources or create custom
            resources tailored to your domain, then store data within the
            platform or connect existing databases and APIs. A consistent FHIR
            interface, combined with configurable workflows, business rules, and
            reliable event delivery, helps your applications and AI agents work
            from trusted, interoperable data. The platform normalizes
            terminology to create a semantic ontology layer that helps AI agents
            understand how data concepts relate across resources and systems—all
            without forcing a wholesale migration or custom integration for
            every system.
          </ExpandableIntro>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3 sm:flex-1">
              <input
                aria-label="Filter configured assets"
                placeholder="Filter by resource, source, or workflow..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
              <span className="shrink-0 text-xs text-slate-500">
                {assets.length} data assets
              </span>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => setView('sessions')}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  My Sessions
                </button>
                <button
                  type="button"
                  onClick={() => launchOnboarding('new', defaultSkill)}
                  className="rounded bg-cyan-800 px-3 py-2 text-sm font-semibold text-white"
                >
                  + New Asset
                </button>
              </div>
            )}
          </div>
          {assetActionError && (
            <p role="alert" className="mb-3 text-sm text-rose-700">
              {assetActionError}
            </p>
          )}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((asset) => (
              <article
                key={asset.resourceType}
                className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <button
                  type="button"
                  aria-label={`View ${asset.resourceType} configuration`}
                  onClick={() => {
                    setSelected(asset.resourceType);
                    setView('detail');
                  }}
                  className="w-full text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                >
                  <h2 className="break-words text-base font-semibold text-slate-900">
                    {asset.resourceType}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded px-2 py-1 ${asset.authoringSource === 'portal' ? 'bg-cyan-50 text-cyan-800' : 'bg-slate-100 text-slate-700'}`}
                    >
                      {sourceLabel(asset.authoringSource)}
                    </span>
                    <span
                      className={
                        asset.enabled ? 'text-emerald-700' : 'text-slate-500'
                      }
                    >
                      {asset.enabled ? 'Active' : 'Disabled'}
                    </span>
                    <span>{asset.fhirVersions.join(', ')}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {asset.businessRuleCount} business rules
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {asset.workflowName || 'No workflow configured'}
                  </p>
                </button>
                {canDeleteAssets &&
                  asset.authoringSource === 'portal' &&
                  asset.enabled && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Disable ${asset.resourceType}? Existing records are preserved; the resource type will no longer accept new writes.`,
                          )
                        )
                          return;
                        setAssetActionError(null);
                        try {
                          await disableConfiguredAsset(asset.resourceType);
                          setAssets((current) =>
                            current.map((item) =>
                              item.resourceType === asset.resourceType
                                ? { ...item, enabled: false }
                                : item,
                            ),
                          );
                        } catch (failure) {
                          setAssetActionError(
                            failure instanceof Error
                              ? failure.message
                              : 'Unable to disable this data asset.',
                          );
                        }
                      }}
                      className="mt-3 text-xs font-medium text-rose-700 underline"
                    >
                      Disable asset
                    </button>
                  )}
              </article>
            ))}
            {!visible.length && (
              <p className="col-span-full py-8 text-center text-sm text-slate-500">
                {assets.length
                  ? 'No data assets match this filter.'
                  : 'No data assets are configured.'}
              </p>
            )}
          </div>
        </>
      )}
      {detail && !loading && !error && view === 'detail' && (
        <>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>{sourceLabel(detail.authoringSource)}</span>
            <span>{detail.fhirVersions.join(', ')}</span>
            <span>{detail.enabled ? 'Active' : 'Disabled'}</span>
          </div>
          {detail.authoringSource === 'platform' && (
            <p className="mt-3 border-l-4 border-slate-300 bg-slate-100 p-3 text-sm text-slate-600">
              Platform configuration is read-only. Changes to base rules and
              workflows must be made in the codebase.
            </p>
          )}
          <nav
            aria-label="Asset sections"
            className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-cyan-700"
          >
            {[
              [
                'Interactions',
                Object.values(detail.interactions).filter(Boolean).length,
              ],
              ['Search Parameters', ''],
              ['Business Rules', detail.businessRuleCount],
              ['Event Triggers', detail.eventTriggerCount],
              ['AI Search', ''],
            ].map(([title, count]) => (
              <button
                key={title}
                type="button"
                className="underline"
                onClick={() => {
                  const section = document.getElementById(
                    `configured-${String(title).replace(/ /g, '-')}`,
                  );
                  const disclosure = section?.querySelector('details');
                  if (disclosure) disclosure.open = true;
                  section?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
              >
                {count} {title}
              </button>
            ))}
          </nav>
          <div id="configured-Interactions">
            <AssetSection title="Interactions" expanded={expanded}>
              <div className="flex flex-wrap gap-2">
                {Object.entries(detail.interactions).map(
                  ([operation, enabled]) => (
                    <span
                      key={operation}
                      className={`rounded px-2 py-1 text-xs ${enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {operation.toUpperCase()} ·{' '}
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  ),
                )}
              </div>
              <div className="mt-3 space-y-1">
                {detail.profileUrls.map((url) => (
                  <p key={url} className="break-all font-mono text-xs">
                    {url}
                  </p>
                ))}
              </div>
            </AssetSection>
          </div>
          <section
            id="configured-Workflow"
            aria-labelledby="configured-workflow-heading"
            className="border-b border-slate-200 py-4"
          >
            <h3
              id="configured-workflow-heading"
              className="mb-3 text-base font-semibold text-slate-900"
            >
              Workflow
            </h3>
            {!detail.workflowName && (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-3 sm:p-4">
                <p className="text-sm text-slate-600">No workflow assigned.</p>
                {canManage && (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openWorkflowDialog}
                      className="h-11 rounded border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Assign Workflow
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        launchOnboarding(
                          'reconcile',
                          'fhir4java-model-business-workflow',
                          detail.resourceType,
                          3,
                        )
                      }
                      className="inline-flex h-11 items-center gap-2 rounded border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-900 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                    >
                      <AiActionLabel>Author with AI</AiActionLabel>
                    </button>
                  </div>
                )}
              </div>
            )}
            {detail.workflowName && (
              <div className="space-y-3">
                <div className="w-full border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words font-semibold text-slate-900">
                        {workflow?.title ||
                          workflow?.name ||
                          detail.workflowName}
                        {workflow?.name &&
                        workflow?.title &&
                        workflow.name !== workflow.title
                          ? ` (${workflow.name})`
                          : ''}
                      </h4>
                      {activeWorkflowRule?.authoringSource === 'platform' && (
                        <span className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Platform workflow
                        </span>
                      )}
                      {activeWorkflowRule?.authoringSource === 'portal' && (
                        <span className="mt-1 inline-flex rounded bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-800">
                          Portal workflow
                        </span>
                      )}
                    </div>
                    <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                      <span className="basis-full text-xs font-medium text-slate-500 sm:basis-auto">
                        {workflowLoading
                          ? 'Loading steps…'
                          : workflow
                            ? `${workflowStages.length} stages`
                            : 'Workflow details unavailable'}
                      </span>
                      <button
                        type="button"
                        aria-expanded={workflowDetailsOpen}
                        aria-controls="configured-workflow-details"
                        onClick={() => setWorkflowDetailsOpen((open) => !open)}
                        className="max-w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {workflowDetailsOpen
                          ? 'Hide definition'
                          : 'View workflow definition'}
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={openWorkflowDialog}
                            className="max-w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            disabled={
                              activeWorkflowRule?.authoringSource ===
                                'platform' || workflowSaving
                            }
                            title={
                              activeWorkflowRule?.authoringSource === 'platform'
                                ? 'Platform workflows cannot be removed from the portal.'
                                : 'Remove workflow assignment'
                            }
                            onClick={() => void removeWorkflowAssignment()}
                            className="max-w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {workflow && (
                    <div className="mt-3 space-y-3">
                      {primaryWorkflowPath.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Main path
                          </p>
                          <p className="break-words font-mono text-xs leading-relaxed text-slate-800 sm:text-sm">
                            {primaryWorkflowPath.join(' → ')}
                          </p>
                        </div>
                      )}
                      {conditionalWorkflowRoutes.map((route, index) => (
                        <p
                          key={`conditional-summary-${index}`}
                          className="break-words text-xs text-slate-600"
                        >
                          <span className="font-medium">Conditional:</span>{' '}
                          {route.from} → {route.to}
                          {route.condition ? ` · ${route.condition}` : ''}
                        </p>
                      ))}
                      {terminalWorkflowRoutes.length > 0 && (
                        <p className="break-words text-xs text-slate-600">
                          <span className="font-medium">Cancellation:</span>{' '}
                          {terminalWorkflowRoutes.join(' · ')}
                        </p>
                      )}
                      <div className="border-t border-slate-100 pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          When you{' '}
                          {workflowBootstrap?.triggerOperation || 'CREATE'}{' '}
                          {resourceArticle} {detail.resourceType}
                        </p>
                        {mappings.length > 0 ? (
                          <ul className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                            {mappings.map((mapping, index) => (
                              <li
                                key={`${mapping.condition}-${mapping.stage}-${index}`}
                                className="break-words text-xs text-slate-700"
                              >
                                <code>{mapping.condition}</code>{' '}
                                <span aria-hidden="true">→</span>{' '}
                                <strong>{mapping.stage}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : rulesError ? (
                          <p className="text-xs text-amber-800">
                            Initial-stage routing is unavailable because
                            business rules could not be loaded.
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            No initial-stage mappings are configured.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {!workflow && workflowError && (
                    <p role="alert" className="mt-2 text-xs text-amber-800">
                      {workflowError}
                    </p>
                  )}
                </div>
              </div>
            )}
            {workflowDetailsOpen && detail.workflowName && (
              <div
                id="configured-workflow-details"
                className="w-full border border-slate-200 bg-white p-4 sm:p-6"
              >
                {workflowError && (
                  <div
                    role="alert"
                    className="mb-4 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    Full workflow details unavailable: {workflowError}{' '}
                    <button
                      type="button"
                      onClick={() => setAttempt((value) => value + 1)}
                      className="underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {workflow && (
                  <section className="" aria-label="Full workflow definition">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="font-semibold text-slate-900">
                        {workflow.title ||
                          workflow.name ||
                          workflow.id ||
                          detail.workflowName}
                      </h4>
                      <span className="text-xs text-slate-500">
                        {workflowStages.length} stages · {transitionCount}{' '}
                        transitions
                        {workflow.status ? ` · ${workflow.status}` : ''}
                      </span>
                    </div>
                    {(workflow.id ||
                      workflow.identifier?.length ||
                      workflow.meta) && (
                      <details className="mb-3 text-xs text-slate-500">
                        <summary className="cursor-pointer">
                          Definition metadata
                        </summary>
                        <div className="mt-2 space-y-1 break-words">
                          {workflow.id && (
                            <p>FHIR resource ID: {workflow.id}</p>
                          )}
                          {workflow.identifier?.map((identifier, index) => (
                            <p
                              key={`${identifier.system}-${identifier.value}-${index}`}
                            >
                              Identifier: {identifier.value || '—'}
                              {identifier.system
                                ? ` · ${identifier.system}`
                                : ''}
                            </p>
                          ))}
                          {workflow.meta?.versionId && (
                            <p>Version: {workflow.meta.versionId}</p>
                          )}
                          {workflow.meta?.lastUpdated && (
                            <p>Last updated: {workflow.meta.lastUpdated}</p>
                          )}
                          {workflow.meta?.profile?.map((profile) => (
                            <p key={profile}>Definition profile: {profile}</p>
                          ))}
                        </div>
                      </details>
                    )}
                    {workflow.targetResourceProfile && (
                      <p className="mb-3 break-all font-mono text-xs text-slate-500">
                        {workflow.targetResourceProfile}
                      </p>
                    )}
                    {workflowStages.length ? (
                      <ol className="space-y-3">
                        {workflowStages.map((stage, index) => {
                          const actions = stage.action ?? [];
                          return (
                            <li
                              key={stage.stageId}
                              className="relative border-l-2 border-cyan-200 pb-1 pl-4 last:border-transparent"
                            >
                              <span
                                className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-cyan-700"
                                aria-hidden="true"
                              />
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h5 className="font-semibold text-slate-900">
                                    {stage.label || stage.stageId}
                                    {isTerminalStage(stage) && (
                                      <span className="ml-2 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
                                        Terminal
                                      </span>
                                    )}
                                    {stage.optional && (
                                      <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                                        Optional
                                      </span>
                                    )}
                                  </h5>
                                  <p className="font-mono text-xs text-slate-500">
                                    {stage.stageId}
                                  </p>
                                  {stage.uiHint?.icon && (
                                    <p className="mt-1 text-[10px] text-slate-400">
                                      Icon: {stage.uiHint.icon}
                                    </p>
                                  )}
                                </div>
                                {stage.actor && (
                                  <span className="text-xs text-slate-600">
                                    Actor: {stage.actor}
                                  </span>
                                )}
                              </div>
                              {stage.description && (
                                <p className="mt-1 text-sm text-slate-600">
                                  {stage.description}
                                </p>
                              )}
                              {stage.stageExpression && (
                                <p className="mt-2 break-words font-mono text-xs text-slate-600">
                                  Stage condition: {stage.stageExpression}
                                </p>
                              )}
                              {actions.length > 0 && (
                                <ul className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                                  {actions.map((action) => {
                                    if (!transitionAction(action)) {
                                      return (
                                        <li
                                          key={action.actionId}
                                          className="text-sm"
                                        >
                                          <span className="font-medium text-cyan-900">
                                            {action.label || action.actionId}
                                          </span>
                                          <span className="ml-2 text-xs text-slate-500">
                                            (
                                            {[
                                              action.requiredRole?.join(', '),
                                              action.label || action.actionId,
                                            ]
                                              .filter(Boolean)
                                              .join(': ')}
                                            )
                                          </span>
                                          {action.navigationKey && (
                                            <span className="block text-xs text-slate-500">
                                              Navigation: {action.navigationKey}
                                            </span>
                                          )}
                                        </li>
                                      );
                                    }
                                    const conditional = conditionalRoutes(
                                      action.conditionalToStage,
                                    );
                                    const prerequisites = workflowPrerequisites(
                                      action.prerequisite,
                                    );
                                    return (
                                      <li
                                        key={action.actionId}
                                        className="text-sm"
                                      >
                                        {action.toStage && (
                                          <span className="font-medium text-slate-900">
                                            {stage.stageId} → {action.toStage}
                                          </span>
                                        )}
                                        <span className="ml-2 text-cyan-900">
                                          (
                                          {[
                                            action.requiredRole?.join(', '),
                                            action.label || action.actionId,
                                          ]
                                            .filter(Boolean)
                                            .join(': ')}
                                          )
                                        </span>
                                        {prerequisites.map(
                                          (prerequisite, prerequisiteIndex) => (
                                            <div
                                              key={`${action.actionId}-prerequisite-${prerequisiteIndex}`}
                                              className="mt-2 border-l-2 border-amber-300 pl-2 text-xs text-slate-600"
                                            >
                                              <p className="font-medium text-slate-700">
                                                Prerequisite:{' '}
                                                {prerequisite.label ||
                                                  'Required check'}
                                              </p>
                                              {prerequisite.description && (
                                                <p className="mt-0.5">
                                                  {prerequisite.description}
                                                </p>
                                              )}
                                              {prerequisite.checkQuery && (
                                                <code className="mt-1 block break-all">
                                                  {prerequisite.checkQuery}
                                                </code>
                                              )}
                                              {prerequisite.minCount !==
                                                undefined && (
                                                <p className="mt-0.5">
                                                  Minimum matching records:{' '}
                                                  {prerequisite.minCount}
                                                </p>
                                              )}
                                              {prerequisite.onViolation && (
                                                <p className="mt-0.5">
                                                  On failure:{' '}
                                                  {prerequisite.onViolation}
                                                </p>
                                              )}
                                              {prerequisite.navigationKey && (
                                                <p className="mt-0.5">
                                                  Navigation:{' '}
                                                  {prerequisite.navigationKey}
                                                </p>
                                              )}
                                              {prerequisite.profileUrl && (
                                                <p className="mt-0.5 break-all">
                                                  Profile:{' '}
                                                  {prerequisite.profileUrl}
                                                </p>
                                              )}
                                              {prerequisite.resourceTemplate && (
                                                <details className="mt-1">
                                                  <summary className="cursor-pointer">
                                                    Resource template
                                                  </summary>
                                                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-2">
                                                    {
                                                      prerequisite.resourceTemplate
                                                    }
                                                  </pre>
                                                </details>
                                              )}
                                            </div>
                                          ),
                                        )}
                                        {conditional.map(
                                          (route, routeIndex) => (
                                            <div
                                              key={`${action.actionId}-conditional-${routeIndex}`}
                                              className="mt-2 break-words text-xs text-slate-600"
                                            >
                                              <p>
                                                {route.conditionQuery
                                                  ? `When ${route.conditionQuery}: `
                                                  : 'Conditional route: '}
                                                {stage.stageId} →{' '}
                                                {route.toStage}
                                              </p>
                                              <WorkflowMutationDetails
                                                mutations={route.fhirMutation}
                                                label="Conditional FHIR mutations"
                                              />
                                            </div>
                                          ),
                                        )}
                                        {typeof action.guard === 'string' && (
                                          <span className="block break-words font-mono text-xs text-slate-500">
                                            Guard: {action.guard}
                                          </span>
                                        )}
                                        {Array.isArray(action.guard) && (
                                          <span className="block break-words font-mono text-xs text-slate-500">
                                            Guard: {action.guard.join(' · ')}
                                          </span>
                                        )}
                                        <WorkflowMutationDetails
                                          mutations={action.fhirMutation}
                                        />
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                              {!actions.length && !isTerminalStage(stage) && (
                                <p className="mt-2 text-xs text-slate-500">
                                  No transition actions declared.
                                </p>
                              )}
                              {index < workflowStages.length - 1 &&
                                !actions.length &&
                                !isTerminalStage(stage) && (
                                  <span className="sr-only">
                                    No edge to the next listed stage is
                                    declared.
                                  </span>
                                )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No stages are included in this workflow definition.
                      </p>
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
          {workflowActionError && (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {workflowActionError}
            </p>
          )}
          {workflowDialogOpen && selected && (
            <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="workflow-assignment-title"
                className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl sm:p-7"
              >
                <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
                      {detail.workflowName
                        ? 'Change workflow'
                        : 'Assign workflow'}
                    </p>
                    <h3
                      id="workflow-assignment-title"
                      className="mt-1 text-xl font-semibold text-slate-900"
                    >
                      {detail.workflowName
                        ? 'Change workflow'
                        : 'Assign workflow'}{' '}
                      · {selected}
                    </h3>
                  </div>
                  <button
                    type="button"
                    aria-label="Close workflow assignment"
                    onClick={() => setWorkflowDialogOpen(false)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    Close
                  </button>
                </header>
                <label
                  htmlFor="workflow-definition-identifier"
                  className="block text-sm font-medium text-slate-800"
                >
                  WorkflowDefinition identifier
                </label>
                <input
                  id="workflow-definition-identifier"
                  list="workflow-definition-options"
                  value={workflowIdentifier}
                  onChange={(event) => {
                    setWorkflowIdentifier(event.target.value);
                    setWorkflowVerified(null);
                    setWorkflowDialogError(null);
                  }}
                  placeholder="e.g. patient-visit"
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
                <datalist id="workflow-definition-options">
                  {workflowSuggestions.flatMap((definition) =>
                    (definition.identifier || []).flatMap((identifier) =>
                      identifier.value
                        ? [
                            <option
                              key={`${identifier.system}-${identifier.value}`}
                              value={identifier.value}
                              label={`${definition.title || definition.name || identifier.value} (${definition.stage?.length || 0} stages)`}
                            />,
                          ]
                        : [],
                    ),
                  )}
                </datalist>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Enter the identifier.value of an existing WorkflowDefinition.
                  Verify it exists before assigning.
                  {workflowSuggestionsLoading
                    ? ' Loading available workflows…'
                    : workflowSuggestions.length
                      ? ` ${workflowSuggestions.length} workflow definitions available.`
                      : ''}
                </p>
                {workflowVerified && (
                  <div className="mt-4 border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-semibold">
                      {workflowVerified.title || workflowVerified.name}
                    </p>
                    <p className="mt-1">
                      Verified identifier: {workflowIdentifier.trim()} ·{' '}
                      {workflowVerified.stage?.length || 0} stages
                    </p>
                  </div>
                )}
                {workflowDialogError && (
                  <p
                    role="alert"
                    className="mt-4 border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-800"
                  >
                    {workflowDialogError}
                  </p>
                )}
                <footer className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setWorkflowDialogOpen(false)}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      workflowSaving || workflowIdentifier.trim().length === 0
                    }
                    onClick={() => void verifyWorkflowIdentifier()}
                    className="rounded border border-cyan-700 bg-white px-3 py-2 text-sm font-medium text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
                  >
                    {workflowVerified ? 'Re-verify' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    disabled={workflowSaving || !workflowVerified}
                    onClick={() => void saveWorkflowAssignment()}
                    className="rounded bg-cyan-800 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-900 disabled:opacity-50"
                  >
                    {workflowSaving ? 'Saving…' : 'Save'}
                  </button>
                </footer>
              </section>
            </div>
          )}
          <div id="configured-Business-Rules">
            <AssetSection title="Business Rules" expanded={expanded}>
              <p>
                {detail.businessRuleCount} configured rules
                {rulesError
                  ? ' (rule list unavailable)'
                  : ` · ${rules.filter((rule) => rule.enabled).length} enabled`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${controlClass} h-11`}
                  onClick={() => {
                    setOpenAddRuleOnRulesView(false);
                    setView('rules');
                  }}
                >
                  Manage Business Rules
                </button>
                {canManage && (
                  <button
                    type="button"
                    className={`${controlClass} h-11`}
                    onClick={() => {
                      setOpenAddRuleOnRulesView(true);
                      setView('rules');
                    }}
                  >
                    Add Rule
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-900 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                    onClick={() =>
                      launchOnboarding(
                        'rule',
                        'fhir4java-author-business-rule',
                        detail.resourceType,
                      )
                    }
                  >
                    <AiActionLabel>Author with AI</AiActionLabel>
                  </button>
                )}
              </div>
            </AssetSection>
          </div>
          {detail.authoringSource === 'portal' && (
            <div id="configured-Storage">
              <AssetSection title="Storage" expanded={expanded}>
                {!detail.storageDesign?.branch ? (
                  <div className="border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-900">
                      Data source not configured
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {detail.resourceType} currently uses the default internal
                      JSONB store. Configure a data source to use a relational
                      or external store.
                    </p>
                    {canManage && (
                      <button
                        type="button"
                        className={`${controlClass} mt-3`}
                        onClick={() =>
                          launchOnboarding(
                            'storage',
                            'fhir4java-map-entity-storage',
                            detail.resourceType,
                          )
                        }
                      >
                        Configure data source with AI ✦
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">
                        {detail.storageDesign.branch} ·{' '}
                        {{
                          A1: 'Internal JSONB',
                          A2: 'Internal relational',
                          B1: 'External relational',
                          B2: 'External REST API',
                        }[detail.storageDesign.branch] || 'Configured storage'}
                      </h3>
                      {canManage && (
                        <button
                          type="button"
                          className={controlClass}
                          onClick={() =>
                            launchOnboarding(
                              'reconcile',
                              'fhir4java-map-entity-storage',
                              detail.resourceType,
                              4,
                            )
                          }
                        >
                          Reconfigure ✦
                        </button>
                      )}
                    </div>
                    {detail.storageDesign.configuredAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        Configured on{' '}
                        {new Date(
                          detail.storageDesign.configuredAt,
                        ).toLocaleDateString()}
                      </p>
                    )}
                    {detail.storageDesign.branch === 'A1' ? (
                      <p className="mt-2 text-sm text-emerald-800">
                        ✓ Default storage — no migration needed.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-slate-600">
                          {detail.storageDesign.artifactsGenerated
                            ? 'Artifacts generated — apply manually before deploy:'
                            : 'No generated artifacts are recorded for this data source.'}
                        </p>
                        {detail.storageDesign.artifacts?.length ? (
                          <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
                            {detail.storageDesign.artifacts.map(
                              (artifact, index) => (
                                <li
                                  key={`${artifact.fileName || artifact.filename || artifact.type}-${index}`}
                                >
                                  {artifact.fileName ||
                                    artifact.filename ||
                                    artifact.type}
                                </li>
                              ),
                            )}
                          </ul>
                        ) : null}
                        {detail.storageDesign.artifactsGenerated &&
                        getStorageArtifacts(detail.resourceType) ? (
                          <button
                            type="button"
                            onClick={() => void downloadAssetStorageArtifacts()}
                            className={`${controlClass} mt-3`}
                          >
                            ↓ Download artifacts
                          </button>
                        ) : detail.storageDesign.artifactsGenerated ? (
                          <p className="mt-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                            Artifacts from session{' '}
                            {detail.storageDesign.sessionId || 'unknown'} are no
                            longer in browser memory. Re-run the storage session
                            to regenerate them.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </AssetSection>
            </div>
          )}
          <div id="configured-Event-Triggers">
            <AssetSection title="Event Triggers" expanded={expanded}>
              <p>{detail.eventTriggerCount} configured triggers</p>
              <button
                type="button"
                className={`${controlClass} mt-3`}
                onClick={() => setView('triggers')}
              >
                Manage Triggers
              </button>
            </AssetSection>
          </div>
          <div id="configured-Search-Parameters">
            <AssetSection title="Search Parameters" expanded={expanded}>
              <button
                type="button"
                className={controlClass}
                onClick={() => onViewResource?.(detail.resourceType)}
              >
                View in Resource Catalog
              </button>
            </AssetSection>
          </div>
          <div id="configured-AI-Search">
            <AssetSection title="AI Search" expanded={expanded}>
              <p>Natural language synonyms: {detail.nlSearchSynonyms.length}</p>
              {detail.nlSearchSynonyms.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto break-words text-xs">
                  {detail.nlSearchSynonyms.join(' · ')}
                </div>
              )}
              <p className="mt-3">
                Hybrid and semantic search:{' '}
                {detail.embeddingEnabled ? 'Available' : 'Unavailable'}
              </p>
              {detail.embeddingModel && (
                <p className="mt-1 break-words">
                  Embedding model: {detail.embeddingModel}
                </p>
              )}
            </AssetSection>
          </div>
          <AssetSection title="API Examples" expanded={expanded}>
            <pre className="overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-3 text-xs">
              {`GET /fhir/${(detail.fhirVersions[0] || 'R5').toLowerCase()}/${encodeURIComponent(detail.resourceType)}?_count=10`}
              {detail.embeddingEnabled
                ? `\n\nPOST /api/ai/hybrid-search\n${JSON.stringify({ query: '', resourceTypes: [detail.resourceType], k: 10 }, null, 2)}\n\nPOST /api/ai/semantic-search\n${JSON.stringify({ query: '', resourceTypes: [detail.resourceType], k: 5 }, null, 2)}`
                : ''}
              {detail.nlSearchSynonyms.length
                ? `\n\nPOST /api/ai/search\n${JSON.stringify({ query: detail.nlSearchSynonyms[0], resourceTypes: [detail.resourceType] }, null, 2)}`
                : ''}
            </pre>
          </AssetSection>
        </>
      )}
      {detail &&
        !loading &&
        !error &&
        view === 'rules' &&
        (rulesError ? (
          <div role="alert" className="text-sm text-rose-700">
            {rulesError}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : (
          <BusinessRuleManager
            resourceType={selected || ''}
            rules={rules}
            canManage={canManage}
            openAddForm={openAddRuleOnRulesView}
            onChanged={() => setAttempt((value) => value + 1)}
          />
        ))}
      {detail && !loading && !error && view === 'triggers' && (
        <EventTriggerManager
          resourceType={selected || ''}
          canManage={canManage}
          onChanged={() => setAttempt((value) => value + 1)}
        />
      )}
      {!loading &&
        !error &&
        (view === 'onboarding' || (!selected && view === 'sessions')) && (
          <ServiceOnboarding
            startImmediately={view === 'onboarding'}
            launch={onboardingLaunch}
            onBack={() => setView('detail')}
            onViewAsset={(resourceType) => {
              setView('detail');
              setSelected(resourceType);
            }}
            onAddBusinessRules={(resourceType) => {
              setView('rules');
              setSelected(resourceType);
            }}
            onBackToAsset={(resourceType, section) => {
              setView('detail');
              setSelected(resourceType);
              setReturnToSection(
                section === 'storage' ? 'configured-Storage' : null,
              );
              setAttempt((value) => value + 1);
            }}
            onStartAnotherUpdate={(resourceType) => {
              setView('detail');
              setSelected(resourceType);
              setUpdateMenuOpen(true);
            }}
          />
        )}
    </div>
  );
}
