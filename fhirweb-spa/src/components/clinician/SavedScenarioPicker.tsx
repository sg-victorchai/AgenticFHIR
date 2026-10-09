import React, { useEffect, useRef, useState } from 'react';
import {
  agentBuilderService,
  ScenarioDetail,
  ScenarioSummary,
} from '../../services/agentBuilderService';

const SavedScenarioPicker: React.FC<{
  personaId: string;
  refreshKey: string | null;
  disabled: boolean;
  onLoading: (loading: boolean) => void;
  onSelect: (scenario: ScenarioDetail) => void;
}> = ({ personaId, refreshKey, disabled, onLoading, onSelect }) => {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void agentBuilderService
      .listScenarios(personaId)
      .then(
        (items) => {
          if (active) setScenarios(items);
        },
        (failure: unknown) => {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Unable to load saved scenarios.',
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [personaId, refreshKey, refresh]);

  const loadScenario = async (id: string) => {
    setSelectedId(id);
    if (!id) return;
    const current = ++requestId.current;
    setLoading(true);
    onLoading(true);
    setError(null);
    try {
      const detail = await agentBuilderService.getScenario(id);
      if (current === requestId.current) onSelect(detail);
    } catch (failure) {
      if (current === requestId.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to load scenario details.',
        );
    } finally {
      if (current === requestId.current) {
        setLoading(false);
        onLoading(false);
      }
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
          Reuse a saved evaluation
          <select
            value={selectedId}
            disabled={disabled || loading}
            onChange={(event) => void loadScenario(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              {loading ? 'Loading scenarios...' : 'Select a saved scenario'}
            </option>
            {scenarios.map((scenario) => (
              <option key={scenario.scenarioId} value={scenario.scenarioId}>
                {scenario.scenarioName} ({scenario.scenarioType})
                {scenario.hasSeedSpec ? ' - test data' : ''}
                {scenario.hasMissionParams ? ' - agent settings' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setRefresh((value) => value + 1)}
          className="rounded-md border border-slate-200 px-3 py-2 text-xs disabled:opacity-50"
        >
          Refresh scenarios
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {error && selectedId && (
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void loadScenario(selectedId)}
          className="mt-2 text-xs text-cyan-700"
        >
          Retry loading details
        </button>
      )}
      {!loading && !error && !scenarios.length && (
        <p className="mt-2 text-xs text-slate-500">
          No saved scenarios for this persona yet.
        </p>
      )}
    </section>
  );
};

export const ScenarioBlueprint: React.FC<{ scenario: ScenarioDetail }> = ({
  scenario,
}) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4">
    <h2 className="text-sm font-semibold text-slate-900">
      {scenario.scenarioName}
    </h2>
    <p className="mt-1 break-all font-mono text-xs text-slate-500">
      {scenario.scenarioId}
    </p>
    <div className="mt-3 space-y-3">
      {[
        ['Test patient blueprint', scenario.seedSpec],
        ['Agent test settings', scenario.missionParams],
        ['Test conversation', scenario.conversationScript],
        ['Evaluation rubric', scenario.responseCriteria],
        ['Expected data queries', scenario.expectedQueryPatterns],
        ['Automatic rubric generation', scenario.generateRubric],
      ].map(([label, value]) => (
        <details key={String(label)}>
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            {String(label)}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-xs text-slate-700">
            {value == null ? 'Not provided.' : JSON.stringify(value, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  </section>
);

export default SavedScenarioPicker;
