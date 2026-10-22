import { useEffect, useRef, useState } from 'react';
import {
  abandonOnboardingSession,
  createOnboardingSession,
  getOnboardingSession,
  listOnboardingSessions,
  OnboardingSessionSummary,
  pauseOnboardingSession,
  sendOnboardingMessage,
  streamOnboardingSession,
} from '../../services/configuredAssetsService';

type ChatMessage = { role: 'assistant' | 'user' | 'system'; content: string };
type ToolProgress = {
  tool: string;
  status: 'working' | 'done' | 'error';
  summary?: string;
};

const phases = ['Model', 'APIs', 'Workflow'];
const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

const conversationMessages = (
  session: OnboardingSessionSummary,
): ChatMessage[] =>
  (session.conversation || []).flatMap((message) => {
    const content = message.content || message.message;
    if (!content) return [];
    return [
      {
        role:
          message.role?.toLowerCase() === 'user'
            ? ('user' as const)
            : ('assistant' as const),
        content,
      },
    ];
  });

export default function ServiceOnboarding({
  onBack,
  onViewAsset,
  startImmediately = false,
}: {
  onBack: () => void;
  onViewAsset: (resourceType: string) => void;
  startImmediately?: boolean;
}) {
  const [sessions, setSessions] = useState<OnboardingSessionSummary[]>([]);
  const [session, setSession] = useState<OnboardingSessionSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState(1);
  const [tool, setTool] = useState<ToolProgress | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const liveText = useRef('');
  const lastEventId = useRef('');
  const autoStarted = useRef(false);
  const responseTimer = useRef<number | null>(null);
  const sessionId = session?.sessionId;

  useEffect(() => {
    if (session) return;
    let active = true;
    setBusy(true);
    void listOnboardingSessions()
      .then(
        (result) => {
          if (active) {
            setSessions(result);
            setError(null);
          }
        },
        (failure: unknown) => {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Unable to load onboarding sessions.',
            );
        },
      )
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [session, attempt]);

  useEffect(() => {
    if (!sessionId || complete) return;
    const controller = new AbortController();
    let active = true;
    let retry = 0;
    const onEvent = (event: { type: string; [key: string]: unknown }) => {
      if (typeof event.id === 'string' && event.id)
        lastEventId.current = event.id;
      switch (event.type) {
        case 'message_delta':
          liveText.current += String(event.content || '');
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (
              last?.role === 'assistant' &&
              last.content ===
                liveText.current.slice(0, -String(event.content || '').length)
            ) {
              next[next.length - 1] = { ...last, content: liveText.current };
            } else next.push({ role: 'assistant', content: liveText.current });
            return next;
          });
          setSending(false);
          break;
        case 'message_end':
          liveText.current = '';
          setSending(false);
          if (responseTimer.current) window.clearTimeout(responseTimer.current);
          responseTimer.current = null;
          break;
        case 'tool_call_start':
          setTool({ tool: String(event.tool || 'Tool'), status: 'working' });
          break;
        case 'tool_call_complete':
          setTool({
            tool: String(event.tool || 'Tool'),
            status: 'done',
            summary: String(event.summary || 'Completed'),
          });
          break;
        case 'tool_call_error':
          setTool({
            tool: String(event.tool || 'Tool'),
            status: 'error',
            summary: String(event.error || 'Operation failed'),
          });
          break;
        case 'phase_transition': {
          const to = Number(event.to || 1);
          setPhase(to);
          setMessages((current) => [
            ...current,
            {
              role: 'system',
              content: `Moving to Phase ${to}: ${String(event.label || phases[to - 1] || 'Workflow')}`,
            },
          ]);
          break;
        }
        case 'session_complete':
          setComplete(true);
          setSending(false);
          setSession((current) =>
            current
              ? {
                  ...current,
                  entityName: String(
                    event.resourceType ||
                      event.entityName ||
                      current.entityName ||
                      '',
                  ),
                }
              : current,
          );
          break;
        case 'session_error':
          setSessionError(
            String(
              event.message || 'The onboarding session encountered an error.',
            ),
          );
          setSending(false);
          if (responseTimer.current) window.clearTimeout(responseTimer.current);
          responseTimer.current = null;
          break;
        case 'heartbeat':
          break;
        default:
          break;
      }
    };
    const connect = async () => {
      while (active && !controller.signal.aborted) {
        try {
          setStreaming(false);
          await streamOnboardingSession(
            sessionId,
            onEvent,
            controller.signal,
            lastEventId.current || undefined,
          );
          retry = 0;
        } catch (failure) {
          if (controller.signal.aborted) break;
          setError(
            failure instanceof Error
              ? failure.message
              : 'Onboarding stream disconnected.',
          );
        }
        if (!active || controller.signal.aborted) break;
        setStreaming(false);
        setError('Reconnecting to the onboarding session…');
        await wait(Math.min(1000 * 2 ** retry++, 30000), controller.signal);
      }
    };
    setError(null);
    setStreaming(true);
    void connect();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionId, complete]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createOnboardingSession();
      sessionStorage.setItem('service-onboarding-session', created.sessionId);
      setSession({ sessionId: created.sessionId, status: created.status });
      setMessages([]);
      setPhase(1);
      setComplete(false);
      setTool(null);
      setSessionError(null);
      lastEventId.current = '';
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to create onboarding session.',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (startImmediately && !autoStarted.current) {
      autoStarted.current = true;
      void start();
    }
  }, [startImmediately]);

  const resume = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await getOnboardingSession(id);
      sessionStorage.setItem('service-onboarding-session', id);
      setSession(loaded);
      setMessages(conversationMessages(loaded));
      setPhase(loaded.currentPhase || 1);
      setComplete(loaded.status === 'COMPLETE');
      setSessionError(null);
      setTool(null);
      setLastDraft(id);
      lastEventId.current = '';
    } catch (failure) {
      if (
        failure instanceof Error &&
        /404|no longer available/i.test(failure.message)
      )
        setError('This session is no longer available.');
      else
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to resume session.',
        );
    } finally {
      setBusy(false);
    }
  };

  const setLastDraft = (id: string) => {
    setDraft(localStorage.getItem(`service-onboarding-draft:${id}`) || '');
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !sessionId || sending) return;
    setDraft('');
    localStorage.removeItem(`service-onboarding-draft:${sessionId}`);
    setMessages((current) => [...current, { role: 'user', content }]);
    setSending(true);
    setSessionError(null);
    responseTimer.current = window.setTimeout(() => {
      setSessionError(
        'The AI is taking longer than expected. Retry the last message.',
      );
      setSending(false);
    }, 30000);
    try {
      await sendOnboardingMessage(sessionId, content);
    } catch (failure) {
      setSessionError(
        failure instanceof Error ? failure.message : 'Unable to send message.',
      );
      setSending(false);
      if (responseTimer.current) window.clearTimeout(responseTimer.current);
      responseTimer.current = null;
    }
  };

  const retryLastMessage = async () => {
    if (!sessionId) return;
    const last = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    if (!last) return;
    setSessionError(null);
    setSending(true);
    responseTimer.current = window.setTimeout(() => {
      setSessionError(
        'The AI is taking longer than expected. Retry the last message.',
      );
      setSending(false);
    }, 30000);
    try {
      await sendOnboardingMessage(sessionId, last.content);
    } catch (failure) {
      setSessionError(
        failure instanceof Error
          ? failure.message
          : 'Unable to resend message.',
      );
      setSending(false);
      if (responseTimer.current) window.clearTimeout(responseTimer.current);
      responseTimer.current = null;
    }
  };

  const pause = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await pauseOnboardingSession(sessionId);
      sessionStorage.removeItem('service-onboarding-session');
      setSession(null);
      setComplete(false);
      setNotice('Session paused. Resume any time from My Sessions.');
      setAttempt((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to pause this session.',
      );
    } finally {
      setBusy(false);
    }
  };

  const abandon = async (id: string) => {
    if (
      !window.confirm(
        'Abandon this session? Any assets already created remain active.',
      )
    )
      return;
    setBusy(true);
    try {
      await abandonOnboardingSession(id);
      setAttempt((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to abandon session.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    const resourceType = session.entityName || '';
    return (
      <section className="mx-auto max-w-4xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
              New Data Asset
            </p>
            <h2 className="text-xl font-semibold">
              {resourceType || 'Guided setup'}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void pause()}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            Pause
          </button>
        </header>
        <nav
          aria-label="Onboarding phases"
          className="mb-4 flex items-center gap-2 border-y border-slate-200 py-4"
        >
          {phases.map((label, index) => {
            const number = index + 1;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${number < phase ? 'bg-emerald-700 text-white' : number === phase ? 'bg-cyan-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {number < phase ? '✓' : number}
                </span>
                <span
                  className={`text-sm ${number === phase ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
                >
                  {label}
                </span>
                {index < phases.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="ml-auto h-px flex-1 bg-slate-200"
                  />
                )}
              </div>
            );
          })}
        </nav>
        {error && (
          <p role="status" className="mb-3 text-xs text-amber-800">
            {error}
          </p>
        )}
        <div
          className="mb-4 max-h-[55vh] min-h-64 space-y-3 overflow-auto border-y border-slate-200 py-4"
          aria-live="polite"
        >
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`max-w-[90%] whitespace-pre-wrap break-words px-3 py-2 text-sm ${message.role === 'user' ? 'ml-auto bg-cyan-50 text-slate-800' : message.role === 'system' ? 'mx-auto text-center text-xs text-slate-500' : 'bg-slate-50 text-slate-800'}`}
            >
              <strong className="mr-2 text-xs uppercase text-slate-500">
                {message.role === 'assistant' ? 'AI' : message.role}
              </strong>
              {message.content}
            </div>
          ))}
          {tool && (
            <div
              className={`border-l-4 p-3 text-sm ${tool.status === 'error' ? 'border-rose-500 bg-rose-50 text-rose-800' : tool.status === 'done' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-cyan-600 bg-cyan-50 text-cyan-900'}`}
              role={tool.status === 'error' ? 'alert' : 'status'}
            >
              {tool.status === 'working'
                ? 'Working…'
                : tool.status === 'done'
                  ? '✓'
                  : '✕'}{' '}
              {tool.tool}
              {tool.summary ? ` · ${tool.summary}` : ''}
            </div>
          )}
          {!streaming && !complete && (
            <p className="text-xs text-amber-700">Reconnecting…</p>
          )}
        </div>
        {sessionError && (
          <div
            role="alert"
            className="mb-3 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {sessionError}{' '}
            <button
              type="button"
              disabled={sending}
              onClick={() => void retryLastMessage()}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}
        {complete ? (
          <div className="border-l-4 border-emerald-600 bg-emerald-50 p-4">
            <h3 className="font-semibold text-emerald-900">
              {resourceType || 'Your data asset'} is ready.
            </h3>
            <p className="mt-1 text-sm text-emerald-800">
              The onboarding session is complete.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('service-onboarding-session');
                  setSession(null);
                  onViewAsset(resourceType);
                }}
                className="rounded bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
              >
                View {resourceType || 'asset'}
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('service-onboarding-session');
                  setSession(null);
                  setAttempt((value) => value + 1);
                }}
                className="rounded border border-emerald-700 px-3 py-2 text-sm"
              >
                My Sessions
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Type your message</span>
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (sessionId)
                    localStorage.setItem(
                      `service-onboarding-draft:${sessionId}`,
                      event.target.value,
                    );
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send(event);
                  }
                }}
                disabled={sending}
                rows={2}
                placeholder="Describe the data asset you want to configure…"
                className="w-full resize-y rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>
            <button
              disabled={sending || !draft.trim()}
              className="rounded bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm text-slate-600 underline"
        >
          Back to Data Assets
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
            Onboarding Session History
          </p>
          <h2 className="text-xl font-semibold text-slate-900">My Sessions</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          className="rounded bg-cyan-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          + New Asset
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-3 border-l-4 border-rose-400 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}{' '}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="underline"
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mb-3 border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {busy ? (
        <p role="status" className="py-6 text-sm text-slate-500">
          Loading sessions…
        </p>
      ) : !sessions.length ? (
        <p className="py-6 text-sm text-slate-500">
          No onboarding sessions yet.
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {['Entity', 'Phase', 'Status', 'Last updated', 'Actions'].map(
                  (label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.sessionId} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium">
                    {item.entityName || 'Untitled'}
                  </td>
                  <td className="px-3 py-3">{item.currentPhase || 1}/3</td>
                  <td className="px-3 py-3">
                    {item.status === 'COMPLETE'
                      ? '✓ Complete'
                      : item.status === 'ABANDONED'
                        ? 'Abandoned'
                        : '⏸ In progress'}
                  </td>
                  <td className="px-3 py-3">
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-3">
                      {item.status === 'COMPLETE' ? (
                        <button
                          type="button"
                          onClick={() => onViewAsset(item.entityName || '')}
                          className="text-cyan-800 underline"
                        >
                          View asset
                        </button>
                      ) : item.status !== 'ABANDONED' ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void resume(item.sessionId)}
                            className="text-cyan-800 underline"
                          >
                            Resume
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void abandon(item.sessionId)}
                            className="text-rose-700 underline"
                          >
                            Abandon
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-4 text-sm text-slate-600 underline"
      >
        Back to Rules &amp; Workflows
      </button>
    </section>
  );
}
