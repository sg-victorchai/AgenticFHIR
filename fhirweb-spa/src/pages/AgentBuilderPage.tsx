import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  agentBuilderService,
  AuthoringSession,
  EvalRun,
  PersonaDetail,
  PersonaSummary,
  SeedStatus,
} from '../services/agentBuilderService';

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'default';
type View = 'marketplace' | 'authoring' | 'evaluations' | 'admin';
type Toast = { kind: 'success' | 'error'; text: string } | null;

const Icon: React.FC<{ name: string; className?: string }> = ({
  name,
  className = 'h-4 w-4',
}) => {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-5 5" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    close: (
      <>
        <path d="m18 6-12 12M6 6l12 12" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
        <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m8 5 12 7-12 7V5Z" />,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'dark' | 'light' | 'accent' | 'danger';
  }
> = ({ tone = 'light', className = '', ...props }) => {
  const tones = {
    dark: 'bg-slate-950 text-white hover:bg-slate-800',
    light:
      'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    accent: 'bg-cyan-600 text-white hover:bg-cyan-700',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
  };
  return (
    <button
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
};

const StatusBadge: React.FC<{ value?: string }> = ({ value }) => {
  if (!value) return null;
  const color =
    value === 'PRODUCTION_APPROVED'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : value === 'REVIEW'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${color}`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
};

const dateTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : '—';
const readJson = <T,>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const AgentBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('marketplace');
  const [source, setSource] = useState<'all' | 'platform' | 'portal'>('all');
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [mine, setMine] = useState<PersonaSummary[]>([]);
  const [sessions, setSessions] = useState<AuthoringSession[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PersonaSummary | null>(null);
  const [detail, setDetail] = useState<PersonaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [personaType, setPersonaType] = useState<'AGENT' | 'DATA_PIPELINE'>(
    'AGENT',
  );
  const [authoringMode, setAuthoringMode] = useState<
    'FROM_SCRATCH' | 'ADAPT_FROM'
  >('FROM_SCRATCH');
  const [sourcePersonaId, setSourcePersonaId] = useState('');
  const [sourcePersonaVersion, setSourcePersonaVersion] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [evaluationTarget, setEvaluationTarget] =
    useState<PersonaSummary | null>(null);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioQuestion, setScenarioQuestion] = useState('');
  const [scenarioParams, setScenarioParams] = useState('{}');
  const [seedDescription, setSeedDescription] = useState(
    'A small representative test cohort',
  );
  const [seedGroups, setSeedGroups] = useState(
    '[\n  { "label": "Representative cohort", "count": 1 }\n]',
  );
  const [seedJob, setSeedJob] = useState<SeedStatus | null>(null);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [formatters, setFormatters] = useState<Record<string, any> | null>(
    null,
  );

  const notify = (kind: 'success' | 'error', text: string) =>
    setToast({ kind, text });
  const loadWorkspace = useCallback(async () => {
    try {
      const [allPersonas, ownPersonas, ownSessions] = await Promise.all([
        agentBuilderService.listPersonas('all'),
        agentBuilderService.listMine(),
        agentBuilderService.listSessions(),
      ]);
      setPersonas(allPersonas);
      setMine(ownPersonas);
      setSessions(
        ownSessions.filter((session) => session.status !== 'ABANDONED'),
      );
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to load AgentBuilder workspace.',
      );
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const visiblePersonas = useMemo(
    () =>
      personas.filter((persona) => {
        const matchesSource =
          source === 'all' || persona.authoringSource === source;
        const text =
          `${persona.name} ${persona.personaId} ${persona.description ?? ''}`.toLowerCase();
        return matchesSource && text.includes(query.toLowerCase());
      }),
    [personas, query, source],
  );

  const openPersona = async (persona: PersonaSummary) => {
    setSelected(persona);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(
        await agentBuilderService.getPersona(
          persona.personaId,
          persona.version,
        ),
      );
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to load persona details.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const startSession = async () => {
    setBusy(true);
    try {
      const created = await agentBuilderService.createSession({
        personaType,
        authoringMode,
        ...(authoringMode === 'ADAPT_FROM'
          ? { sourcePersonaId, sourcePersonaVersion }
          : {}),
      });
      setSessionId(created.sessionId);
      setSessionDraft('');
      setChatError(null);
      setShowCreate(false);
      setView('authoring');
      await loadWorkspace();
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to start authoring session.',
      );
    } finally {
      setBusy(false);
    }
  };

  const resumeSession = async (session: AuthoringSession) => {
    setBusy(true);
    try {
      await agentBuilderService.resumeSession(session.session_id);
      setSessionId(session.session_id);
      setChatError(null);
      const detail = await agentBuilderService.getSession(session.session_id);
      setSessionDraft(JSON.stringify(detail, null, 2));
      setView('authoring');
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Unable to resume session.',
      );
    } finally {
      setBusy(false);
    }
  };

  const sendAuthoringMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionId || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatBusy(true);
    setChatError(null);
    setSessionDraft((previous) => `${previous}\n\nYou\n${text}\n\nAgent\n`);
    try {
      await agentBuilderService.streamMessage(sessionId, text, (token) => {
        setSessionDraft((previous) => previous + token);
      });
      setSessionDraft((previous) => previous + '\n');
      await loadWorkspace();
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'Authoring stream failed.',
      );
    } finally {
      setChatBusy(false);
    }
  };

  const abandonSession = async (id: string) => {
    if (
      !window.confirm(
        'Abandon this authoring session? Its work will remain in history but it will no longer appear as in progress.',
      )
    )
      return;
    try {
      await agentBuilderService.abandonSession(id);
      if (sessionId === id) setSessionId(null);
      notify('success', 'Authoring session abandoned.');
      await loadWorkspace();
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Unable to abandon session.',
      );
    }
  };

  const refreshEvalRuns = useCallback(async (persona: PersonaSummary) => {
    try {
      setEvalRuns(
        await agentBuilderService.listEvalRuns(persona.personaId, TENANT_ID),
      );
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to load evaluation runs.',
      );
    }
  }, []);

  const beginEvaluation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!evaluationTarget) return;
    setBusy(true);
    try {
      const scenario = await agentBuilderService.createScenario({
        personaId: evaluationTarget.personaId,
        scenarioName: scenarioName.trim(),
        scenarioType: evaluationTarget.personaType,
        seedSpec: {
          description: seedDescription.trim(),
          cohortGroups: JSON.parse(seedGroups),
          expectedCohortSize: (JSON.parse(seedGroups) as any[]).reduce(
            (sum, group) => sum + Number(group.count || 0),
            0,
          ),
        },
        ...(evaluationTarget.personaType === 'AGENT'
          ? {
              conversationScript: [
                { role: 'user', content: scenarioQuestion.trim() },
              ],
            }
          : { missionParams: JSON.parse(scenarioParams) }),
        generateRubric: true,
      });
      setScenarioId(scenario.scenarioId);
      const seed = await agentBuilderService.seedScenario(scenario.scenarioId);
      setSeedJob({ ...seed, seedStatus: 'PENDING' });
      setEvalRun(null);
      setEvaluationTarget(null);
      setView('evaluations');
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to create and seed scenario. Check JSON fields.',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      !seedJob ||
      ['COMPLETED', 'FAILED', 'TORN_DOWN'].includes(seedJob.seedStatus)
    )
      return;
    const timer = setInterval(async () => {
      try {
        const status = await agentBuilderService.getSeedStatus(
          seedJob.seedJobId,
        );
        setSeedJob(status);
      } catch (error) {
        notify(
          'error',
          error instanceof Error ? error.message : 'Unable to poll seed job.',
        );
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [seedJob?.seedJobId, seedJob?.seedStatus]);

  const submitEvaluation = async () => {
    if (
      !evaluationTarget ||
      !scenarioId ||
      !seedJob ||
      seedJob.seedStatus !== 'COMPLETED'
    )
      return;
    setBusy(true);
    try {
      const submitted = await agentBuilderService.submitEval({
        personaId: evaluationTarget.personaId,
        version: evaluationTarget.version,
        scenarioId,
        tenantId: TENANT_ID,
        evalTenantId: seedJob.evalTenantId,
      });
      setEvalRun({
        runId: submitted.runId,
        personaId: evaluationTarget.personaId,
        personaVersion: evaluationTarget.version,
        runStatus: 'PENDING',
      });
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Unable to submit evaluation.',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!evalRun || !['PENDING', 'RUNNING'].includes(evalRun.runStatus)) return;
    const timer = setInterval(async () => {
      try {
        setEvalRun(await agentBuilderService.getEval(evalRun.runId));
      } catch (error) {
        notify(
          'error',
          error instanceof Error ? error.message : 'Unable to poll evaluation.',
        );
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [evalRun?.runId, evalRun?.runStatus]);

  const runLifecycle = async (
    action: 'promote' | 'approve' | 'retire',
    persona: PersonaSummary,
  ) => {
    if (
      action === 'retire' &&
      !window.confirm(`Retire ${persona.name} ${persona.version}?`)
    )
      return;
    setBusy(true);
    try {
      await agentBuilderService.lifecycle(
        action,
        persona.personaId,
        persona.version,
        TENANT_ID,
      );
      notify(
        'success',
        `${persona.name} ${action === 'promote' ? 'submitted for review' : action === 'approve' ? 'approved for production' : 'retired'}.`,
      );
      await loadWorkspace();
      if (selected?.personaId === persona.personaId) await openPersona(persona);
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : `Unable to ${action} persona.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const forkPersona = async (persona: PersonaSummary) => {
    setBusy(true);
    try {
      const fork = await agentBuilderService.fork(
        persona.personaId,
        persona.version,
        TENANT_ID,
      );
      notify('success', `Created draft ${fork.newVersion}.`);
      await loadWorkspace();
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Unable to fork persona.',
      );
    } finally {
      setBusy(false);
    }
  };

  const loadAdminAssets = async () => {
    try {
      const [skillList, formatterList] = await Promise.all([
        agentBuilderService.listSkills(),
        agentBuilderService.listFormatters(),
      ]);
      setSkills(skillList);
      setFormatters(formatterList);
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to load platform assets.',
      );
    }
  };

  useEffect(() => {
    if (view === 'admin') void loadAdminAssets();
  }, [view]);
  const syncSkills = async () => {
    setBusy(true);
    try {
      const result = await agentBuilderService.syncSkills();
      notify(
        'success',
        `Skill sync complete · ${result.skillsUpdated ?? 0} updated.`,
      );
      await loadAdminAssets();
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Unable to sync skills.',
      );
    } finally {
      setBusy(false);
    }
  };

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: 'marketplace', label: 'Marketplace', icon: 'grid' },
    { id: 'authoring', label: 'Builder', icon: 'chat' },
    { id: 'evaluations', label: 'Evaluations', icon: 'chart' },
    { id: 'admin', label: 'Platform assets', icon: 'settings' },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-[#111827] text-slate-300 lg:flex">
          <div className="border-b border-slate-800 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
                <Icon name="sparkle" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AgentBuilder</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  Persona studio
                </p>
              </div>
            </div>
          </div>
          <div className="px-3 py-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              Workspace
            </p>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${view === item.id ? 'bg-slate-800 text-white ring-1 ring-slate-700' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.id === 'authoring' && sessions.length > 0 && (
                  <span className="ml-auto rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">
                    {sessions.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-slate-800 p-4">
            <div className="rounded-xl bg-slate-900 p-3">
              <p className="text-xs font-medium text-slate-300">
                Sandbox first
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Evaluate in an isolated tenant before promoting a persona.
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7">
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
                  <Icon name="sparkle" />
                </div>
                <span className="text-sm font-semibold">AgentBuilder</span>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs text-slate-500">
                  Platform /{' '}
                  <span className="text-slate-800">
                    {navItems.find((item) => item.id === view)?.label}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                  AGENTBUILDER ACCESS
                </span>
                <Button onClick={() => navigate('/')}>
                  <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
                  Exit portal
                </Button>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${view === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">
            {toast && (
              <div
                className={`mb-4 rounded-lg border px-4 py-3 text-sm ${toast.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
              >
                {toast.text}
              </div>
            )}

            {view === 'marketplace' && (
              <section>
                <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                      Build · evaluate · deploy
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      Agent marketplace
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                      Discover production agents, adapt a proven persona, or
                      build one for your workflow.
                    </p>
                  </div>
                  <Button
                    tone="dark"
                    onClick={() => {
                      setShowCreate(true);
                      setView('authoring');
                    }}
                  >
                    <Icon name="plus" />
                    New persona
                  </Button>
                </div>
                <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    [
                      'Available personas',
                      personas.length,
                      'Across platform and workspace',
                    ],
                    ['My personas', mine.length, 'Owned by your account'],
                    ['In progress', sessions.length, 'Authoring sessions'],
                    [
                      'Production ready',
                      personas.filter(
                        (persona) =>
                          persona.lifecycleState === 'PRODUCTION_APPROVED',
                      ).length,
                      'Approved versions',
                    ],
                  ].map(([label, value, hint]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/[0.02]"
                    >
                      <p className="text-[11px] font-medium text-slate-500">
                        {label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">
                        {value}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Icon
                      name="search"
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Find a persona by name or capability…"
                      className="w-full rounded-lg border border-transparent bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {(['all', 'platform', 'portal'] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => setSource(value)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${source === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {value === 'all' ? 'All personas' : value}
                      </button>
                    ))}
                  </div>
                  <Button onClick={() => void loadWorkspace()} disabled={busy}>
                    Refresh
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {visiblePersonas.map((persona) => (
                    <article
                      key={`${persona.personaId}-${persona.version}`}
                      className="group flex min-h-52 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-900/[0.06]"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
                            <Icon name="sparkle" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {persona.name}
                            </p>
                            <p className="truncate font-mono text-[10px] text-slate-400">
                              {persona.personaId}
                            </p>
                          </div>
                        </div>
                        <StatusBadge value={persona.lifecycleState} />
                      </div>
                      <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">
                        {persona.description || 'No description provided.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                          {persona.personaType}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
                          {persona.version}
                        </span>
                        <span
                          className={`rounded px-2 py-1 text-[10px] font-medium ${persona.authoringSource === 'platform' ? 'bg-indigo-50 text-indigo-700' : 'bg-cyan-50 text-cyan-700'}`}
                        >
                          {persona.authoringSource}
                        </span>
                        {persona.scope && (
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                            {persona.scope} scope
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-[10px] text-slate-400">
                          Updated {dateTime(persona.updatedAt)}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEvaluationTarget(persona);
                              setScenarioName(`${persona.name} evaluation`);
                              setScenarioQuestion('');
                              setView('evaluations');
                            }}
                            className="text-xs font-medium text-slate-500 hover:text-cyan-700"
                          >
                            Evaluate
                          </button>
                          <button
                            onClick={() => void openPersona(persona)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-cyan-700"
                          >
                            Inspect <Icon name="arrow" className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {visiblePersonas.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                    <p className="text-sm font-medium">
                      No personas match this view
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Try another source filter or search term.
                    </p>
                  </div>
                )}
              </section>
            )}

            {view === 'authoring' && (
              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr),340px]">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                        Persona workbench
                      </p>
                      <h1 className="mt-1 text-lg font-semibold">
                        {sessionId ? 'Authoring session' : 'Create a persona'}
                      </h1>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setShowCreate(true)}>
                        <Icon name="plus" />
                        New session
                      </Button>
                      <Button onClick={() => void loadWorkspace()}>
                        Refresh
                      </Button>
                    </div>
                  </div>
                  {sessionId ? (
                    <>
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5">
                        <span className="truncate font-mono text-[11px] text-slate-500">
                          Session {sessionId}
                        </span>
                        <Button
                          onClick={() => {
                            setSessionId(null);
                            setChatError(null);
                          }}
                        >
                          Close session
                        </Button>
                      </div>
                      <div className="max-h-[58vh] min-h-72 overflow-y-auto bg-[#fafbfd] px-5 py-4">
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                          {sessionDraft ||
                            'The authoring assistant is ready. Describe the clinical workflow or the persona you want to build.'}
                        </pre>
                      </div>
                      <form
                        onSubmit={sendAuthoringMessage}
                        className="border-t border-slate-200 p-4"
                      >
                        {chatError && (
                          <div
                            role="alert"
                            className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                          >
                            <span className="min-w-0 break-words">
                              {chatError}
                            </span>
                            <button
                              type="button"
                              onClick={() => setChatError(null)}
                              aria-label="Dismiss authoring error"
                              className="shrink-0 text-rose-700 hover:text-rose-900"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        <textarea
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          rows={3}
                          placeholder="Describe the persona, its users, workflow, tools, and success criteria…"
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="submit"
                            tone="dark"
                            disabled={chatBusy || !chatInput.trim()}
                          >
                            {chatBusy ? 'Generating…' : 'Send message'}
                            <Icon name="arrow" />
                          </Button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="p-5">
                      <div className="mb-5 grid gap-3 sm:grid-cols-2">
                        {sessions.map((session) => (
                          <article
                            key={session.session_id}
                            className="rounded-xl border border-slate-200 p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">
                                  {session.persona_name || 'Untitled persona'}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {session.authoring_mode.replace(/_/g, ' ')} ·
                                  Phase {session.current_phase}
                                </p>
                              </div>
                              <StatusBadge value={session.status} />
                            </div>
                            <p className="mt-2 text-[10px] text-slate-400">
                              Updated {dateTime(session.updated_at)}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button
                                tone="dark"
                                disabled={busy}
                                onClick={() => void resumeSession(session)}
                              >
                                Resume
                              </Button>
                              <Button
                                tone="danger"
                                onClick={() =>
                                  void abandonSession(session.session_id)
                                }
                              >
                                Abandon
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm">
                          <Icon name="chat" className="h-5 w-5" />
                        </div>
                        <h2 className="mt-3 text-sm font-semibold">
                          Start a guided authoring session
                        </h2>
                        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                          Work with the builder to define intent, tools,
                          prompts, guardrails, and validation criteria.
                        </p>
                        <Button
                          tone="dark"
                          className="mt-4"
                          onClick={() => setShowCreate(true)}
                        >
                          <Icon name="plus" />
                          Create session
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <aside className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">Authoring flow</h2>
                    <ol className="mt-3 space-y-3">
                      {[
                        'Define user and outcome',
                        'Confirm scope and tools',
                        'Author prompt and guardrails',
                        'Validate and save draft',
                      ].map((step, index) => (
                        <li key={step} className="flex gap-3 text-xs">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[10px] font-semibold text-cyan-800">
                            {index + 1}
                          </span>
                          <span className="pt-0.5 text-slate-600">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-900">
                      Drafts are not live
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800">
                      A persona only enters the production registry after
                      evaluation, promotion, and approval.
                    </p>
                  </div>
                </aside>
              </section>
            )}

            {view === 'evaluations' && (
              <section className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      Isolated eval tenants
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                      Evaluation lab
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      Seed controlled FHIR cohorts, replay scenarios, and
                      inspect quality traces before promotion.
                    </p>
                  </div>
                  <Button onClick={() => void loadWorkspace()}>
                    Refresh personas
                  </Button>
                </div>
                {evaluationTarget ? (
                  <form
                    onSubmit={beginEvaluation}
                    className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-2"
                  >
                    <div className="xl:col-span-2 flex items-start justify-between">
                      <div>
                        <h2 className="text-sm font-semibold">
                          New scenario · {evaluationTarget.name}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {evaluationTarget.personaType} ·{' '}
                          {evaluationTarget.version}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEvaluationTarget(null)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <label className="text-xs font-medium text-slate-600">
                      Scenario name
                      <input
                        required
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Test cohort description
                      <input
                        required
                        value={seedDescription}
                        onChange={(e) => setSeedDescription(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Cohort groups (JSON)
                      <textarea
                        required
                        value={seedGroups}
                        onChange={(e) => setSeedGroups(e.target.value)}
                        rows={5}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                      />
                    </label>
                    {evaluationTarget.personaType === 'AGENT' ? (
                      <label className="text-xs font-medium text-slate-600">
                        Conversation test prompt
                        <textarea
                          required
                          value={scenarioQuestion}
                          onChange={(e) => setScenarioQuestion(e.target.value)}
                          rows={5}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          placeholder="Ask the agent a realistic test question…"
                        />
                      </label>
                    ) : (
                      <label className="text-xs font-medium text-slate-600">
                        Mission parameters (JSON)
                        <textarea
                          value={scenarioParams}
                          onChange={(e) => setScenarioParams(e.target.value)}
                          rows={5}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                        />
                      </label>
                    )}
                    <div className="flex items-end justify-end gap-2 xl:col-span-2">
                      <Button
                        type="button"
                        onClick={() => setEvaluationTarget(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" tone="dark" disabled={busy}>
                        {busy ? 'Creating scenario…' : 'Create & seed sandbox'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {personas.map((persona) => (
                      <button
                        key={`${persona.personaId}-${persona.version}`}
                        onClick={() => {
                          setEvaluationTarget(persona);
                          setScenarioName(`${persona.name} evaluation`);
                          setScenarioQuestion('');
                          void refreshEvalRuns(persona);
                        }}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-cyan-300"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {persona.name}
                          </span>
                          <StatusBadge value={persona.lifecycleState} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {persona.description}
                        </p>
                        <span className="mt-3 inline-block text-xs font-semibold text-cyan-700">
                          New evaluation →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {(seedJob || evalRun) && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {seedJob && (
                      <article className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold">
                            Sandbox seeding
                          </h2>
                          <StatusBadge value={seedJob.seedStatus} />
                        </div>
                        <p className="mt-2 font-mono text-[11px] text-slate-500">
                          {seedJob.evalTenantId}
                        </p>
                        {seedJob.seededCounts && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(seedJob.seededCounts).map(
                              ([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                                >
                                  {key}: <b>{value}</b>
                                </span>
                              ),
                            )}
                          </div>
                        )}
                        {seedJob.errorMessage && (
                          <p className="mt-3 text-xs text-rose-700">
                            {seedJob.errorMessage}
                          </p>
                        )}
                        {seedJob.seedStatus === 'COMPLETED' && (
                          <Button
                            tone="accent"
                            className="mt-4"
                            disabled={busy || !evaluationTarget}
                            onClick={() => void submitEvaluation()}
                          >
                            <Icon name="play" />
                            Submit evaluation
                          </Button>
                        )}
                      </article>
                    )}
                    {evalRun && <EvalRunCard run={evalRun} />}
                  </div>
                )}
                {evalRuns.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">Recent runs</h2>
                    <div className="mt-3 divide-y divide-slate-100">
                      {evalRuns.map((run) => (
                        <button
                          key={run.runId}
                          onClick={() =>
                            void agentBuilderService
                              .getEval(run.runId)
                              .then(setEvalRun)
                              .catch((e) => notify('error', String(e)))
                          }
                          className="flex w-full items-center justify-between gap-3 py-3 text-left"
                        >
                          <span>
                            <span className="block text-xs font-semibold text-slate-800">
                              {run.personaVersion} · {run.runId.slice(0, 8)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {dateTime(run.createdAt)}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <StatusBadge value={run.runStatus} />
                            <span className="text-sm font-semibold">
                              {run.qualityScore ?? '—'}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </section>
            )}

            {view === 'admin' && (
              <section>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      Operations
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold">
                      Platform assets
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      Inspect skills and formatter coverage used by the persona
                      runtime.
                    </p>
                  </div>
                  <Button
                    tone="dark"
                    disabled={busy}
                    onClick={() => void syncSkills()}
                  >
                    {busy ? 'Syncing…' : 'Sync skills'}
                  </Button>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">
                      Skill library{' '}
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        {skills.length}
                      </span>
                    </h2>
                    <div className="mt-3 space-y-2">
                      {skills.map((skill) => (
                        <div
                          key={skill.id}
                          className="rounded-lg border border-slate-100 px-3 py-2.5"
                        >
                          <div className="flex justify-between gap-2">
                            <p className="text-xs font-semibold">
                              {skill.name}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              {skill.stepCount} steps
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {skill.description}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-cyan-700">
                            {skill.id}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">
                      Formatter coverage
                    </h2>
                    {formatters ? (
                      <div className="mt-3 space-y-3">
                        {[
                          formatters.default,
                          ...(formatters.personaSpecific ?? []),
                        ]
                          .filter(Boolean)
                          .map((group: any) => (
                            <div
                              key={group.personaId}
                              className="rounded-lg border border-slate-100 p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold">
                                  {group.personaId}
                                </p>
                                <span className="text-[10px] text-slate-400">
                                  {group.formatters?.length ?? 0} formatters
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(group.resourceTypes ?? []).map(
                                  (type: string) => (
                                    <span
                                      key={type}
                                      className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600"
                                    >
                                      {type}
                                    </span>
                                  ),
                                )}
                              </div>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-medium text-cyan-700">
                                  Inspect YAML
                                </summary>
                                <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                                  {(group.formatters ?? []).map(
                                    (formatter: any) => (
                                      <pre
                                        key={formatter.resourceType}
                                        className="overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-relaxed text-emerald-100"
                                      >
                                        {formatter.yamlContent}
                                      </pre>
                                    ),
                                  )}
                                </div>
                              </details>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-400">
                        Loading formatter definitions…
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {selected && (
        <PersonaDrawer
          persona={selected}
          detail={detail}
          loading={detailLoading}
          busy={busy}
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
          onAdapt={() => {
            setSourcePersonaId(selected.personaId);
            setSourcePersonaVersion(selected.version);
            setPersonaType(
              selected.personaType === 'DATA_PIPELINE'
                ? 'DATA_PIPELINE'
                : 'AGENT',
            );
            setAuthoringMode('ADAPT_FROM');
            setShowCreate(true);
            setSelected(null);
            setDetail(null);
            setView('authoring');
          }}
          onFork={() => void forkPersona(selected)}
          onEvaluate={() => {
            setEvaluationTarget(selected);
            setScenarioName(`${selected.name} evaluation`);
            setScenarioQuestion('');
            void refreshEvalRuns(selected);
            setView('evaluations');
            setSelected(null);
          }}
          onLifecycle={(action) => void runLifecycle(action, selected)}
        />
      )}

      {showCreate && (
        <Modal title="Create a persona" onClose={() => setShowCreate(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void startSession();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {(['AGENT', 'DATA_PIPELINE'] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setPersonaType(type)}
                  className={`rounded-lg border p-3 text-left ${personaType === type ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-semibold">
                    {type === 'AGENT'
                      ? 'Conversational agent'
                      : 'Data pipeline'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {type === 'AGENT'
                      ? 'Adaptive, multi-turn assistant'
                      : 'Fixed, observable workflow'}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(['FROM_SCRATCH', 'ADAPT_FROM'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAuthoringMode(mode)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${authoringMode === mode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {mode === 'FROM_SCRATCH' ? 'From scratch' : 'Adapt existing'}
                </button>
              ))}
            </div>
            {authoringMode === 'ADAPT_FROM' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium">
                  Source persona
                  <select
                    value={sourcePersonaId}
                    onChange={(e) => {
                      setSourcePersonaId(e.target.value);
                      setSourcePersonaVersion(
                        personas.find((p) => p.personaId === e.target.value)
                          ?.version || '',
                      );
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {personas.map((p) => (
                      <option
                        key={`${p.personaId}-${p.version}`}
                        value={p.personaId}
                      >
                        {p.name} · {p.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium">
                  Version
                  <input
                    value={sourcePersonaVersion}
                    onChange={(e) => setSourcePersonaVersion(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" tone="dark" disabled={busy}>
                {busy ? 'Starting…' : 'Start authoring'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
    onClick={onClose}
  >
    <div
      className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const PersonaDrawer: React.FC<{
  persona: PersonaSummary;
  detail: PersonaDetail | null;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onAdapt: () => void;
  onFork: () => void;
  onEvaluate: () => void;
  onLifecycle: (action: 'promote' | 'approve' | 'retire') => void;
}> = ({
  persona,
  detail,
  loading,
  busy,
  onClose,
  onAdapt,
  onFork,
  onEvaluate,
  onLifecycle,
}) => (
  <div
    className="fixed inset-0 z-40 flex justify-end bg-slate-950/30"
    onClick={onClose}
  >
    <aside
      className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
        <div>
          <p className="font-mono text-[10px] text-cyan-700">
            {persona.personaId} · {persona.version}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{persona.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{persona.description}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="space-y-5 p-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading persona detail…</p>
        ) : (
          detail && (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusBadge value={detail.lifecycleState} />
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                  {detail.personaType}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                  {detail.scope} scope
                </span>
                {detail.intendedUserRole && (
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] text-cyan-700">
                    {detail.intendedUserRole}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Authoring source', detail.authoringSource],
                  ['Updated', dateTime(detail.updatedAt)],
                  ['Model', detail.model?.modelId],
                  ['Reasoning', detail.reasoningStrategy],
                  ['Confidence threshold', detail.confidenceThreshold],
                  [
                    'Timeout',
                    detail.budget?.timeoutSeconds
                      ? `${detail.budget.timeoutSeconds}s`
                      : null,
                  ],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="mt-1 text-xs font-medium text-slate-700">
                        {String(value)}
                      </p>
                    </div>
                  ))}
              </div>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Capabilities
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(detail.tools ?? []).map((tool) => (
                    <span
                      key={tool}
                      className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-[10px] text-indigo-700"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </section>
              {detail.params?.length ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Parameters
                  </h3>
                  <div className="mt-2 space-y-2">
                    {detail.params.map((param: any) => (
                      <div
                        key={param.id}
                        className="rounded-lg border border-slate-100 p-3"
                      >
                        <p className="text-xs font-semibold">{param.label}</p>
                        <p className="text-[11px] text-slate-500">
                          {param.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {detail.roleGuardrails && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Guardrails
                  </h3>
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-emerald-100">
                    {JSON.stringify(detail.roleGuardrails, null, 2)}
                  </pre>
                </section>
              )}
              {detail.systemPrompt && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                    Resolved system prompt
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-200">
                    {detail.systemPrompt}
                  </pre>
                </details>
              )}
            </>
          )
        )}
      </div>
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white p-4">
        <Button disabled={busy} onClick={onAdapt}>
          Adapt persona
        </Button>
        <Button disabled={busy} onClick={onFork}>
          Fork version
        </Button>
        <Button disabled={busy} onClick={onEvaluate}>
          Evaluate
        </Button>
        {persona.lifecycleState === 'DRAFT' && (
          <Button
            disabled={busy}
            tone="accent"
            onClick={() => onLifecycle('promote')}
          >
            Submit for review
          </Button>
        )}
        {persona.lifecycleState === 'REVIEW' && (
          <Button
            disabled={busy}
            tone="accent"
            onClick={() => onLifecycle('approve')}
          >
            Approve
          </Button>
        )}
        {persona.lifecycleState !== 'RETIRED' && (
          <Button
            disabled={busy}
            tone="danger"
            onClick={() => onLifecycle('retire')}
          >
            Retire
          </Button>
        )}
      </div>
    </aside>
  </div>
);

const EvalRunCard: React.FC<{ run: EvalRun }> = ({ run }) => {
  const dimensions =
    typeof run.qualityDimensions === 'string'
      ? readJson<Record<string, number>>(run.qualityDimensions)
      : run.qualityDimensions;
  const trace =
    typeof run.replayTrace === 'string'
      ? readJson<any>(run.replayTrace)
      : run.replayTrace;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono text-slate-400">
            Run {run.runId}
          </p>
          <h2 className="mt-1 text-sm font-semibold">Evaluation result</h2>
        </div>
        <StatusBadge value={run.runStatus} />
      </div>
      {run.runStatus === 'PENDING' || run.runStatus === 'RUNNING' ? (
        <div className="mt-5 flex items-center gap-3 text-xs text-cyan-700">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          Running evaluation in isolated tenant…
        </div>
      ) : run.runStatus === 'FAILED' ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          {run.errorMessage || 'Evaluation failed.'}
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-3">
            <p className="text-4xl font-semibold tracking-tight">
              {run.qualityScore ?? '—'}
              <span className="ml-1 text-sm font-normal text-slate-400">
                /100
              </span>
            </p>
            <p className="pb-1 text-xs text-slate-500">Quality score</p>
          </div>
          {dimensions && (
            <div className="mt-4 space-y-2">
              {Object.entries(dimensions).map(([name, value]) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-slate-600">
                      {name.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className="font-medium">
                      {Math.round(value * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-cyan-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, value * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Scenario response
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
              {run.personaResponse || 'No response returned.'}
            </p>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Replay trace
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-emerald-100">
              {JSON.stringify(trace ?? {}, null, 2)}
            </pre>
          </details>
        </>
      )}
    </article>
  );
};

export default AgentBuilderPage;
