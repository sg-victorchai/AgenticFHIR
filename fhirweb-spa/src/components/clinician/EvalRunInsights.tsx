import React from 'react';

export interface QualityDimensions {
  dataAccuracy?: number;
  queryCorrectness?: number;
  responseQuality?: number;
  scoreWeights?: Record<string, number>;
  dataAccuracyExplanation?: string;
  queryCorrectnessExplanation?: string;
  responseQualityExplanation?: string;
  responseQualityCriteria?: string[];
  responseQualityScores?: number[];
}

export interface ReplayStep {
  stepNumber: number;
  stepType: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
}

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const parseQualityDimensions = (
  value: unknown,
): QualityDimensions | null => {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as QualityDimensions)
    : null;
};

export const parseReplayTrace = (value: unknown): ReplayStep[] | null => {
  const parsed = parseJson(value);
  const steps = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { steps?: unknown } | undefined)?.steps)
      ? (parsed as { steps: unknown[] }).steps
      : null;
  return steps ? (steps as ReplayStep[]) : null;
};

const DIMENSIONS = [
  ['dataAccuracy', 'Data accuracy', 'dataAccuracyExplanation'],
  ['queryCorrectness', 'Query correctness', 'queryCorrectnessExplanation'],
  ['responseQuality', 'Response quality', 'responseQualityExplanation'],
] as const;

const barColor = (percent: number) =>
  percent >= 90
    ? 'bg-emerald-500'
    : percent >= 60
      ? 'bg-amber-500'
      : 'bg-rose-500';

const Raw: React.FC<{ value: unknown }> = ({ value }) => (
  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px]">
    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
  </pre>
);

const asPercent = (score: number) =>
  Math.round((score >= 0 && score <= 1 ? score * 100 : score) * 10) / 10;

export const ScoreExplanation: React.FC<{ text: string }> = ({ text }) => (
  <p className="mt-1 min-w-0 whitespace-pre-wrap break-normal text-xs leading-relaxed text-slate-600 [overflow-wrap:normal]">
    {text.split(/([/?&=:|])/).map((part, index) => (
      <React.Fragment key={index}>
        {part}
        {/^[/?&=:|]$/.test(part) && <wbr />}
      </React.Fragment>
    ))}
  </p>
);

export const QualityDimensionsView: React.FC<{
  value: unknown;
  overallScore?: number;
}> = ({ value, overallScore }) => {
  const dimensions = parseQualityDimensions(value);
  if (!dimensions)
    return (
      <section className="mt-2 rounded border border-slate-200 bg-white p-2">
        <h4 className="text-xs font-semibold">Quality dimensions</h4>
        {value == null ? (
          <p className="mt-1 text-xs text-slate-500">Not provided.</p>
        ) : (
          <Raw value={value} />
        )}
      </section>
    );
  const weights = dimensions.scoreWeights;
  const weightedContributions = DIMENSIONS.flatMap(([key, label]) => {
    const score = dimensions[key];
    const weight = weights?.[key];
    if (typeof score !== 'number' || typeof weight !== 'number') return [];
    const percent = asPercent(score);
    return {
      label,
      percent,
      weight,
      points: (percent * weight) / 100,
    };
  });
  const calculatedScore = weightedContributions.reduce(
    (sum, contribution) => sum + contribution.points,
    0,
  );
  const displayedOverall =
    overallScore === undefined ? undefined : asPercent(overallScore);
  return (
    <section className="mt-2 min-w-0 max-w-full rounded border border-slate-200 bg-white p-3">
      <div>
        <h4 className="text-xs font-semibold">Score breakdown</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Each dimension is scored separately. Its weight determines how much it
          contributes to the overall score; a neutral score means that check was
          not configured, not that the agent passed it.
        </p>
      </div>
      {weights && (
        <div className="mt-3 rounded border border-cyan-100 bg-cyan-50 p-2 text-xs text-cyan-950">
          <p className="font-semibold">
            Overall score = weighted contributions
            {displayedOverall !== undefined &&
              ` · reported ${displayedOverall}/100`}
          </p>
          {weightedContributions.length > 0 && (
            <p className="mt-1 leading-relaxed">
              {weightedContributions
                .map(
                  ({ label, percent, weight, points }) =>
                    `${label} (${percent}% × ${Math.round(weight * 100)}%) = ${Math.round(points * 10) / 10}`,
                )
                .join(' + ')}
              {` = ${Math.round(calculatedScore * 10) / 10} points`}
            </p>
          )}
          <p className="mt-1 text-[11px] text-cyan-900">
            Data Accuracy checks expected writes, Query Correctness checks
            expected FHIR queries, and Response Quality checks the response
            criteria.
          </p>
        </div>
      )}
      <ul className="mt-2 space-y-3">
        {DIMENSIONS.map(([key, label, explanationKey]) => {
          const score = dimensions[key];
          if (typeof score !== 'number') return null;
          const percent = asPercent(score);
          const weight = weights?.[key];
          const explanation = dimensions[explanationKey];
          const neutral = /not evaluated|neutral/i.test(explanation || '');
          const contribution =
            typeof weight === 'number' ? (percent * weight) / 100 : undefined;
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{label}</span>
                  {neutral && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      Neutral · not evaluated
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-right font-semibold tabular-nums">
                  {percent}%
                  {typeof weight === 'number' && (
                    <span className="ml-2 block font-normal text-slate-500">
                      weight {Math.round(weight * 100)}%
                      {contribution !== undefined &&
                        ` · ${Math.round(contribution * 10) / 10} points`}
                    </span>
                  )}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className={`h-full ${barColor(percent)}`}
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              </div>
              {explanation && <ScoreExplanation text={explanation} />}
              {key === 'responseQuality' &&
                dimensions.responseQualityCriteria?.length && (
                  <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                    {dimensions.responseQualityCriteria.map(
                      (criterion, index) => {
                        const criterionScore =
                          dimensions.responseQualityScores?.[index];
                        return (
                          <li
                            key={`${index}-${criterion}`}
                            className="flex items-start justify-between gap-3 text-[11px] text-slate-600"
                          >
                            <span className="min-w-0 whitespace-normal break-normal">
                              {criterion}
                            </span>
                            {typeof criterionScore === 'number' && (
                              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                                {asPercent(criterionScore)}%
                              </span>
                            )}
                          </li>
                        );
                      },
                    )}
                  </ul>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const STEP_LABELS: Record<string, string> = {
  FHIR_QUERY: 'FHIR query',
  HITL_SUSPENSION: 'Suspended for plan review',
};

export const ReplayTraceView: React.FC<{ value: unknown }> = ({ value }) => {
  const steps = parseReplayTrace(value);
  if (!steps)
    return (
      <section className="mt-2 rounded border border-slate-200 bg-white p-2">
        <h4 className="text-xs font-semibold">Replay trace</h4>
        {value == null ? (
          <p className="mt-1 text-xs text-slate-500">Not provided.</p>
        ) : (
          <Raw value={value} />
        )}
      </section>
    );
  return (
    <section className="mt-2 rounded border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold">Replay trace ({steps.length})</h4>
      {!steps.length ? (
        <p className="mt-1 text-xs text-slate-500">
          The agent issued no recorded actions.
        </p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
          {steps.map((step, index) => {
            const suspended = step.stepType === 'HITL_SUSPENSION';
            const input = step.input as
              | { resourceType?: string; params?: Record<string, unknown> }
              | undefined;
            return (
              <li key={`${step.stepNumber}-${index}`} className="relative">
                <span
                  className={`absolute -left-[1.4rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ${suspended ? 'bg-amber-600' : 'bg-cyan-700'}`}
                >
                  {step.stepNumber ?? index + 1}
                </span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-800">
                    {STEP_LABELS[step.stepType] || step.stepType}
                  </span>
                  {step.toolName && (
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                      {step.toolName}
                    </code>
                  )}
                  {!suspended && input?.resourceType && (
                    <span className="text-slate-600">{input.resourceType}</span>
                  )}
                  {!!step.durationMs && (
                    <span className="text-slate-400">{step.durationMs} ms</span>
                  )}
                </div>
                {suspended && typeof step.output === 'string' && (
                  <p className="mt-1 text-xs text-amber-800">{step.output}</p>
                )}
                {step.input != null && (
                  <details open={suspended} className="mt-1">
                    <summary className="cursor-pointer text-[11px] font-medium text-cyan-800">
                      {suspended ? 'Proposed plan' : 'Query parameters'}
                    </summary>
                    <div
                      className={`rounded p-2 ${suspended ? 'border border-amber-200 bg-amber-50' : 'bg-slate-50'}`}
                    >
                      <Raw
                        value={
                          !suspended && input?.params
                            ? input.params
                            : step.input
                        }
                      />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
