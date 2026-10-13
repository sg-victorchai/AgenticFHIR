import React, { useState } from 'react';
import { AuthoringStep } from '../../services/agentBuilderService';

export type AuthoringTheme = 'professional' | 'blue-horizon';

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
    className={`flex flex-wrap gap-3 border-b px-5 py-3 ${theme === 'professional' ? 'border-slate-200 bg-white' : 'border-[#d9e5fb] bg-[#f2f6fd]'}`}
  >
    {PHASE0_STEPS.map((value, index) => (
      <li
        key={value}
        aria-current={step === value ? 'step' : undefined}
        className={`flex items-center gap-2 text-xs ${theme === 'professional' ? 'text-slate-800' : 'text-[#263858]'}`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${index <= PHASE0_STEPS.indexOf(step) ? (theme === 'professional' ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#477bea] bg-[#477bea] text-white') : theme === 'professional' ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-[#cbd8ed] bg-white text-[#5c6f91]'}`}
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
  const inputClass = `mt-2 w-full rounded-lg border p-3 text-sm focus:outline-none focus:ring-2 ${theme === 'professional' ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-200' : 'border-[#d4def0] bg-[#f8faff] text-[#263858] placeholder:text-[#7e8ca5] focus:border-[#86a9f2] focus:ring-[#dbe7ff]'}`;
  const primaryButtonClass = `rounded-lg px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40 ${theme === 'professional' ? 'bg-[#262626] hover:bg-[#404040]' : 'bg-[#477bea] hover:bg-[#3568d4]'}`;
  const labelClass = `block text-sm font-medium ${theme === 'professional' ? 'text-slate-900' : 'text-[#263858]'}`;
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
    <fieldset
      disabled={busy}
      className={step === 'P0_PROXY_QUESTIONS' ? 'space-y-2' : 'space-y-4'}
    >
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
          <div>
            <label className={labelClass} htmlFor="phase0-proxy-reply">
              Your reply
            </label>
            <div className="relative mt-2">
              <textarea
                id="phase0-proxy-reply"
                rows={2}
                value={proxyReply}
                onChange={(event) => setProxyReply(event.target.value)}
                placeholder={
                  '1. Ask for an outcome\n2. Provide a goal\n3. No\n4. Yes\n5. Yes\n6. No\n7. Free-form text'
                }
                className={`${inputClass.replace('mt-2 ', '')} resize-y pr-12`}
              />
              <button
                type="button"
                aria-label="Send reply"
                title="Send reply"
                disabled={busy || !proxyReply.trim()}
                onClick={() => send(normalizeProxyReply(proxyReply))}
                className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${theme === 'professional' ? 'text-slate-800 hover:bg-slate-100' : 'bg-[#477bea] text-white hover:bg-[#3568d4]'}`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5m-6 6 6-6 6 6" />
                </svg>
              </button>
            </div>
          </div>
          <p
            className={`text-xs ${theme === 'professional' ? 'text-slate-500' : 'text-[#5f7090]'}`}
          >
            Reply in one line or across multiple lines. Number your answers 1–7.
          </p>
        </>
      )}
      {step === 'P0_TYPE_DECISION' && (
        <>
          <p
            className={`whitespace-pre-wrap text-sm ${theme === 'professional' ? 'text-slate-900' : 'text-[#263858]'}`}
          >
            {lastAssistantMessage}
          </p>
          <div className="flex flex-wrap gap-2">
            {submitButton('accept', 'Accept recommendation')}
            <button
              type="button"
              onClick={() => setOverride(!override)}
              className={`rounded-lg border px-3 py-2 text-sm ${theme === 'professional' ? 'border-slate-300 text-slate-800 hover:bg-slate-100' : 'border-[#cbd8ed] text-[#355faa] hover:bg-[#f1f5fd]'}`}
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
                className={`rounded-lg border p-2 text-sm ${theme === 'professional' ? 'border-slate-300 bg-white text-slate-900' : 'border-[#d4def0] bg-[#f8faff] text-[#263858]'}`}
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
            className={`text-sm font-medium ${theme === 'professional' ? 'text-slate-900' : 'text-[#263858]'}`}
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
                className={`cursor-pointer rounded-lg border p-3 ${mode === value ? (theme === 'professional' ? 'border-slate-400 bg-slate-100' : 'border-[#86a9f2] bg-[#eaf1ff]') : theme === 'professional' ? 'border-slate-200 bg-white' : 'border-[#d9e5fb] bg-[#f7f9fe]'}`}
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
                    className={`text-sm font-semibold ${theme === 'professional' ? 'text-slate-900' : 'text-[#263858]'}`}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={`mt-2 block text-xs ${theme === 'professional' ? 'text-slate-600' : 'text-[#5f7090]'}`}
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
