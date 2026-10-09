import React, { useState } from 'react';
import { AuthoringStep } from '../../services/agentBuilderService';

export type AuthoringTheme = 'professional' | 'ocean' | 'savanna';

export const PHASE0_STEPS: NonNullable<AuthoringStep>[] = [
  'P0_OUTCOME_INTAKE',
  'P0_PROXY_QUESTIONS',
  'P0_TYPE_DECISION',
  'P0_COHORT_CHECK',
  'P0_COHORT_RECIPE',
  'P0_AUTHORING_MODE',
];
const labels = ['Outcome', 'Proxy Q', 'Type', 'Cohort?', 'Cohort', 'Mode'];

export const normalizeProxyReply = (reply: string) =>
  reply
    .trim()
    .replace(/\s+([1-7][.)]\s+)/g, '\n$1')
    .replace(/\r\n?/g, '\n');

export const Phase0Progress: React.FC<{
  step: NonNullable<AuthoringStep>;
  theme?: AuthoringTheme;
}> = ({ step, theme = 'professional' }) => (
  <ol
    aria-label="Guided intake progress"
    className={`flex flex-wrap gap-3 border-b px-5 py-3 ${theme === 'professional' ? 'border-slate-600 bg-slate-800' : theme === 'ocean' ? 'border-amber-200 bg-[#ead9bb]' : 'border-lime-200 bg-[#e5efda]'}`}
  >
    {PHASE0_STEPS.map((value, index) => (
      <li
        key={value}
        aria-current={step === value ? 'step' : undefined}
        className={`flex items-center gap-2 text-xs ${theme === 'professional' ? 'text-white' : theme === 'ocean' ? 'text-[#174a70]' : 'text-[#685714]'}`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${index <= PHASE0_STEPS.indexOf(step) ? (theme === 'professional' ? 'border-white bg-white text-slate-900' : theme === 'ocean' ? 'border-[#174a70] bg-[#174a70] text-white' : 'border-[#75621a] bg-[#75621a] text-white') : theme === 'professional' ? 'border-slate-500 bg-slate-700 text-slate-200' : 'border-slate-400 bg-white text-slate-600'}`}
        >
          {index + 1}
        </span>
        {labels[index]}
      </li>
    ))}
  </ol>
);

const Phase0Authoring: React.FC<{
  step: NonNullable<AuthoringStep>;
  description: string;
  lastAssistantMessage: string;
  busy: boolean;
  theme?: AuthoringTheme;
  onSubmit: (message: string) => Promise<void>;
}> = ({
  step,
  description,
  lastAssistantMessage,
  busy,
  theme = 'professional',
  onSubmit,
}) => {
  const [text, setText] = useState(
    step === 'P0_OUTCOME_INTAKE' ? description : '',
  );
  const [proxyReply, setProxyReply] = useState('');
  const [override, setOverride] = useState(false);
  const [alternative, setAlternative] = useState('AGENT');
  const [mode, setMode] = useState('');
  const inputClass = `mt-2 w-full rounded-lg border p-3 text-sm focus:outline-none focus:ring-2 ${theme === 'professional' ? 'border-slate-500 bg-slate-800 text-white placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-600' : theme === 'ocean' ? 'border-[#c5b18d] bg-[#f6eddd] text-[#174a70] placeholder:text-[#52718a] focus:border-[#28658d] focus:ring-[#c9dce8]' : 'border-[#c0d0a9] bg-[#f0f4e5] text-[#685714] placeholder:text-[#8a7c3e] focus:border-[#8b7928] focus:ring-[#e4dda9]'}`;
  const primaryButtonClass = `rounded-lg px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40 ${theme === 'professional' ? 'bg-slate-600 hover:bg-slate-500' : theme === 'ocean' ? 'bg-[#174a70]' : 'bg-[#75621a]'}`;
  const labelClass = `block text-sm font-medium ${theme === 'professional' ? 'text-white' : theme === 'ocean' ? 'text-[#174a70]' : 'text-[#685714]'}`;
  const send = (message: string) => {
    if (!busy && message.trim()) void onSubmit(message.trim());
  };
  const submitButton = (message: string, label: string) => (
    <button
      type="button"
      disabled={busy || !message.trim()}
      onClick={() => send(message)}
      className={primaryButtonClass}
    >
      {busy ? 'Processing...' : label}
    </button>
  );
  if (!PHASE0_STEPS.includes(step))
    return (
      <p role="alert">
        Unknown intake step. Reopen the session before continuing.
      </p>
    );
  return (
    <fieldset disabled={busy} className="space-y-4">
      {(step === 'P0_OUTCOME_INTAKE' || step === 'P0_COHORT_RECIPE') && (
        <>
          <label className={labelClass}>
            {step === 'P0_OUTCOME_INTAKE'
              ? 'Describe what this persona should accomplish'
              : 'Describe the patient cohort in plain English'}
            <textarea
              rows={step === 'P0_OUTCOME_INTAKE' ? 5 : 4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={inputClass}
            />
          </label>
          {submitButton(
            text,
            step === 'P0_OUTCOME_INTAKE' ? 'Next' : 'Continue',
          )}
        </>
      )}
      {step === 'P0_PROXY_QUESTIONS' && (
        <>
          <label className={labelClass}>
            Your reply
            <textarea
              rows={5}
              value={proxyReply}
              onChange={(event) => setProxyReply(event.target.value)}
              placeholder={
                '1. Ask for an outcome\n2. Provide a goal\n3. No\n4. Yes\n5. Yes\n6. No\n7. Free-form text'
              }
              className={inputClass}
            />
          </label>
          <p
            className={`text-xs ${theme === 'professional' ? 'text-slate-300' : theme === 'ocean' ? 'text-[#456783]' : 'text-[#786b35]'}`}
          >
            Reply in one line or across multiple lines. Number your answers 1–7.
          </p>
          <button
            type="button"
            disabled={busy || !proxyReply.trim()}
            onClick={() => send(normalizeProxyReply(proxyReply))}
            className={primaryButtonClass}
          >
            Submit reply
          </button>
        </>
      )}
      {step === 'P0_TYPE_DECISION' && (
        <>
          <p
            className={`whitespace-pre-wrap text-sm ${theme === 'professional' ? 'text-white' : theme === 'ocean' ? 'text-[#174a70]' : 'text-[#685714]'}`}
          >
            {lastAssistantMessage}
          </p>
          <div className="flex flex-wrap gap-2">
            {submitButton('accept', 'Accept recommendation')}
            <button
              type="button"
              onClick={() => setOverride(!override)}
              className={`rounded-lg border px-3 py-2 text-sm ${theme === 'professional' ? 'border-slate-500 text-white' : theme === 'ocean' ? 'border-[#bba781] text-[#174a70]' : 'border-[#bac99f] text-[#685714]'}`}
            >
              Override
            </button>
          </div>
          {override && (
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Override persona type"
                value={alternative}
                onChange={(event) => setAlternative(event.target.value)}
                className={`rounded-lg border p-2 text-sm ${theme === 'professional' ? 'border-slate-500 bg-slate-800 text-white' : theme === 'ocean' ? 'border-[#bba781] bg-[#f6eddd] text-[#174a70]' : 'border-[#bac99f] bg-[#f0f4e5] text-[#685714]'}`}
              >
                <option value="AGENT">AGENT</option>
                <option value="DATA_PIPELINE">DATA_PIPELINE</option>
              </select>
              {submitButton(`override:${alternative}`, 'Confirm override')}
            </div>
          )}
        </>
      )}
      {step === 'P0_COHORT_CHECK' && (
        <>
          <p
            className={`text-sm font-medium ${theme === 'professional' ? 'text-white' : theme === 'ocean' ? 'text-[#174a70]' : 'text-[#685714]'}`}
          >
            Does this persona target a specific patient cohort?
          </p>
          <div className="flex gap-2">
            {submitButton('yes', 'Yes')}
            {submitButton('no', 'No')}
          </div>
        </>
      )}
      {step === 'P0_AUTHORING_MODE' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                'fixed-workflow',
                'Fixed workflow',
                'Step-by-step pipeline; same execution path every time. Best for ETL or document processing.',
              ],
              [
                'parameterized',
                'Parameterized',
                'Fixed workflow with configurable parameters (age thresholds, lookback windows, etc.).',
              ],
              [
                'dynamic-agent',
                'Dynamic agent',
                'AI reasons at runtime to plan and execute steps. Best for open-ended clinical queries.',
              ],
            ].map(([value, label, detail]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 ${mode === value ? (theme === 'professional' ? 'border-slate-300 bg-slate-700' : theme === 'ocean' ? 'border-[#28658d] bg-[#f6eddd]' : 'border-[#8b7928] bg-[#f0f4e5]') : theme === 'professional' ? 'border-slate-600 bg-slate-800' : theme === 'ocean' ? 'border-[#c5b18d] bg-[#f1e5d0]' : 'border-[#c0d0a9] bg-[#eaf0df]'}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="phase0-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <span
                    className={`text-sm font-semibold ${theme === 'professional' ? 'text-white' : theme === 'ocean' ? 'text-[#174a70]' : 'text-[#685714]'}`}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={`mt-2 block text-xs ${theme === 'professional' ? 'text-slate-300' : theme === 'ocean' ? 'text-[#456783]' : 'text-[#786b35]'}`}
                >
                  {detail}
                </span>
              </label>
            ))}
          </div>
          {submitButton(mode, 'Start Authoring')}
        </>
      )}
    </fieldset>
  );
};

export default Phase0Authoring;
