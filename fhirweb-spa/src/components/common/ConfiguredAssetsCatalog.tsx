import { useEffect, useState } from 'react';
import {
  AssetBusinessRule,
  ConfiguredAsset,
  ConfiguredAssetDetail,
  getAssetBusinessRules,
  getConfiguredAsset,
  listConfiguredAssets,
} from '../../services/configuredAssetsService';

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load configured assets.';
const controlClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50';
const sourceLabel = (source: string) =>
  source === 'platform' ? 'Platform' : source === 'portal' ? 'Portal' : source;

function AssetSection({
  title,
  expanded,
  children,
}: {
  title: string;
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={expanded} className="border-b border-slate-200 py-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {title}
      </summary>
      <div className="mt-3 min-w-0 text-sm text-slate-700">{children}</div>
    </details>
  );
}

export default function ConfiguredAssetsCatalog({
  onViewResource,
}: {
  onViewResource?: (resourceType: string) => void;
}) {
  const [assets, setAssets] = useState<ConfiguredAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConfiguredAssetDetail | null>(null);
  const [rules, setRules] = useState<AssetBusinessRule[]>([]);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [view, setView] = useState<'detail' | 'rules'>('detail');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setRulesError(null);
    setDetail(null);
    setRules([]);
    const load = async () => {
      if (!selected) {
        const result = await listConfiguredAssets();
        if (active)
          setAssets(
            result.filter(
              (asset) =>
                asset.businessRuleCount > 0 || Boolean(asset.workflowName),
            ),
          );
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

  const visible = assets.filter((asset) =>
    `${asset.resourceType} ${asset.workflowName || ''} ${asset.authoringSource}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const operations = [...new Set(rules.map((rule) => rule.triggerOperation))];
  const expanded = detail?.authoringSource === 'platform';
  const mappings = rules.flatMap((rule) => {
    const stages = rule.properties?.['conditional-initial-stages'];
    return Array.isArray(stages)
      ? stages.filter((stage): stage is { condition: string; stage: string } =>
          Boolean(
            stage &&
            typeof stage === 'object' &&
            typeof stage.condition === 'string' &&
            typeof stage.stage === 'string',
          ),
        )
      : [];
  });

  return (
    <div>
      {selected && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={controlClass}
            onClick={() => {
              if (view === 'rules') setView('detail');
              else {
                setSelected(null);
                setFilter('');
              }
            }}
          >
            {view === 'rules'
              ? 'Back to Asset Detail'
              : 'Back to Rules & Workflows'}
          </button>
          <h2 className="break-words text-xl font-semibold text-slate-900">
            {view === 'rules' ? `Business Rules — ${selected}` : selected}
          </h2>
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
      {!selected && !loading && !error && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              aria-label="Filter configured assets"
              placeholder="Filter by resource, source, or workflow..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
            <span className="text-xs text-slate-500">
              {assets.length} configured assets
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((asset) => (
              <button
                key={asset.resourceType}
                type="button"
                aria-label={`View ${asset.resourceType} configuration`}
                onClick={() => {
                  setSelected(asset.resourceType);
                  setView('detail');
                }}
                className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <h2 className="break-words text-base font-semibold text-slate-900">
                  {asset.resourceType}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-1">
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
            ))}
            {!visible.length && (
              <p className="col-span-full py-8 text-center text-sm text-slate-500">
                {assets.length
                  ? 'No configured assets match this filter.'
                  : 'No resources have business rules or workflows configured.'}
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
          <AssetSection title="Workflow" expanded={expanded}>
            <p className="break-words font-medium">
              {detail.workflowName || 'No workflow configured.'}
            </p>
            {mappings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {mappings.map((mapping, index) => (
                  <li key={index} className="break-words">
                    <code>{mapping.condition}</code> →{' '}
                    <strong>{mapping.stage}</strong>
                  </li>
                ))}
              </ul>
            )}
          </AssetSection>
          <div id="configured-Business-Rules">
            <AssetSection title="Business Rules" expanded={expanded}>
              <p>
                {detail.businessRuleCount} configured rules
                {rulesError
                  ? ' (rule list unavailable)'
                  : ` · ${rules.filter((rule) => rule.enabled).length} enabled`}
              </p>
              <button
                type="button"
                className={`${controlClass} mt-3`}
                onClick={() => setView('rules')}
              >
                View Business Rules
              </button>
            </AssetSection>
          </div>
          <div id="configured-Event-Triggers">
            <AssetSection title="Event Triggers" expanded={expanded}>
              <p>{detail.eventTriggerCount} configured triggers</p>
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
      {detail && !loading && !error && view === 'rules' && (
        <>
          {rulesError ? (
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
            <>
              {!rules.length && (
                <p className="py-6 text-sm text-slate-500">
                  No business rules are configured for {selected}.
                </p>
              )}
              {operations.map((operation) => (
                <section key={operation} className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    {operation === 'ALL' ? 'All operations' : operation}{' '}
                    pipeline
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs text-slate-500">
                        <tr>
                          {[
                            'Priority',
                            'Plugin / Source',
                            'Phase / Mode',
                            'Purpose & Configuration',
                            'Status',
                          ].map((title) => (
                            <th key={title} className="px-2 py-2">
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rules
                          .filter((rule) => rule.triggerOperation === operation)
                          .sort(
                            (first, second) => first.priority - second.priority,
                          )
                          .map((rule) => (
                            <tr
                              key={rule.ruleId}
                              className="border-b border-slate-100 align-top"
                            >
                              <td className="px-2 py-3 font-mono">
                                {rule.priority}
                              </td>
                              <td className="px-2 py-3">
                                <p className="break-words font-medium">
                                  {rule.pluginId}
                                </p>
                                <p
                                  className="mt-1 text-xs text-slate-500"
                                  title={
                                    rule.authoringSource === 'platform'
                                      ? 'Defined in platform configuration. Update the codebase to change this rule.'
                                      : 'Portal-authored rule; this view is read-only.'
                                  }
                                >
                                  {sourceLabel(rule.authoringSource)} ·
                                  Read-only
                                </p>
                                {rule.targetResourceType !== selected && (
                                  <p className="text-xs text-slate-500">
                                    Scope: {rule.targetResourceType}
                                  </p>
                                )}
                              </td>
                              <td className="px-2 py-3 text-xs">
                                {rule.phase}
                                <br />
                                {rule.mode}
                              </td>
                              <td className="px-2 py-3">
                                <p className="break-words">
                                  {rule.description ||
                                    'No description provided.'}
                                </p>
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-xs text-cyan-700">
                                    Configuration
                                  </summary>
                                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-2 text-xs">
                                    {JSON.stringify(rule.properties, null, 2)}
                                  </pre>
                                </details>
                              </td>
                              <td
                                className={`px-2 py-3 text-xs ${rule.enabled ? 'text-emerald-700' : 'text-slate-500'}`}
                              >
                                {rule.enabled ? 'Enabled' : 'Disabled'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
