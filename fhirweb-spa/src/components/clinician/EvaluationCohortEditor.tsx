import React, { useEffect, useState } from 'react';
import {
  agentBuilderService,
  TerminologySearchResult,
} from '../../services/agentBuilderService';

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
  medicationRequests: Array<{
    medicationCode: string;
    status: string;
    daysBack: number;
  }>;
}

export const newCohortGroup = (): CohortGroupDraft => ({
  label: '',
  count: 1,
  conditionCodes: '',
  noObservations: false,
  observationConstraints: [],
  medicationRequests: [],
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
    if (
      group.medicationRequests.some(
        (medication) =>
          !medication.medicationCode.trim() ||
          !Number.isInteger(medication.daysBack) ||
          medication.daysBack < 1,
      )
    )
      throw new Error(
        'Each medication needs a code and a positive lookback in days.',
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
      ...(group.medicationRequests.length
        ? {
            medicationRequests: group.medicationRequests.map((medication) => ({
              ...medication,
              medicationCode: medication.medicationCode.trim(),
            })),
          }
        : {}),
    };
  });
};

const inputClass =
  'mt-1 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm';

const TerminologyCodeSearch: React.FC<{
  resourceType: 'Condition' | 'Observation' | 'MedicationRequest';
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  multiple?: boolean;
}> = ({
  resourceType,
  value,
  onChange,
  placeholder,
  ariaLabel,
  multiple = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TerminologySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const selectedCodes = multiple
    ? value
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    : [];

  useEffect(() => {
    const term = query.trim();
    if (!searchOpen || term.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void agentBuilderService
        .searchTerminology(term, resourceType)
        .then(
          (items) => {
            if (active) {
              setResults(items);
              setError(null);
            }
          },
          (failure: unknown) => {
            if (active) {
              setResults([]);
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Terminology search failed.',
              );
            }
          },
        )
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, resourceType, searchOpen]);

  const addCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    onChange(
      multiple
        ? [...new Set([...selectedCodes, normalized])].join(', ')
        : normalized,
    );
    setQuery('');
    setResults([]);
    setError(null);
    setSearchOpen(false);
  };
  const options = results
    .flatMap((result) => {
      const codes = result.codes?.length
        ? result.codes
        : result.primaryCode
          ? [
              {
                system: result.primarySystem || '',
                code: result.primaryCode,
                display: result.primaryDisplay,
              },
            ]
          : [];
      return codes.map((code) => ({
        code: code.code,
        label: code.display || result.displayName || result.name || code.code,
        source: result.displayName || result.name || '',
      }));
    })
    .filter((option) => option.code);

  const showManualCode =
    searchOpen &&
    query.trim().length >= 2 &&
    !loading &&
    !options.some((option) => option.code === query.trim());
  const showSearchPanel =
    searchOpen && (loading || error || options.length > 0 || showManualCode);
  return (
    <div className="relative min-w-0">
      <input
        aria-label={ariaLabel}
        value={searchOpen ? query : value}
        onFocus={() => {
          setSearchOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setSearchOpen(true);
          setQuery(event.target.value);
          if (!multiple) onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSearchOpen(false);
            setQuery('');
            setResults([]);
          }
          if (event.key === 'Enter' && showManualCode) {
            event.preventDefault();
            addCode(query);
          }
        }}
        onBlur={(event) => {
          if (
            !event.currentTarget.parentElement?.contains(
              event.relatedTarget as Node | null,
            )
          ) {
            setSearchOpen(false);
            setQuery('');
            setResults([]);
          }
        }}
        placeholder={placeholder}
        className={inputClass}
      />
      {showSearchPanel && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && (
            <p role="status" className="px-3 py-2 text-xs text-slate-500">
              Searching terminology...
            </p>
          )}
          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-rose-700">
              {error} You can still enter a code manually.
            </p>
          )}
          {showManualCode && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-xs font-medium text-cyan-800 hover:bg-cyan-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addCode(query)}
            >
              Use entered code “{query.trim()}”
            </button>
          )}
          {options.length > 0 && (
            <ul role="listbox" aria-label={`${ariaLabel} search results`}>
              {options.map((option, index) => (
                <li key={`${option.code}:${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addCode(option.code)}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-cyan-50"
                  >
                    <span className="font-semibold">{option.label}</span>
                    <span className="ml-2 font-mono text-slate-500">
                      {option.code}
                    </span>
                    {option.source && (
                      <span className="ml-2 text-slate-400">
                        {option.source}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

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
              Conditions (optional)
              <TerminologyCodeSearch
                resourceType="Condition"
                value={group.conditionCodes}
                onChange={(conditionCodes) => update(index, { conditionCodes })}
                placeholder="Search condition or SNOMED code"
                ariaLabel={`Condition codes for group ${index + 1}`}
                multiple
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
                      <TerminologyCodeSearch
                        resourceType="Observation"
                        value={rule.loincCode}
                        onChange={(loincCode) => updateRule({ loincCode })}
                        placeholder="Search lab test or enter LOINC code"
                        ariaLabel={`Lab test code for group ${index + 1}, criterion ${ruleIndex + 1}`}
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
          <div className="space-y-3">
            {group.medicationRequests.map((medication, medicationIndex) => {
              const updateMedication = (patch: Partial<typeof medication>) =>
                update(index, {
                  medicationRequests: group.medicationRequests.map(
                    (item, position) =>
                      position === medicationIndex
                        ? { ...item, ...patch }
                        : item,
                  ),
                });
              return (
                <div
                  key={medicationIndex}
                  className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr,1fr,1fr,auto]"
                >
                  <label className="text-xs text-slate-600">
                    Medication
                    <TerminologyCodeSearch
                      resourceType="MedicationRequest"
                      value={medication.medicationCode}
                      onChange={(medicationCode) =>
                        updateMedication({ medicationCode })
                      }
                      placeholder="Search medication or enter RxNorm code"
                      ariaLabel={`Medication code for group ${index + 1}, medication ${medicationIndex + 1}`}
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Order status
                    <select
                      value={medication.status}
                      onChange={(event) =>
                        updateMedication({ status: event.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="on-hold">On hold</option>
                      <option value="stopped">Stopped</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Within the last (days)
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={medication.daysBack}
                      onChange={(event) =>
                        updateMedication({
                          daysBack: Number(event.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    className="py-2 text-xs text-rose-700"
                    onClick={() =>
                      update(index, {
                        medicationRequests: group.medicationRequests.filter(
                          (_, position) => position !== medicationIndex,
                        ),
                      })
                    }
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
                  medicationRequests: [
                    ...group.medicationRequests,
                    { medicationCode: '', status: 'active', daysBack: 180 },
                  ],
                })
              }
              className="text-xs font-medium text-cyan-700"
            >
              + Add medication criteria
            </button>
          </div>
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
