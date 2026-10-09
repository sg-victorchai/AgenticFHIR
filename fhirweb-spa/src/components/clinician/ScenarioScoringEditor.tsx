import React from 'react';

export interface QueryPatternDraft {
  resourceType: string;
  filters: Array<{ name: string; value: string }>;
}

export interface ScenarioScoringDraft {
  generateRubric: boolean;
  criteria: string;
  queries: QueryPatternDraft[];
}

export const newScenarioScoring = (): ScenarioScoringDraft => ({
  generateRubric: true,
  criteria: '',
  queries: [],
});

export const buildScenarioScoring = (draft: ScenarioScoringDraft) => {
  const responseCriteria = draft.criteria
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!draft.generateRubric && !responseCriteria.length) {
    throw new Error(
      'Add at least one response criterion or enable automatic criteria.',
    );
  }
  const expectedQueryPatterns = draft.queries.map((query) => {
    const expectedParams: Record<string, string> = {};
    for (const filter of query.filters) {
      const name = filter.name.trim();
      const value = filter.value.trim();
      if (!name || !value)
        throw new Error(
          'Each query filter needs a parameter name and an expected value.',
        );
      if (name in expectedParams)
        throw new Error(
          `Query parameter "${name}" is repeated. Use a single expected value per parameter.`,
        );
      expectedParams[name] = value;
    }
    return { resourceType: query.resourceType, expectedParams };
  });
  return {
    generateRubric: draft.generateRubric,
    ...(!draft.generateRubric ? { responseCriteria } : {}),
    expectedQueryPatterns,
  };
};

const resourceTypes = [
  ['Patient', 'Patient demographics'],
  ['Observation', 'Measurements and lab results'],
  ['Condition', 'Diagnoses'],
  ['MedicationRequest', 'Medication orders'],
  ['AllergyIntolerance', 'Allergies'],
  ['Procedure', 'Procedures'],
  ['ServiceRequest', 'Service orders'],
  ['Encounter', 'Visits'],
  ['CarePlan', 'Care plans'],
  ['DiagnosticReport', 'Diagnostic reports'],
];
const inputClass =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
const buttonClass =
  'rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50';

const ScenarioScoringEditor: React.FC<{
  value: ScenarioScoringDraft;
  onChange: (value: ScenarioScoringDraft) => void;
}> = ({ value, onChange }) => {
  const changeQuery = (index: number, query: QueryPatternDraft) =>
    onChange({
      ...value,
      queries: value.queries.map((current, position) =>
        position === index ? query : current,
      ),
    });
  return (
    <fieldset className="space-y-4 border-t border-slate-200 pt-4 xl:col-span-2">
      <legend className="text-sm font-semibold text-slate-900">
        Evaluation scoring
      </legend>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={value.generateRubric}
          onChange={(event) =>
            onChange({ ...value, generateRubric: event.target.checked })
          }
        />
        Generate baseline response criteria automatically
      </label>
      <aside
        aria-label="Automatic criteria guidance"
        className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm leading-relaxed text-cyan-950"
      >
        <p className="font-semibold">A quick baseline for a new persona</p>
        <p className="mt-1">
          The server asks AI to generate 3–5 criteria using approximately the
          first 800 characters of the persona definition. These criteria can be
          generic because the AI does not see all clinical rules. Use this for
          an initial run, then review the generated rubric in the saved scenario
          and create a new scenario with specific criteria for meaningful
          version comparisons.
        </p>
      </aside>
      {!value.generateRubric && (
        <label className="block text-sm font-medium text-slate-700">
          What should a good response include?
          <textarea
            required
            rows={5}
            value={value.criteria}
            onChange={(event) =>
              onChange({ ...value, criteria: event.target.value })
            }
            className={inputClass}
            placeholder={
              "States the patient's most recent blood pressure numerically\nLists current antihypertensive medications by name\nIdentifies whether blood pressure exceeds 130/80 mmHg\nRecommends a specific next action\nDoes not invent clinical data missing from the patient record"
            }
          />
        </label>
      )}
      <aside
        aria-label="Response quality guidance"
        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
      >
        <p className="font-semibold">Specific criteria make scores useful</p>
        <p className="mt-1">
          For manual criteria, enter one measurable statement per line. The AI
          judge scores each statement from 0 to 1 and averages them into
          Response Quality. Prefer “States the systolic value numerically” to
          “Provides blood pressure information,” and “Does not fabricate lab
          values” to “Is accurate.” Include expected facts, thresholds, actions,
          and guardrails relevant to this scenario.
        </p>
      </aside>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Data the agent should look up
        </h3>
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            onChange({
              ...value,
              queries: [
                ...value.queries,
                { resourceType: 'Patient', filters: [] },
              ],
            })
          }
        >
          Add expected data source
        </button>
      </div>
      <aside
        aria-label="Query correctness guidance"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950"
      >
        <p className="font-semibold">
          Check that the agent queries the right records
        </p>
        <p className="mt-1">
          Choose each FHIR data source the agent must query. Optional filters
          require specific search parameters: for blood pressure observations,
          add parameter “code” with value “85354-9”; for hypertension diagnoses,
          use “code” with “38341003”. Leave filters empty when any query to that
          data source is sufficient. A matching query must include every filter;
          expected values use substring matching. Ask a data engineer to confirm
          unfamiliar parameter names or clinical codes.
        </p>
        <p className="mt-2">
          Query Correctness is the percentage of expected queries covered. Three
          of four matches scores 75%. With no expected queries, the score stays
          at a neutral 50% and does not indicate whether the agent queried
          correctly.
        </p>
      </aside>
      {value.queries.map((query, index) => (
        <div key={index} className="space-y-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
              Expected data source {index + 1}
              <select
                value={query.resourceType}
                onChange={(event) =>
                  changeQuery(index, {
                    ...query,
                    resourceType: event.target.value,
                  })
                }
                className={inputClass}
              >
                {resourceTypes.map(([type, label]) => (
                  <option key={type} value={type}>
                    {label} ({type})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                onChange({
                  ...value,
                  queries: value.queries.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove data source
            </button>
          </div>
          {query.filters.map((filter, filterIndex) => (
            <div key={filterIndex} className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-xs text-slate-700">
                Search parameter
                <input
                  required
                  value={filter.name}
                  placeholder="e.g. code"
                  className={inputClass}
                  onChange={(event) =>
                    changeQuery(index, {
                      ...query,
                      filters: query.filters.map((current, position) =>
                        position === filterIndex
                          ? { ...current, name: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
              </label>
              <label className="min-w-0 flex-1 text-xs text-slate-700">
                Expected value
                <input
                  required
                  value={filter.value}
                  placeholder="e.g. 85354-9"
                  className={inputClass}
                  onChange={(event) =>
                    changeQuery(index, {
                      ...query,
                      filters: query.filters.map((current, position) =>
                        position === filterIndex
                          ? { ...current, value: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  changeQuery(index, {
                    ...query,
                    filters: query.filters.filter(
                      (_, position) => position !== filterIndex,
                    ),
                  })
                }
              >
                Remove filter
              </button>
            </div>
          ))}
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              changeQuery(index, {
                ...query,
                filters: [...query.filters, { name: '', value: '' }],
              })
            }
          >
            Add query filter
          </button>
        </div>
      ))}
    </fieldset>
  );
};

export default ScenarioScoringEditor;
