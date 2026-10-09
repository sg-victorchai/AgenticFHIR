import React from 'react';

export interface CohortGroupDraft {
  label: string;
  count: number;
  conditionCodes: string;
  noObservations: boolean;
  observationConstraints: Array<{
    loincCode: string;
    daysBack: number;
    comparator: string;
    value: number;
  }>;
}

export const newCohortGroup = (): CohortGroupDraft => ({
  label: '',
  count: 1,
  conditionCodes: '',
  noObservations: false,
  observationConstraints: [],
});

export const buildCohortGroups = (groups: CohortGroupDraft[]) => {
  if (!groups.length) throw new Error('Add at least one patient group.');
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (total > 1000)
    throw new Error('The sandbox supports up to 1,000 test patients.');
  return groups.map((group) => {
    if (
      !group.label.trim() ||
      !Number.isInteger(group.count) ||
      group.count < 1
    )
      throw new Error(
        'Each patient group needs a name and a positive whole-number patient count.',
      );
    if (
      !group.noObservations &&
      group.observationConstraints.some(
        (rule) =>
          !rule.loincCode.trim() ||
          !Number.isInteger(rule.daysBack) ||
          rule.daysBack < 1 ||
          !Number.isFinite(rule.value),
      )
    )
      throw new Error(
        'Each lab criterion needs a LOINC code, a positive lookback in days, and a numeric value.',
      );
    const conditionCodes = group.conditionCodes
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    return {
      label: group.label.trim(),
      count: group.count,
      ...(conditionCodes.length ? { conditionCodes } : {}),
      ...(group.noObservations
        ? { noObservations: true }
        : group.observationConstraints.length
          ? {
              observationConstraints: group.observationConstraints.map(
                (rule) => ({ ...rule, loincCode: rule.loincCode.trim() }),
              ),
            }
          : {}),
    };
  });
};

const inputClass =
  'mt-1 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm';

const EvaluationCohortEditor: React.FC<{
  groups: CohortGroupDraft[];
  onChange: (groups: CohortGroupDraft[]) => void;
}> = ({ groups, onChange }) => {
  const update = (index: number, patch: Partial<CohortGroupDraft>) =>
    onChange(
      groups.map((group, position) =>
        position === index ? { ...group, ...patch } : group,
      ),
    );
  return (
    <fieldset className="min-w-0 space-y-3 xl:col-span-2">
      <legend className="mb-2 text-sm font-semibold text-slate-800">
        Test patient groups
      </legend>
      {groups.map((group, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-600">
              Group {index + 1}
            </p>
            <button
              type="button"
              disabled={groups.length === 1}
              onClick={() =>
                onChange(groups.filter((_, position) => position !== index))
              }
              className="text-xs text-rose-700 disabled:opacity-40"
            >
              Remove group
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr,1fr,2fr]">
            <label className="text-xs font-medium text-slate-600">
              Group name
              <input
                required
                value={group.label}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
                placeholder="e.g. Diabetes with controlled HbA1c"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Number of patients
              <input
                required
                type="number"
                min={1}
                max={1000}
                step={1}
                value={group.count}
                onChange={(event) =>
                  update(index, { count: Number(event.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Condition codes (optional)
              <input
                value={group.conditionCodes}
                onChange={(event) =>
                  update(index, { conditionCodes: event.target.value })
                }
                placeholder="e.g. 73211009 (comma-separated codes)"
                className={inputClass}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={group.noObservations}
              onChange={(event) =>
                update(index, { noObservations: event.target.checked })
              }
            />
            No observations for these patients
          </label>
          {!group.noObservations && (
            <div className="space-y-3">
              {group.observationConstraints.map((rule, ruleIndex) => {
                const updateRule = (patch: Partial<typeof rule>) =>
                  update(index, {
                    observationConstraints: group.observationConstraints.map(
                      (item, position) =>
                        position === ruleIndex ? { ...item, ...patch } : item,
                    ),
                  });
                return (
                  <div
                    key={ruleIndex}
                    className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <label className="text-xs text-slate-600">
                      Lab test LOINC code
                      <input
                        required
                        value={rule.loincCode}
                        onChange={(event) =>
                          updateRule({ loincCode: event.target.value })
                        }
                        placeholder="e.g. 4548-4 (HbA1c)"
                        className={inputClass}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Within the last (days)
                      <input
                        required
                        type="number"
                        min={1}
                        step={1}
                        value={rule.daysBack}
                        onChange={(event) =>
                          updateRule({ daysBack: Number(event.target.value) })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Result comparison
                      <select
                        value={rule.comparator}
                        onChange={(event) =>
                          updateRule({ comparator: event.target.value })
                        }
                        className={inputClass}
                      >
                        <option value="le">At most</option>
                        <option value="lt">Below</option>
                        <option value="eq">Equal to</option>
                        <option value="ge">At least</option>
                        <option value="gt">Above</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">
                      Result value
                      <input
                        required
                        type="number"
                        step="any"
                        value={rule.value}
                        onChange={(event) =>
                          updateRule({ value: Number(event.target.value) })
                        }
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        update(index, {
                          observationConstraints:
                            group.observationConstraints.filter(
                              (_, position) => position !== ruleIndex,
                            ),
                        })
                      }
                      className="py-2 text-xs text-rose-700"
                    >
                      Remove criterion
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  update(index, {
                    observationConstraints: [
                      ...group.observationConstraints,
                      {
                        loincCode: '',
                        daysBack: 180,
                        comparator: 'le',
                        value: 8,
                      },
                    ],
                  })
                }
                className="text-xs font-medium text-cyan-700"
              >
                + Add lab criterion
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange([...groups, newCohortGroup()])}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
        >
          + Add patient group
        </button>
        <span className="text-xs text-slate-600">
          Total: {groups.reduce((sum, group) => sum + group.count, 0)} / 1,000
          patients
        </span>
      </div>
    </fieldset>
  );
};

export default EvaluationCohortEditor;
