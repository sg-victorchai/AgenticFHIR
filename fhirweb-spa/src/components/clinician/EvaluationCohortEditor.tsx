import React, { useEffect, useState } from 'react';
import {
  agentBuilderService,
  TerminologySearchResult,
} from '../../services/agentBuilderService';
import { QuickAddTenantTerminology } from '../../pages/TenantTerminologyPage';

export interface CohortGroupDraft {
  label: string;
  count: number;
  patientProfile: {
    minAge: string;
    maxAge: string;
    gender: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  conditionCodes: string;
  noObservations: boolean;
  observationConstraints: Array<{
    loincCode: string;
    daysBack: number;
    comparator: string;
    value: string;
    unit: string;
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
  patientProfile: {
    minAge: '',
    maxAge: '',
    gender: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  },
  conditionCodes: '',
  noObservations: false,
  observationConstraints: [],
  medicationRequests: [],
});

const parseObservationValue = (value: string) => {
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(%)?$/);
  if (!match) return undefined;
  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue)
    ? { value: numericValue, hasPercent: Boolean(match[2]) }
    : undefined;
};

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
      group.observationConstraints.some((rule) => {
        const parsedValue = parseObservationValue(rule.value);
        return (
          !rule.loincCode.trim() ||
          !Number.isInteger(rule.daysBack) ||
          rule.daysBack < 1 ||
          !parsedValue ||
          (parsedValue.hasPercent &&
            Boolean(rule.unit.trim()) &&
            rule.unit.trim() !== '%')
        );
      })
    )
      throw new Error(
        'Each lab criterion needs a LOINC code, a positive lookback, and a numeric value such as 7.5 or 5.7%.',
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
    const minAgeText = group.patientProfile.minAge.trim();
    const maxAgeText = group.patientProfile.maxAge.trim();
    const minAge = minAgeText === '' ? undefined : Number(minAgeText);
    const maxAge = maxAgeText === '' ? undefined : Number(maxAgeText);
    if (
      (minAge !== undefined && (!Number.isInteger(minAge) || minAge < 0)) ||
      (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0))
    )
      throw new Error('Patient ages must be whole numbers of 0 or greater.');
    if (minAge !== undefined && maxAge !== undefined && maxAge < minAge)
      throw new Error('Maximum patient age must be at least the minimum age.');
    const patientProfile = {
      ...(minAge !== undefined ? { minAge } : {}),
      ...(maxAge !== undefined ? { maxAge } : {}),
      ...(group.patientProfile.gender
        ? { gender: group.patientProfile.gender }
        : {}),
      ...(['city', 'state', 'postalCode', 'country'] as const).reduce<
        Record<string, string>
      >((profile, field) => {
        const value = group.patientProfile[field].trim();
        if (value) profile[field] = value;
        return profile;
      }, {}),
    };
    return {
      label: group.label.trim(),
      count: group.count,
      ...(Object.keys(patientProfile).length ? { patientProfile } : {}),
      ...(conditionCodes.length ? { conditionCodes } : {}),
      ...(group.noObservations
        ? { noObservations: true }
        : group.observationConstraints.length
          ? {
              observationConstraints: group.observationConstraints.map(
                (rule) => {
                  const parsedValue = parseObservationValue(rule.value)!;
                  const unit = parsedValue.hasPercent ? '%' : rule.unit.trim();
                  return {
                    loincCode: rule.loincCode.trim(),
                    daysBack: rule.daysBack,
                    comparator: rule.comparator,
                    value: parsedValue.value,
                    ...(unit ? { unit } : {}),
                  };
                },
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
      {multiple ? (
        <div className="mt-1 flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-100">
          {selectedCodes.map((code) => (
            <span
              key={code}
              className="inline-flex max-w-full items-center gap-1 rounded bg-cyan-50 py-1 pl-2 pr-1 text-xs font-medium text-cyan-900"
            >
              <span className="break-all">{code}</span>
              <button
                type="button"
                aria-label={`Remove condition code ${code}`}
                onClick={() =>
                  onChange(
                    selectedCodes
                      .filter((selected) => selected !== code)
                      .join(', '),
                  )
                }
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-cyan-700 hover:bg-cyan-100 hover:text-cyan-950"
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
          <input
            aria-label={ariaLabel}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchOpen(true);
              setQuery(event.target.value);
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
              if (event.key === 'Backspace' && !query && selectedCodes.length) {
                onChange(selectedCodes.slice(0, -1).join(', '));
              }
            }}
            onBlur={(event) => {
              if (
                !event.currentTarget.parentElement?.parentElement?.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setSearchOpen(false);
                setQuery('');
                setResults([]);
              }
            }}
            placeholder={
              selectedCodes.length ? 'Add another code' : placeholder
            }
            className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400 focus:ring-0"
          />
        </div>
      ) : (
        <input
          aria-label={ariaLabel}
          value={searchOpen ? query : value}
          onFocus={() => {
            setQuery(value);
          }}
          onChange={(event) => {
            setSearchOpen(true);
            setQuery(event.target.value);
            onChange(event.target.value);
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
      )}
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
              onPointerDown={(event) => event.preventDefault()}
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
                    onPointerDown={(event) => event.preventDefault()}
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
      <QuickAddTenantTerminology
        resourceType={resourceType}
        onSaved={(concept) => addCode(concept.code)}
      />
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
            <div className="text-xs font-medium text-slate-600">
              Conditions (optional)
              <TerminologyCodeSearch
                resourceType="Condition"
                value={group.conditionCodes}
                onChange={(conditionCodes) => update(index, { conditionCodes })}
                placeholder="Search condition or SNOMED code"
                ariaLabel={`Condition codes for group ${index + 1}`}
                multiple
              />
            </div>
          </div>
          <details className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Patient demographics (optional)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                Minimum age
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={group.patientProfile.minAge}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        minAge: event.target.value,
                      },
                    })
                  }
                  placeholder="Any age"
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Maximum age
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={group.patientProfile.maxAge}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        maxAge: event.target.value,
                      },
                    })
                  }
                  placeholder={
                    group.patientProfile.minAge
                      ? `Default: ${Number(group.patientProfile.minAge) + 10}`
                      : 'No maximum'
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Gender
                <select
                  value={group.patientProfile.gender}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        gender: event.target.value,
                      },
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Alternate male/female</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                City
                <input
                  value={group.patientProfile.city}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        city: event.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                State / region
                <input
                  value={group.patientProfile.state}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        state: event.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Postal code
                <input
                  value={group.patientProfile.postalCode}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        postalCode: event.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Country code
                <input
                  value={group.patientProfile.country}
                  onChange={(event) =>
                    update(index, {
                      patientProfile: {
                        ...group.patientProfile,
                        country: event.target.value,
                      },
                    })
                  }
                  placeholder="e.g. SG, US"
                  className={inputClass}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Ages are inclusive. If only a minimum age is set, the sandbox uses
              a maximum age 10 years higher.
            </p>
          </details>
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
                    className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.65fr)_auto]"
                  >
                    <div className="text-xs text-slate-600">
                      Lab test LOINC code
                      <TerminologyCodeSearch
                        resourceType="Observation"
                        value={rule.loincCode}
                        onChange={(loincCode) => updateRule({ loincCode })}
                        placeholder="Search lab test or enter LOINC code"
                        ariaLabel={`Lab test code for group ${index + 1}, criterion ${ruleIndex + 1}`}
                      />
                    </div>
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
                        type="text"
                        inputMode="decimal"
                        value={rule.value}
                        onChange={(event) =>
                          updateRule({ value: event.target.value })
                        }
                        placeholder="e.g. 7.5 or 5.7%"
                        aria-label={`Result value for group ${index + 1}, criterion ${ruleIndex + 1}`}
                        className={inputClass}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Unit (optional)
                      <input
                        type="text"
                        value={rule.unit}
                        onChange={(event) =>
                          updateRule({ unit: event.target.value })
                        }
                        placeholder="e.g. % or mmol/L"
                        aria-label={`Result unit for group ${index + 1}, criterion ${ruleIndex + 1}`}
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
                      className="min-h-9 self-end py-2 text-left text-xs text-rose-700"
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
                        value: '8',
                        unit: '',
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
                  className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div className="text-xs text-slate-600">
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
                  </div>
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
                    className="min-h-9 self-end py-2 text-left text-xs text-rose-700"
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
