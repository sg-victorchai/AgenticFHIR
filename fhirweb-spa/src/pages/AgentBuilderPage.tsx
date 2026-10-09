import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Phase0Authoring, {
  AuthoringTheme,
  Phase0Progress,
} from '../components/clinician/Phase0Authoring';
import ConfirmationDialog from '../components/common/ConfirmationDialog';
import PreviousEvalData from '../components/clinician/PreviousEvalData';
import SeededResourceBrowser from '../components/clinician/SeededResourceBrowser';
import SavedScenarioPicker, {
  ScenarioBlueprint,
} from '../components/clinician/SavedScenarioPicker';
import EvaluationCohortEditor, {
  buildCohortGroups,
  CohortGroupDraft,
  newCohortGroup,
} from '../components/clinician/EvaluationCohortEditor';
import {
  agentBuilderService,
  AuthoringSession,
  AuthoringTurn,
  AuthoringStep,
  ConversationModels,
  LifecycleAction,
  SessionReviewAction,
  EvalRun,
  PersonaDetail,
  PersonaSummary,
  SeedStatus,
  ScenarioDetail,
} from '../services/agentBuilderService';

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'default';
type View = 'marketplace' | 'authoring' | 'evaluations' | 'admin';
type Toast = { kind: 'success' | 'error'; text: string } | null;
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
};

const normalizeConfirmationName = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/^\s*persona\s+spec\s*:\s*/i, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const abandonmentTargetName = (session: AuthoringSession) =>
  session.persona_name?.replace(/^\s*persona\s+spec\s*:\s*/i, '').trim() ||
  session.session_id;

const matchesAbandonmentName = (input: string, session: AuthoringSession) =>
  normalizeConfirmationName(input) ===
  normalizeConfirmationName(abandonmentTargetName(session));

const editableSession = (status: string) =>
  ['IN_PROGRESS', 'AWAITING_REVIEW'].includes(status);
const lifecycleStages = [
  'DRAFT',
  'QUALITY_GATE_PENDING',
  'QUALITY_GATE_APPROVED',
  'UAT_TRAINING',
  'MONITORING',
];
const stageLabels = [
  'Author review',
  'Quality review',
  'Sandbox ready',
  'Sandbox evaluation',
  'Live monitoring',
];
const nextStageText: Record<string, string> = {
  DRAFT:
    'Review and revise the draft. Author approval sends it to quality review.',
  QUALITY_GATE_PENDING:
    'Review the prompt, tools and guardrails. Quality sign-off is required before sandbox testing.',
  QUALITY_GATE_APPROVED:
    'Quality checks passed. Enter the sandbox to run evaluations.',
  UAT_TRAINING:
    'Seed an isolated tenant, evaluate and compare versions. Review a completed run before production approval.',
  PRODUCTION_APPROVED:
    'Approved for production; runtime activation is pending.',
  MONITORING:
    'Live in production. Monitor results and flag improvements when needed.',
  IMPROVEMENT_CANDIDATE:
    'Fork a new draft version to begin an improvement cycle.',
};
const LifecycleProgress: React.FC<{ state: string }> = ({ state }) => (
  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
    <ol className="flex flex-wrap gap-2">
      {lifecycleStages.map((stage, index) => (
        <li
          key={stage}
          aria-current={state === stage ? 'step' : undefined}
          className={`rounded px-2 py-1 text-xs ${state === stage ? 'bg-cyan-700 font-semibold text-white' : 'text-slate-600'}`}
        >
          {index + 1}. {stageLabels[index]}
        </li>
      ))}
    </ol>
    <p className="mt-2 text-xs text-slate-700">
      {nextStageText[state] || state.replace(/_/g, ' ')}
    </p>
  </div>
);

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
  const color = [
    'MONITORING',
    'COMPLETE',
    'QUALITY_GATE_APPROVED',
    'COMPLETED',
  ].includes(value)
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : [
          'AWAITING_REVIEW',
          'QUALITY_REVIEW',
          'QUALITY_GATE_PENDING',
          'PRODUCTION_APPROVED',
        ].includes(value)
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : ['UAT_TRAINING', 'SANDBOX_EXPERIMENT'].includes(value)
        ? 'bg-cyan-50 text-cyan-800 ring-cyan-200'
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
  const [personaDescription, setPersonaDescription] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReadOnly, setSessionReadOnly] = useState(false);
  const [activeSession, setActiveSession] = useState<AuthoringSession | null>(
    null,
  );
  const [rejectSession, setRejectSession] = useState<AuthoringSession | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState('');
  const [retiringPersona, setRetiringPersona] = useState<PersonaSummary | null>(
    null,
  );
  const [retirementName, setRetirementName] = useState('');
  const [abandoningSession, setAbandoningSession] =
    useState<AuthoringSession | null>(null);
  const [abandonmentName, setAbandonmentName] = useState('');
  const [abandonmentError, setAbandonmentError] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [activationWarning, setActivationWarning] = useState<string | null>(
    null,
  );
  const [conversationModels, setConversationModels] =
    useState<ConversationModels | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [chosenModelId, setChosenModelId] = useState('');
  const [activeModelId, setActiveModelId] = useState('');
  const [sessionTurns, setSessionTurns] = useState<AuthoringTurn[]>([]);
  const [authoringStep, setAuthoringStep] = useState<AuthoringStep>(null);
  const [intakeDescription, setIntakeDescription] = useState('');
  const [authoringTheme, setAuthoringTheme] =
    useState<AuthoringTheme>('professional');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [evaluationTarget, setEvaluationTarget] =
    useState<PersonaSummary | null>(null);
  const [evaluationDetail, setEvaluationDetail] =
    useState<PersonaDetail | null>(null);
  const [evaluationDetailError, setEvaluationDetailError] = useState<
    string | null
  >(null);
  const [testSettings, setTestSettings] = useState<Record<string, any>>({});
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioQuestion, setScenarioQuestion] = useState('');
  const [scenarioParams, setScenarioParams] = useState('{}');
  const [seedDescription, setSeedDescription] = useState('');
  const [seedGroups, setSeedGroups] = useState<CohortGroupDraft[]>([
    newCohortGroup(),
  ]);
  const [seedJob, setSeedJob] = useState<SeedStatus | null>(null);
  const [resourceBrowseTarget, setResourceBrowseTarget] = useState<{
    seedJobId: string;
    resourceType: string;
  } | null>(null);
  const [showScenarioDraft, setShowScenarioDraft] = useState(false);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [savedScenario, setSavedScenario] = useState<ScenarioDetail | null>(
    null,
  );
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
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
    let active = true;
    setEvaluationDetail(null);
    setEvaluationDetailError(null);
    setSavedScenario(null);
    setScenarioError(null);
    setScenarioLoading(false);
    setScenarioId(null);
    if (evaluationTarget) {
      void agentBuilderService
        .getPersona(evaluationTarget.personaId, evaluationTarget.version)
        .then(
          (persona) => {
            if (!active) return;
            setEvaluationDetail(persona);
            setTestSettings(
              Object.fromEntries(
                (persona.params ?? [])
                  .filter((param) => param.default !== undefined)
                  .map((param) => [param.id, param.default]),
              ),
            );
          },
          (error: unknown) => {
            if (active)
              setEvaluationDetailError(
                error instanceof Error
                  ? error.message
                  : 'Unable to load test settings.',
              );
          },
        );
    }
    return () => {
      active = false;
    };
  }, [evaluationTarget?.personaId, evaluationTarget?.version]);
  useEffect(() => {
    void agentBuilderService.getModels().then(
      (available) => {
        setConversationModels(available);
        setChosenModelId(
          available.models.find((model) => model.default)?.id ||
            available.defaultModelId,
        );
        setModelsError(null);
      },
      (error: unknown) =>
        setModelsError(
          error instanceof Error ? error.message : 'Unable to load models.',
        ),
    );
  }, []);
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

  const activeModelName =
    conversationModels?.models.find((model) => model.id === activeModelId)
      ?.displayName ||
    activeModelId ||
    'Server default';
  const inProgressCount = sessions.filter((session) =>
    editableSession(session.status),
  ).length;

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
    const description = personaDescription.trim();
    if (!description) return;
    setBusy(true);
    try {
      const created = await agentBuilderService.createSession({
        personaType,
        authoringMode,
        description,
        ...(chosenModelId ? { modelId: chosenModelId } : {}),
        ...(authoringMode === 'ADAPT_FROM'
          ? { sourcePersonaId, sourcePersonaVersion }
          : {}),
      });
      setSessionId(created.sessionId);
      setSessionReadOnly(false);
      setAuthoringStep(created.authoring_step ?? null);
      setIntakeDescription(created.description || description);
      setActiveSession(await agentBuilderService.getSession(created.sessionId));
      setActiveModelId(created.selectedModelId || chosenModelId || '');
      setSessionTurns([]);
      setChatError(null);
      setShowCreate(false);
      setView('authoring');
      await loadWorkspace();
      if (!created.authoring_step) {
        await streamAuthoringTurn(
          created.sessionId,
          `Persona description: ${description}\n\nUse this description to begin authoring the persona. Include a meaningful, non-empty description in the saved persona definition.`,
        );
      }
      setPersonaDescription('');
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
      const metadata = await agentBuilderService.getSession(session.session_id);
      setAuthoringStep(metadata.authoring_step ?? null);
      setIntakeDescription(metadata.description || '');
      const resumed = await agentBuilderService.resumeSession(
        session.session_id,
      );
      setSessionId(resumed.session_id);
      setSessionReadOnly(!editableSession(resumed.status));
      setActiveSession({ ...metadata, status: resumed.status });
      setChatError(null);
      setChatInput('');
      setActiveModelId(
        resumed.selected_model_id ||
          metadata.selected_model_id ||
          metadata.selectedModelId ||
          '',
      );
      setSessionTurns(resumed.conversation ?? []);
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

  const viewSessionHistory = async (session: AuthoringSession) => {
    setBusy(true);
    try {
      const metadata = await agentBuilderService.getSession(session.session_id);
      const history = await agentBuilderService.getSessionMessages(
        session.session_id,
      );
      setSessionId(session.session_id);
      setSessionReadOnly(!editableSession(metadata.status));
      setActiveSession(metadata);
      setAuthoringStep(metadata.authoring_step ?? null);
      setIntakeDescription(metadata.description || '');
      setChatError(null);
      setChatInput('');
      setActiveModelId(
        metadata.selected_model_id ||
          metadata.selectedModelId ||
          metadata.model_id ||
          metadata.modelId ||
          '',
      );
      setSessionTurns(history.messages ?? []);
      setView('authoring');
    } catch (error) {
      notify(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to load session history.',
      );
    } finally {
      setBusy(false);
    }
  };

  const sendAuthoringMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionId || sessionReadOnly || chatBusy || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    await streamAuthoringTurn(sessionId, text);
  };

  const streamAuthoringTurn = async (targetSessionId: string, text: string) => {
    if (chatBusy) return;
    let receivedStep = false;
    setChatBusy(true);
    setChatError(null);
    setSessionTurns((previous) => [
      ...previous,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    try {
      if (
        activeSession?.session_id === targetSessionId &&
        activeSession.status === 'AWAITING_REVIEW'
      ) {
        await agentBuilderService.reviewSession(
          targetSessionId,
          'reject',
          text,
        );
        setActiveSession({ ...activeSession, status: 'IN_PROGRESS' });
      }
      await agentBuilderService.streamMessage(
        targetSessionId,
        text,
        (token) => {
          setSessionTurns((previous) => {
            const turns = [...previous];
            const last = turns[turns.length - 1];
            if (last?.role === 'assistant') {
              turns[turns.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return turns;
          });
        },
        (step) => {
          receivedStep = true;
          setAuthoringStep(step);
        },
      );
      await loadWorkspace();
      try {
        const updated = await agentBuilderService.getSession(targetSessionId);
        setSessionReadOnly(!editableSession(updated.status));
        setActiveSession(updated);
        if (!receivedStep && updated.authoring_step !== undefined) {
          setAuthoringStep(updated.authoring_step);
        }
      } catch {
        // The response is already in the chat; status refresh can wait until the next visit.
      }
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'Authoring stream failed.',
      );
    } finally {
      setChatBusy(false);
    }
  };

  const abandonSession = async (id: string, confirmed = false) => {
    if (!confirmed) {
      const session = sessions.find((item) => item.session_id === id);
      if (!session) return;
      setAbandonmentName('');
      setAbandonmentError(null);
      setAbandoningSession(session);
      return;
    }
    if (
      busy ||
      abandoningSession?.session_id !== id ||
      !matchesAbandonmentName(abandonmentName, abandoningSession)
    )
      return;
    setBusy(true);
    setAbandonmentError(null);
    try {
      await agentBuilderService.abandonSession(id);
      setAbandoningSession(null);
      if (sessionId === id) {
        setSessionId(null);
        setSessionTurns([]);
        setChatError(null);
      }
      notify('success', 'Authoring session abandoned.');
      await loadWorkspace();
    } catch (error) {
      setAbandonmentError(
        error instanceof Error ? error.message : 'Unable to abandon session.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reviewAuthoringSession = async (
    session: AuthoringSession,
    action: SessionReviewAction,
    reason?: string,
  ) => {
    setBusy(true);
    setLifecycleError(null);
    try {
      const result = await agentBuilderService.reviewSession(
        session.session_id,
        action,
        reason,
      );
      await loadWorkspace();
      const updated = await agentBuilderService.getSession(session.session_id);
      if (sessionId === updated.session_id) {
        setActiveSession(updated);
        setSessionReadOnly(!editableSession(updated.status));
      }
      setRejectSession(null);
      if (action === 'reject') await resumeSession(updated);
      if (action === 'quality-approve' && result.personaId && result.version) {
        const persona = await agentBuilderService.getPersona(
          result.personaId,
          result.version,
        );
        setEvaluationTarget(persona);
        setSeedJob(null);
        setEvalRun(null);
        setScenarioId(null);
        setScenarioName(`${persona.name} evaluation`);
        setView('evaluations');
      }
      notify('success', result.message || 'Session stage updated.');
    } catch (error) {
      setLifecycleError(
        error instanceof Error
          ? error.message
          : 'Unable to update session stage.',
      );
      await loadWorkspace();
    } finally {
      setBusy(false);
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
    if (!evaluationTarget || !evaluationDetail || scenarioLoading || busy)
      return;
    setBusy(true);
    setScenarioError(null);
    try {
      const cohortGroups = buildCohortGroups(seedGroups);
      const parameters = evaluationDetail.params ?? [];
      const parameterDriven = parameters.length > 0;
      const missionParams = parameterDriven
        ? Object.fromEntries(
            parameters
              .filter(
                (param) =>
                  (!param.dependsOn ||
                    testSettings[param.dependsOn.param] ===
                      param.dependsOn.value) &&
                  testSettings[param.id] !== undefined &&
                  testSettings[param.id] !== '',
              )
              .map((param) => [param.id, testSettings[param.id]]),
          )
        : evaluationTarget.personaType !== 'AGENT'
          ? JSON.parse(scenarioParams)
          : undefined;
      const scenario = await agentBuilderService.createScenario({
        personaId: evaluationTarget.personaId,
        scenarioName: scenarioName.trim(),
        scenarioType: evaluationTarget.personaType,
        seedSpec: {
          description: seedDescription.trim(),
          cohortGroups,
          expectedCohortSize: cohortGroups.reduce(
            (sum, group) => sum + Number(group.count || 0),
            0,
          ),
        },
        ...(evaluationTarget.personaType === 'AGENT' && !parameterDriven
          ? {
              conversationScript: [
                { role: 'user', content: scenarioQuestion.trim() },
              ],
            }
          : { missionParams }),
        generateRubric: true,
      });
      setScenarioId(scenario.scenarioId);
      const blueprint = await agentBuilderService.getScenario(
        scenario.scenarioId,
      );
      setSavedScenario(blueprint);
      setEvalRun(null);
      setView('evaluations');
      await seedSavedScenario(scenario.scenarioId, blueprint);
    } catch (error) {
      setScenarioError(
        error instanceof Error
          ? error.message
          : 'Unable to create or load the scenario.',
      );
    } finally {
      setBusy(false);
    }
  };

  const seedSavedScenario = async (
    id: string,
    knownBlueprint?: ScenarioDetail,
  ) => {
    if (!evaluationTarget || scenarioLoading) return;
    setBusy(true);
    setScenarioError(null);
    try {
      const blueprint =
        knownBlueprint ||
        (savedScenario?.scenarioId === id
          ? savedScenario
          : await agentBuilderService.getScenario(id));
      if (
        blueprint.personaId &&
        blueprint.personaId !== evaluationTarget.personaId
      ) {
        throw new Error('This scenario belongs to a different persona.');
      }
      setSavedScenario(blueprint);
      setScenarioId(id);
      const seed = await agentBuilderService.seedScenario(id);
      setSeedJob({ ...seed, seedStatus: 'PENDING' });
      setEvalRun(null);
    } catch (error) {
      setScenarioError(
        error instanceof Error
          ? error.message
          : 'Unable to seed sandbox. Retry using the saved scenario.',
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

  const submitEvaluation = async (
    reusedScenario?: ScenarioDetail,
    reusedJob?: SeedStatus,
  ) => {
    const targetScenarioId = reusedScenario?.scenarioId || scenarioId;
    const targetSeedJob = reusedJob || seedJob;
    if (
      !evaluationTarget ||
      !targetScenarioId ||
      !targetSeedJob ||
      targetSeedJob.seedStatus !== 'COMPLETED' ||
      busy ||
      ['PENDING', 'RUNNING'].includes(evalRun?.runStatus ?? '')
    )
      return;
    if (
      reusedScenario?.personaId &&
      reusedScenario.personaId !== evaluationTarget.personaId
    ) {
      throw new Error('This scenario belongs to a different persona.');
    }
    if (reusedScenario && reusedJob) {
      setSavedScenario(reusedScenario);
      setScenarioId(reusedScenario.scenarioId);
      setSeedJob(reusedJob);
      setScenarioError(null);
    }
    setBusy(true);
    try {
      const runs = await agentBuilderService.listEvalRuns(
        evaluationTarget.personaId,
        TENANT_ID,
      );
      setEvalRuns(runs);
      if (runs.some((run) => run.evalTenantId === targetSeedJob.evalTenantId)) {
        throw new Error(
          'This seeded data has already been submitted for evaluation. Select another seed job or seed a new dataset.',
        );
      }
      const submitted = await agentBuilderService.submitEval({
        personaId: evaluationTarget.personaId,
        version: evaluationTarget.version,
        scenarioId: targetScenarioId,
        tenantId: TENANT_ID,
        evalTenantId: targetSeedJob.evalTenantId,
      });
      setEvalRun({
        runId: submitted.runId,
        personaId: evaluationTarget.personaId,
        personaVersion: evaluationTarget.version,
        evalTenantId: targetSeedJob.evalTenantId,
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
    action: LifecycleAction,
    persona: PersonaSummary,
    retirementConfirmed = false,
  ) => {
    if (action === 'retire' && persona.authoringSource === 'platform') return;
    if (action === 'retire' && !retirementConfirmed) {
      setLifecycleError(null);
      setRetirementName('');
      setRetiringPersona(persona);
      return;
    }
    if (
      action === 'retire' &&
      (busy || retirementName !== (persona.name || persona.personaId))
    )
      return;
    const linkedSession = sessions.find(
      (session) =>
        session.finalized_persona_id === persona.personaId &&
        session.finalized_persona_version === persona.version,
    );
    if (
      linkedSession &&
      ((action === 'promote' && linkedSession.status === 'AWAITING_REVIEW') ||
        (action === 'quality-approve' &&
          linkedSession.status === 'QUALITY_REVIEW'))
    ) {
      await reviewAuthoringSession(
        linkedSession,
        action === 'promote' ? 'approve' : 'quality-approve',
      );
      if (selected) {
        const updated = await agentBuilderService.getPersona(
          persona.personaId,
          persona.version,
        );
        setSelected(updated);
        setDetail(updated);
      }
      return;
    }
    setBusy(true);
    setLifecycleError(null);
    setActivationWarning(null);
    try {
      const result = await agentBuilderService.lifecycle(
        action,
        persona.personaId,
        persona.version,
        TENANT_ID,
        action === 'approve' && linkedSession?.status === 'SANDBOX_EXPERIMENT'
          ? linkedSession.session_id
          : undefined,
      );
      if (result?.warning)
        setActivationWarning(
          `Persona approved but not yet live: ${result.warning}`,
        );
      notify(
        'success',
        result?.message ||
          `${persona.name}: ${action.replace(/-/g, ' ')} completed.`,
      );
      await loadWorkspace();
      if (action === 'retire') {
        setRetiringPersona(null);
        setSelected(null);
        setDetail(null);
        return;
      }
      if (
        action === 'approve' &&
        evaluationTarget?.personaId === persona.personaId &&
        evaluationTarget.version === persona.version
      ) {
        setEvaluationTarget(null);
        setSeedJob(null);
        setEvalRun(null);
        setScenarioId(null);
      }
      if (selected?.personaId === persona.personaId) {
        const updated = await agentBuilderService.getPersona(
          persona.personaId,
          persona.version,
        );
        setSelected(updated);
        setDetail(updated);
      }
    } catch (error) {
      setLifecycleError(
        error instanceof Error ? error.message : 'Lifecycle transition failed.',
      );
      await loadWorkspace();
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
  const isFocusedAuthoring = view === 'authoring' && Boolean(sessionId);
  const returnToEvaluationList = () => {
    setEvaluationTarget(null);
    setSeedJob(null);
    setEvalRun(null);
    setEvalRuns([]);
    setScenarioId(null);
    setSavedScenario(null);
    setScenarioError(null);
    setShowScenarioDraft(false);
  };
  const navigateWorkspace = (nextView: View) => {
    if (nextView === 'evaluations') returnToEvaluationList();
    setView(nextView);
  };
  const chatTheme = {
    professional: {
      transcript: 'bg-[#252d36]',
      userBubble: 'border-slate-500 bg-[#3b4652] text-white',
      assistantText: 'text-white',
      composer: 'border-slate-600 bg-[#1c232b]',
      input:
        'border-slate-500 bg-[#303a45] text-white placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-600',
      send: 'bg-slate-600 hover:bg-slate-500',
    },
    ocean: {
      transcript: 'bg-[#ead9bb]',
      userBubble: 'border-[#c5b18d] bg-[#f6eddd] text-[#174a70]',
      assistantText: 'text-[#174a70]',
      composer: 'border-[#c5b18d] bg-[#f1e5d0]',
      input:
        'border-[#c5b18d] bg-[#f8f0e2] text-[#174a70] placeholder:text-[#52718a] focus:border-[#28658d] focus:ring-[#c9dce8]',
      send: 'bg-[#174a70] hover:bg-[#103a59]',
    },
    savanna: {
      transcript: 'bg-[#e5efda]',
      userBubble: 'border-[#c0d0a9] bg-[#f0f4e5] text-[#685714]',
      assistantText: 'text-[#685714]',
      composer: 'border-[#c0d0a9] bg-[#eaf0df]',
      input:
        'border-[#c0d0a9] bg-[#f3f5e8] text-[#685714] placeholder:text-[#8a7c3e] focus:border-[#8b7928] focus:ring-[#e4dda9]',
      send: 'bg-[#75621a] hover:bg-[#5f4e12]',
    },
  }[authoringTheme];

  return (
    <div
      className={`${isFocusedAuthoring ? 'h-[calc(100dvh-4rem)] overflow-hidden' : 'min-h-[calc(100vh-4rem)]'} bg-[#f5f7fb] text-slate-900`}
    >
      <div
        className={`flex ${isFocusedAuthoring ? 'h-full min-h-0' : 'min-h-[calc(100vh-4rem)]'}`}
      >
        {!isFocusedAuthoring && (
          <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-[#111827] text-slate-300 lg:flex">
            <div className="border-b border-slate-800 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
                  <Icon name="sparkle" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    AgentBuilder
                  </p>
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
                  onClick={() => navigateWorkspace(item.id)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${view === item.id ? 'bg-slate-800 text-white ring-1 ring-slate-700' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {item.id === 'authoring' && inProgressCount > 0 && (
                    <span className="ml-auto rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">
                      {inProgressCount}
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
        )}

        <main
          className={`min-w-0 flex-1 ${isFocusedAuthoring ? 'flex min-h-0 flex-col' : ''}`}
        >
          <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
            <div
              className={`flex flex-wrap items-center justify-between gap-3 px-4 sm:px-7 ${isFocusedAuthoring ? 'py-2' : 'py-3'}`}
            >
              {!isFocusedAuthoring && (
                <div className="flex items-center gap-2 lg:hidden">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-cyan-300">
                    <Icon name="sparkle" />
                  </div>
                  <span className="text-sm font-semibold">AgentBuilder</span>
                </div>
              )}
              {!isFocusedAuthoring && (
                <div className="hidden lg:block">
                  <p className="text-xs text-slate-500">
                    Platform /{' '}
                    <span className="text-slate-800">
                      {navItems.find((item) => item.id === view)?.label}
                    </span>
                  </p>
                </div>
              )}
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
            {!isFocusedAuthoring && (
              <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateWorkspace(item.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${view === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </header>

          <div
            className={
              isFocusedAuthoring
                ? 'flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-3'
                : 'mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8'
            }
          >
            {lifecycleError && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {lifecycleError}
              </p>
            )}
            {activationWarning && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                {activationWarning}
              </p>
            )}
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
                      Agent Marketplace
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
                    ['In progress', inProgressCount, 'Authoring sessions'],
                    [
                      'Production ready',
                      personas.filter(
                        (persona) => persona.lifecycleState === 'MONITORING',
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
                          {persona.lifecycleState === 'UAT_TRAINING' && (
                            <button
                              onClick={() => {
                                setEvaluationTarget(persona);
                                setSeedJob(null);
                                setEvalRun(null);
                                setScenarioId(null);
                                setScenarioName(`${persona.name} evaluation`);
                                setScenarioQuestion('');
                                setView('evaluations');
                              }}
                              className="text-xs font-medium text-slate-500 hover:text-cyan-700"
                            >
                              Evaluate
                            </button>
                          )}
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
              <section
                className={
                  sessionId ? 'flex min-h-0 flex-1 flex-col gap-2' : 'space-y-4'
                }
              >
                {activeSession &&
                  sessionId &&
                  activeSession.status !== 'IN_PROGRESS' && (
                    <details className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        Lifecycle and review actions
                      </summary>
                      <div className="mt-3 space-y-3">
                        <LifecycleProgress
                          state={
                            activeSession.status === 'QUALITY_REVIEW'
                              ? 'QUALITY_GATE_PENDING'
                              : activeSession.status === 'SANDBOX_EXPERIMENT'
                                ? 'UAT_TRAINING'
                                : activeSession.status === 'COMPLETE'
                                  ? 'MONITORING'
                                  : 'DRAFT'
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          {activeSession.finalized_persona_id && (
                            <Button
                              disabled={busy || chatBusy}
                              onClick={() => {
                                const persona = personas.find(
                                  (item) =>
                                    item.personaId ===
                                      activeSession.finalized_persona_id &&
                                    item.version ===
                                      activeSession.finalized_persona_version,
                                );
                                if (persona) void openPersona(persona);
                                else
                                  setLifecycleError(
                                    'Refresh the workspace to load the generated persona.',
                                  );
                              }}
                            >
                              Inspect generated persona
                            </Button>
                          )}
                          {activeSession.status === 'AWAITING_REVIEW' && (
                            <Button
                              tone="accent"
                              disabled={busy || chatBusy}
                              onClick={() => {
                                setConfirmation({
                                  title: 'Approve draft content?',
                                  message:
                                    'This will send the draft to quality review. You can no longer edit it during that review.',
                                  confirmLabel: 'Approve content',
                                  tone: 'primary',
                                  onConfirm: () =>
                                    reviewAuthoringSession(
                                      activeSession,
                                      'approve',
                                    ),
                                });
                              }}
                            >
                              Approve content
                            </Button>
                          )}
                          {activeSession.status === 'QUALITY_REVIEW' && (
                            <Button
                              tone="accent"
                              disabled={busy}
                              onClick={() => {
                                setConfirmation({
                                  title: 'Enter sandbox?',
                                  message:
                                    'Confirm the quality review and move this persona into the sandbox for evaluation.',
                                  confirmLabel: 'Approve and enter sandbox',
                                  tone: 'primary',
                                  onConfirm: () =>
                                    reviewAuthoringSession(
                                      activeSession,
                                      'quality-approve',
                                    ),
                                });
                              }}
                            >
                              Quality approve & enter sandbox
                            </Button>
                          )}
                          {activeSession.status === 'SANDBOX_EXPERIMENT' && (
                            <Button
                              tone="accent"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  !activeSession.finalized_persona_id ||
                                  !activeSession.finalized_persona_version
                                ) {
                                  setLifecycleError(
                                    'This session has no finalized persona version.',
                                  );
                                  return;
                                }
                                try {
                                  const persona =
                                    await agentBuilderService.getPersona(
                                      activeSession.finalized_persona_id,
                                      activeSession.finalized_persona_version,
                                    );
                                  setEvaluationTarget(persona);
                                  setSeedJob(null);
                                  setEvalRun(null);
                                  setScenarioId(null);
                                  setScenarioName(`${persona.name} evaluation`);
                                  void refreshEvalRuns(persona);
                                  setView('evaluations');
                                } catch (error) {
                                  setLifecycleError(
                                    error instanceof Error
                                      ? error.message
                                      : 'Unable to open sandbox.',
                                  );
                                }
                              }}
                            >
                              Open sandbox evaluations
                            </Button>
                          )}
                          {[
                            'AWAITING_REVIEW',
                            'QUALITY_REVIEW',
                            'SANDBOX_EXPERIMENT',
                          ].includes(activeSession.status) && (
                            <Button
                              tone="danger"
                              disabled={busy || chatBusy}
                              onClick={() => {
                                setRejectReason('');
                                setRejectSession(activeSession);
                              }}
                            >
                              Request revisions
                            </Button>
                          )}
                        </div>
                      </div>
                    </details>
                  )}
                <div
                  className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${sessionId ? 'flex min-h-0 flex-1 flex-col' : ''}`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 ${sessionId ? 'py-2' : 'py-4 sm:px-5'}`}
                  >
                    <div>
                      {!sessionId && (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                          Persona workbench
                        </p>
                      )}
                      <h1
                        className={`${sessionId ? '' : 'mt-1'} text-lg font-semibold`}
                      >
                        {sessionId ? 'Authoring session' : 'Create a persona'}
                      </h1>
                      {sessionId && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          Session {sessionId} · Powered by {activeModelName}
                          {sessionReadOnly ? ' · View-only history' : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {sessionId && (
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <span>Theme</span>
                          <select
                            aria-label="Authoring theme"
                            value={authoringTheme}
                            onChange={(event) =>
                              setAuthoringTheme(
                                event.target.value as AuthoringTheme,
                              )
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                          >
                            <option value="professional">Professional</option>
                            <option value="ocean">Beach</option>
                            <option value="savanna">Savanna</option>
                          </select>
                        </label>
                      )}
                      {!sessionId && (
                        <Button onClick={() => setShowCreate(true)}>
                          <Icon name="plus" />
                          New session
                        </Button>
                      )}
                      <Button
                        disabled={busy}
                        onClick={() => void loadWorkspace()}
                      >
                        Refresh
                      </Button>
                      {sessionId && (
                        <Button
                          onClick={() => {
                            setSessionId(null);
                            setAuthoringStep(null);
                            setChatError(null);
                          }}
                        >
                          Close session
                        </Button>
                      )}
                    </div>
                  </div>
                  {sessionId ? (
                    <>
                      {authoringStep && (
                        <Phase0Progress
                          step={authoringStep}
                          theme={authoringTheme}
                        />
                      )}
                      <div
                        className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 ${chatTheme.transcript}`}
                      >
                        {sessionTurns.length ? (
                          <div className="space-y-5" aria-live="polite">
                            {sessionTurns.map((turn, index) => (
                              <div
                                key={index}
                                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div
                                  className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${turn.role === 'user' ? `max-w-[85%] border text-left sm:max-w-[75%] ${chatTheme.userBubble}` : `w-full text-left ${chatTheme.assistantText}`}`}
                                >
                                  <p className="mb-1 text-[11px] font-semibold text-slate-500">
                                    {turn.role === 'user' ? 'You' : 'Agent'}
                                  </p>
                                  <p className="whitespace-pre-wrap break-words">
                                    {turn.content ||
                                      (chatBusy ? 'Thinking…' : '')}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600">
                            The authoring assistant is ready. Describe the
                            clinical workflow or the persona you want to build.
                          </p>
                        )}
                      </div>
                      {!sessionReadOnly && (
                        <div className={`border-t p-4 ${chatTheme.composer}`}>
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
                          {authoringStep ? (
                            <Phase0Authoring
                              key={`${sessionId}:${authoringStep}`}
                              step={authoringStep}
                              description={intakeDescription}
                              lastAssistantMessage={
                                [...sessionTurns]
                                  .reverse()
                                  .find(
                                    (turn) =>
                                      turn.role === 'assistant' &&
                                      turn.content.trim(),
                                  )?.content || ''
                              }
                              busy={chatBusy || busy}
                              theme={authoringTheme}
                              onSubmit={async (message) => {
                                if (
                                  !sessionId ||
                                  sessionReadOnly ||
                                  chatBusy ||
                                  busy
                                )
                                  return;
                                await streamAuthoringTurn(sessionId, message);
                              }}
                            />
                          ) : (
                            <form onSubmit={sendAuthoringMessage}>
                              <textarea
                                value={chatInput}
                                onChange={(event) =>
                                  setChatInput(event.target.value)
                                }
                                rows={3}
                                placeholder="Describe the persona, its users, workflow, tools, and success criteria…"
                                className={`w-full resize-y rounded-xl border p-3 text-sm outline-none focus:ring-2 ${chatTheme.input}`}
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                {conversationModels &&
                                conversationModels.models.length > 1 ? (
                                  <label className="min-w-0 text-xs text-slate-600">
                                    <span className="sr-only">
                                      Model (new session required to change)
                                    </span>
                                    <select
                                      aria-label="Model (starts a new session)"
                                      title="Changing models starts a new authoring session"
                                      value={
                                        activeModelId &&
                                        conversationModels.models.some(
                                          (model) => model.id === activeModelId,
                                        )
                                          ? activeModelId
                                          : ''
                                      }
                                      onChange={(event) => {
                                        setChosenModelId(event.target.value);
                                        setShowCreate(true);
                                      }}
                                      className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                    >
                                      {!conversationModels.models.some(
                                        (model) => model.id === activeModelId,
                                      ) && (
                                        <option value="">Server default</option>
                                      )}
                                      {conversationModels.models.map(
                                        (model) => (
                                          <option
                                            key={model.id}
                                            value={model.id}
                                          >
                                            {model.displayName}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </label>
                                ) : (
                                  <span
                                    className="truncate text-xs text-slate-600"
                                    title={activeModelId}
                                  >
                                    {activeModelName}
                                  </span>
                                )}
                                <button
                                  type="submit"
                                  disabled={chatBusy || !chatInput.trim()}
                                  aria-label={
                                    chatBusy
                                      ? 'Generating response'
                                      : 'Send message'
                                  }
                                  title={
                                    chatBusy
                                      ? 'Generating response'
                                      : 'Send message'
                                  }
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${chatTheme.send}`}
                                >
                                  <svg
                                    className="h-5 w-5"
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
                            </form>
                          )}
                        </div>
                      )}
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
                            {session.description && (
                              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                                {session.description}
                              </p>
                            )}
                            <p className="mt-2 text-[10px] text-slate-400">
                              Updated {dateTime(session.updated_at)}
                            </p>
                            <p className="mt-2 text-xs text-slate-600">
                              {session.status === 'AWAITING_REVIEW'
                                ? 'Draft ready: review or edit it, then approve content.'
                                : session.status === 'QUALITY_REVIEW'
                                  ? 'Next: verify scope and guardrails, then approve the quality gate.'
                                  : session.status === 'SANDBOX_EXPERIMENT'
                                    ? 'Next: evaluate in the sandbox before production approval.'
                                    : session.status === 'COMPLETE'
                                      ? 'Authoring closed after production promotion.'
                                      : 'Continue authoring the draft.'}
                            </p>
                            <div className="mt-3 flex gap-2">
                              {editableSession(session.status) ? (
                                <>
                                  <Button
                                    tone="dark"
                                    disabled={busy}
                                    onClick={() =>
                                      session.status === 'AWAITING_REVIEW'
                                        ? void viewSessionHistory(session)
                                        : void resumeSession(session)
                                    }
                                  >
                                    {session.status === 'AWAITING_REVIEW'
                                      ? 'Review & edit draft'
                                      : 'Resume'}
                                  </Button>
                                  <Button
                                    tone="danger"
                                    disabled={busy}
                                    onClick={() =>
                                      void abandonSession(session.session_id)
                                    }
                                  >
                                    Abandon
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void viewSessionHistory(session)
                                  }
                                >
                                  {session.status === 'QUALITY_REVIEW'
                                    ? 'Review quality'
                                    : session.status === 'SANDBOX_EXPERIMENT'
                                      ? 'Open sandbox'
                                      : 'View history'}
                                </Button>
                              )}
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
              </section>
            )}

            {view === 'evaluations' && (
              <section className="space-y-5">
                {evaluationTarget && (
                  <LifecycleProgress state={evaluationTarget.lifecycleState} />
                )}
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      Isolated eval tenants
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                      {evaluationTarget
                        ? evaluationTarget.name
                        : 'Evaluation lab'}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      Seed controlled FHIR cohorts, replay scenarios, and
                      inspect quality traces before production approval.
                    </p>
                  </div>
                  {evaluationTarget && (
                    <Button onClick={returnToEvaluationList}>
                      Back to personas
                    </Button>
                  )}
                  <Button onClick={() => void loadWorkspace()}>
                    Refresh personas
                  </Button>
                </div>
                {evaluationTarget && (
                  <PreviousEvalData
                    key={`seed-history:${evaluationTarget.personaId}`}
                    personaId={evaluationTarget.personaId}
                    refreshKey={`${seedJob?.seedJobId || ''}:${seedJob?.seedStatus || ''}`}
                    disabled={
                      busy ||
                      ['PENDING', 'SEEDING'].includes(
                        seedJob?.seedStatus ?? '',
                      ) ||
                      ['PENDING', 'RUNNING'].includes(evalRun?.runStatus ?? '')
                    }
                    onSubmit={submitEvaluation}
                    submittedTenantId={evalRun?.evalTenantId}
                  />
                )}
                {evaluationTarget && !scenarioId && !showScenarioDraft && (
                  <Button
                    tone="accent"
                    onClick={() => setShowScenarioDraft(true)}
                  >
                    Draft new test scenario
                  </Button>
                )}
                {evaluationTarget && (
                  <SavedScenarioPicker
                    key={`scenario-picker:${evaluationTarget.personaId}`}
                    personaId={evaluationTarget.personaId}
                    refreshKey={scenarioId}
                    onLoading={setScenarioLoading}
                    disabled={
                      busy ||
                      ['PENDING', 'SEEDING'].includes(
                        seedJob?.seedStatus ?? '',
                      ) ||
                      ['PENDING', 'RUNNING'].includes(evalRun?.runStatus ?? '')
                    }
                    onSelect={(scenario) => {
                      setSavedScenario(scenario);
                      setScenarioId(scenario.scenarioId);
                      setScenarioError(null);
                      setSeedJob(null);
                      setEvalRun(null);
                      setShowScenarioDraft(false);
                    }}
                  />
                )}
                {evaluationTarget && scenarioError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                  >
                    {scenarioError}
                  </p>
                )}
                {evaluationTarget && scenarioId && (
                  <div className="space-y-3">
                    {savedScenario && (
                      <ScenarioBlueprint scenario={savedScenario} />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(!seedJob ||
                        ['FAILED', 'TORN_DOWN'].includes(
                          seedJob.seedStatus,
                        )) && (
                        <Button
                          disabled={busy || scenarioLoading}
                          tone="accent"
                          onClick={() => void seedSavedScenario(scenarioId)}
                        >
                          {busy
                            ? 'Preparing sandbox...'
                            : scenarioError || seedJob?.seedStatus === 'FAILED'
                              ? 'Retry seeding'
                              : 'Seed sandbox'}
                        </Button>
                      )}
                      <Button
                        disabled={
                          busy ||
                          scenarioLoading ||
                          ['PENDING', 'SEEDING'].includes(
                            seedJob?.seedStatus ?? '',
                          ) ||
                          ['PENDING', 'RUNNING'].includes(
                            evalRun?.runStatus ?? '',
                          )
                        }
                        onClick={() => {
                          setSavedScenario(null);
                          setScenarioId(null);
                          setScenarioError(null);
                          setSeedJob(null);
                          setEvalRun(null);
                          setShowScenarioDraft(true);
                        }}
                      >
                        Create a different scenario
                      </Button>
                    </div>
                  </div>
                )}
                {evaluationTarget &&
                showScenarioDraft &&
                !seedJob &&
                !scenarioId ? (
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
                        onClick={() => setShowScenarioDraft(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <label className="text-xs font-medium text-slate-600">
                      Evaluation name
                      <input
                        required
                        value={scenarioName}
                        placeholder="e.g. Diabetes care gaps - patients missing HbA1c"
                        onChange={(e) => setScenarioName(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Test patient population
                      <input
                        required
                        value={seedDescription}
                        placeholder="e.g. 20 diabetic patients: 10 with recent HbA1c, 10 without"
                        onChange={(e) => setSeedDescription(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <EvaluationCohortEditor
                      groups={seedGroups}
                      onChange={setSeedGroups}
                    />
                    {evaluationDetailError ? (
                      <p
                        role="alert"
                        className="xl:col-span-2 text-sm text-rose-700"
                      >
                        {evaluationDetailError}
                      </p>
                    ) : !evaluationDetail ? (
                      <p className="text-sm text-slate-500">
                        Loading agent test settings...
                      </p>
                    ) : evaluationDetail.params?.length ? (
                      <fieldset className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                        <legend className="mb-2 text-sm font-semibold text-slate-800">
                          Agent test settings
                        </legend>
                        {evaluationDetail.params
                          .filter(
                            (param) =>
                              !param.dependsOn ||
                              testSettings[param.dependsOn.param] ===
                                param.dependsOn.value,
                          )
                          .map((param) => (
                            <label
                              key={param.id}
                              className="min-w-0 text-xs font-medium text-slate-600"
                            >
                              {param.label || param.id}
                              {param.required ? ' *' : ''}
                              {param.type === 'boolean' ? (
                                <input
                                  type="checkbox"
                                  checked={Boolean(testSettings[param.id])}
                                  onChange={(event) =>
                                    setTestSettings((previous) => ({
                                      ...previous,
                                      [param.id]: event.target.checked,
                                    }))
                                  }
                                  className="ml-2"
                                />
                              ) : param.type === 'location_group' ||
                                param.type === 'location-group' ? (
                                <div className="mt-1 grid gap-2">
                                  {['city', 'state', 'postalCode'].map(
                                    (field) => (
                                      <input
                                        key={field}
                                        aria-label={`${param.label || param.id}: ${field}`}
                                        placeholder={
                                          field === 'postalCode'
                                            ? 'Postal code'
                                            : field.charAt(0).toUpperCase() +
                                              field.slice(1)
                                        }
                                        value={
                                          testSettings[param.id]?.[field] ?? ''
                                        }
                                        onChange={(event) =>
                                          setTestSettings((previous) => ({
                                            ...previous,
                                            [param.id]: {
                                              ...previous[param.id],
                                              [field]: event.target.value,
                                            },
                                          }))
                                        }
                                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                      />
                                    ),
                                  )}
                                </div>
                              ) : param.options?.length ? (
                                <select
                                  required={param.required}
                                  value={testSettings[param.id] ?? ''}
                                  onChange={(event) =>
                                    setTestSettings((previous) => ({
                                      ...previous,
                                      [param.id]: event.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="">Select a value</option>
                                  {param.options.map((option: any) => (
                                    <option
                                      key={String(option.value ?? option)}
                                      value={option.value ?? option}
                                    >
                                      {option.label ?? String(option)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  required={param.required}
                                  type={
                                    ['integer', 'number'].includes(param.type)
                                      ? 'number'
                                      : 'text'
                                  }
                                  min={param.min}
                                  max={param.max}
                                  step={param.type === 'integer' ? 1 : 'any'}
                                  placeholder={
                                    param.default !== undefined
                                      ? `e.g. ${param.default}`
                                      : `Enter ${param.label || param.id}`
                                  }
                                  value={testSettings[param.id] ?? ''}
                                  onChange={(event) =>
                                    setTestSettings((previous) => ({
                                      ...previous,
                                      [param.id]:
                                        ['integer', 'number'].includes(
                                          param.type,
                                        ) && event.target.value !== ''
                                          ? Number(event.target.value)
                                          : event.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                              )}
                              {param.description && (
                                <span className="mt-1 block font-normal text-slate-500">
                                  {param.description}
                                </span>
                              )}
                            </label>
                          ))}
                      </fieldset>
                    ) : evaluationTarget.personaType === 'AGENT' ? (
                      <label className="xl:col-span-2 text-xs font-medium text-slate-600">
                        Question to ask the agent
                        <textarea
                          required
                          value={scenarioQuestion}
                          onChange={(e) => setScenarioQuestion(e.target.value)}
                          rows={5}
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          placeholder="e.g. Summarise this patient's current conditions and identify any abnormal lab results."
                        />
                        <span className="mt-1 block font-normal text-slate-500">
                          This question is sent to the agent during the
                          evaluation using the sandbox test patients, not real
                          patient records.
                        </span>
                      </label>
                    ) : (
                      <label className="text-xs font-medium text-slate-600">
                        Pipeline test inputs (JSON)
                        <textarea
                          placeholder={
                            'e.g. { "documentType": "text", "documentContent": "Clinical note..." }'
                          }
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
                        onClick={() => setShowScenarioDraft(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        tone="dark"
                        disabled={
                          busy ||
                          !evaluationDetail ||
                          Boolean(evaluationDetailError)
                        }
                      >
                        {busy ? 'Creating scenario…' : 'Create & seed sandbox'}
                      </Button>
                    </div>
                  </form>
                ) : !evaluationTarget ? (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {personas
                      .filter(
                        (persona) => persona.lifecycleState === 'UAT_TRAINING',
                      )
                      .map((persona) => (
                        <button
                          key={`${persona.personaId}-${persona.version}`}
                          onClick={() => {
                            setEvaluationTarget(persona);
                            setShowScenarioDraft(false);
                            setEvalRuns([]);
                            setSeedJob(null);
                            setEvalRun(null);
                            setScenarioId(null);
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
                            Open evaluations &amp; previous data →
                          </span>
                        </button>
                      ))}
                    {!personas.some(
                      (persona) => persona.lifecycleState === 'UAT_TRAINING',
                    ) && (
                      <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-sm text-slate-600">
                        No personas are ready for sandbox evaluation. Approve
                        draft content and pass the quality gate first.
                      </p>
                    )}
                  </div>
                ) : null}
                {evaluationTarget && (seedJob || evalRun) && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {seedJob && (
                      <article className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold">
                            Sandbox seeding
                          </h2>
                          <StatusBadge value={seedJob.seedStatus} />
                        </div>
                        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-slate-500">Seed job ID</dt>
                            <dd className="mt-1 break-all font-mono text-slate-800">
                              {seedJob.seedJobId}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">
                              Evaluation tenant
                            </dt>
                            <dd className="mt-1 break-all font-mono text-slate-800">
                              {seedJob.evalTenantId}
                            </dd>
                          </div>
                          {(seedJob.patientCount !== undefined ||
                            seedJob.seededCounts?.Patient !== undefined) && (
                            <div>
                              <dt className="text-slate-500">Patients</dt>
                              <dd className="mt-1 font-semibold">
                                {seedJob.patientCount ??
                                  seedJob.seededCounts?.Patient}
                              </dd>
                            </div>
                          )}
                          {seedJob.seededCounts &&
                            Object.keys(seedJob.seededCounts).length > 0 && (
                              <div>
                                <dt className="text-slate-500">
                                  Total resources
                                </dt>
                                <dd className="mt-1 font-semibold">
                                  {Object.values(seedJob.seededCounts).reduce(
                                    (total, count) => total + count,
                                    0,
                                  )}
                                </dd>
                              </div>
                            )}
                        </dl>
                        {['PENDING', 'SEEDING'].includes(
                          seedJob.seedStatus,
                        ) && (
                          <p
                            role="status"
                            className="mt-3 text-xs text-slate-600"
                          >
                            Generating sandbox data...
                          </p>
                        )}
                        {seedJob.seedStatus === 'COMPLETED' &&
                          (!seedJob.seededCounts ||
                            !Object.keys(seedJob.seededCounts).length) && (
                            <p className="mt-3 text-xs text-slate-500">
                              Resource counts were not provided.
                            </p>
                          )}
                        {seedJob.seededCounts && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(seedJob.seededCounts).map(
                              ([key, value]) => (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={
                                    seedJob.seedStatus !== 'COMPLETED' ||
                                    value === 0
                                  }
                                  aria-label={`Browse seeded ${key} data`}
                                  onClick={() =>
                                    setResourceBrowseTarget({
                                      seedJobId: seedJob.seedJobId,
                                      resourceType: key,
                                    })
                                  }
                                  className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:border-cyan-400 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {key}: <b>{value}</b> · Browse
                                </button>
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
                            disabled={
                              busy ||
                              !evaluationTarget ||
                              evalRun?.evalTenantId === seedJob.evalTenantId ||
                              evalRuns.some(
                                (run) =>
                                  run.evalTenantId === seedJob.evalTenantId,
                              )
                            }
                            onClick={() => void submitEvaluation()}
                          >
                            <Icon name="play" />
                            Submit evaluation
                          </Button>
                        )}
                      </article>
                    )}
                    {evalRun && (
                      <div className="space-y-3">
                        <EvalRunCard run={evalRun} />
                        {['COMPLETED', 'FAILED'].includes(evalRun.runStatus) &&
                          evaluationTarget && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    const result =
                                      await agentBuilderService.compare(
                                        evaluationTarget.personaId,
                                        TENANT_ID,
                                      );
                                    notify(
                                      'success',
                                      result.betterVersion === 'none'
                                        ? 'No completed evaluations to compare.'
                                        : `Highest-scoring version: ${result.betterVersion}`,
                                    );
                                  } catch (error) {
                                    setLifecycleError(
                                      error instanceof Error
                                        ? error.message
                                        : 'Unable to compare versions.',
                                    );
                                  }
                                }}
                              >
                                Compare versions
                              </Button>
                              {seedJob &&
                                seedJob.seedStatus !== 'TORN_DOWN' && (
                                  <Button
                                    disabled={busy}
                                    onClick={async () => {
                                      setConfirmation({
                                        title: 'Clean up sandbox data?',
                                        message: `This permanently removes test data from sandbox tenant ${seedJob.evalTenantId}.`,
                                        confirmLabel: 'Delete sandbox data',
                                        tone: 'danger',
                                        onConfirm: async () => {
                                          setBusy(true);
                                          try {
                                            await agentBuilderService.teardown(
                                              seedJob.evalTenantId,
                                            );
                                            setSeedJob({
                                              ...seedJob,
                                              seedStatus: 'TORN_DOWN',
                                            });
                                          } catch (error) {
                                            setLifecycleError(
                                              error instanceof Error
                                                ? error.message
                                                : 'Unable to clean up sandbox.',
                                            );
                                          } finally {
                                            setBusy(false);
                                          }
                                        },
                                      });
                                    }}
                                  >
                                    Clean up sandbox
                                  </Button>
                                )}
                            </div>
                          )}
                        {evalRun.runStatus === 'COMPLETED' &&
                          evaluationTarget?.lifecycleState === 'UAT_TRAINING' &&
                          evalRun.personaId === evaluationTarget.personaId &&
                          evalRun.personaVersion ===
                            evaluationTarget.version && (
                            <Button
                              tone="accent"
                              disabled={busy}
                              onClick={() => {
                                setConfirmation({
                                  title: 'Approve for production?',
                                  message: `Approve ${evaluationTarget.name} ${evaluationTarget.version} for production after reviewing this evaluation?`,
                                  confirmLabel: 'Approve for production',
                                  tone: 'primary',
                                  onConfirm: () =>
                                    runLifecycle('approve', evaluationTarget),
                                });
                              }}
                            >
                              Approve for production
                            </Button>
                          )}
                      </div>
                    )}
                  </div>
                )}
                {evaluationTarget && evalRuns.length > 0 && (
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
          onEditDraft={(() => {
            const linked = sessions.find(
              (session) =>
                session.finalized_persona_id === selected.personaId &&
                session.finalized_persona_version === selected.version &&
                editableSession(session.status),
            );
            return linked
              ? () => {
                  setSelected(null);
                  setDetail(null);
                  if (linked.status === 'AWAITING_REVIEW')
                    void viewSessionHistory(linked);
                  else void resumeSession(linked);
                }
              : undefined;
          })()}
          onRequestRevisions={(() => {
            const linked = sessions.find(
              (session) =>
                session.finalized_persona_id === selected.personaId &&
                session.finalized_persona_version === selected.version &&
                [
                  'AWAITING_REVIEW',
                  'QUALITY_REVIEW',
                  'SANDBOX_EXPERIMENT',
                ].includes(session.status),
            );
            return linked
              ? () => {
                  setSelected(null);
                  setRejectReason('');
                  setRejectSession(linked);
                }
              : undefined;
          })()}
          onEvaluate={() => {
            setEvaluationTarget(selected);
            setSeedJob(null);
            setEvalRun(null);
            setScenarioId(null);
            setScenarioName(`${selected.name} evaluation`);
            setScenarioQuestion('');
            void refreshEvalRuns(selected);
            setView('evaluations');
            setSelected(null);
          }}
          onLifecycle={(action) => void runLifecycle(action, selected)}
        />
      )}

      {resourceBrowseTarget && (
        <SeededResourceBrowser
          {...resourceBrowseTarget}
          onClose={() => setResourceBrowseTarget(null)}
        />
      )}

      {abandoningSession && (
        <Modal
          title="Abandon this authoring session?"
          onClose={() => {
            if (!busy) setAbandoningSession(null);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="break-words text-sm font-semibold text-slate-900">
                {abandoningSession.persona_name || 'Untitled persona'}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">
                {abandoningSession.session_id}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <p className="font-semibold">
                Please confirm that you intend to abandon this session.
              </p>
              <p className="mt-2">
                It will be marked abandoned and removed from your session list.
                This action does not retire or delete the persona definition.
              </p>
              <p className="mt-2">
                To pause and continue later, use Close session instead. To
                revise the draft, use Review &amp; edit draft.
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Type{' '}
              <span className="break-all font-semibold">
                {abandonmentTargetName(abandoningSession)}
              </span>{' '}
              to confirm abandonment
              <input
                type="text"
                value={abandonmentName}
                onChange={(event) => setAbandonmentName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            {abandonmentError && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {abandonmentError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setAbandoningSession(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                tone="danger"
                disabled={
                  busy ||
                  !matchesAbandonmentName(abandonmentName, abandoningSession)
                }
                onClick={() =>
                  void abandonSession(abandoningSession.session_id, true)
                }
              >
                {busy ? 'Abandoning...' : 'Yes, abandon this session'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {retiringPersona && (
        <Modal
          title="Retire this persona version?"
          onClose={() => {
            if (!busy) setRetiringPersona(null);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="break-words text-sm font-semibold text-slate-900">
                {retiringPersona.name || retiringPersona.personaId}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">
                {retiringPersona.personaId} · {retiringPersona.version}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <p className="font-semibold">
                Please confirm that you intend to retire this version.
              </p>
              <p className="mt-2">
                This version will be marked inactive and removed from
                marketplace listings. Its stored definition is retained;
                retirement does not delete it. Other versions are not affected.
              </p>
              <p className="mt-2">
                If this persona is used in your workflows, review those
                dependencies before proceeding. To revise a draft, use Edit
                draft or Request revisions instead.
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Type{' '}
              <span className="font-semibold">
                {retiringPersona.name || retiringPersona.personaId}
              </span>{' '}
              to confirm retirement
              <input
                type="text"
                value={retirementName}
                onChange={(event) => setRetirementName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            {lifecycleError && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {lifecycleError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setRetiringPersona(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                tone="danger"
                disabled={
                  busy ||
                  retirementName !==
                    (retiringPersona.name || retiringPersona.personaId)
                }
                onClick={() =>
                  void runLifecycle('retire', retiringPersona, true)
                }
              >
                {busy ? 'Retiring...' : 'Yes, retire this version'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {rejectSession && (
        <Modal
          title="Return persona to authoring"
          onClose={() => setRejectSession(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void reviewAuthoringSession(
                rejectSession,
                'reject',
                rejectReason.trim(),
              );
            }}
          >
            <label className="block text-sm text-slate-700">
              Revision feedback (optional)
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-slate-200 p-3"
              />
            </label>
            {lifecycleError && (
              <p role="alert" className="text-sm text-rose-700">
                {lifecycleError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setRejectSession(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} tone="danger">
                Return to draft
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <ConfirmationDialog
          {...confirmation}
          busy={busy}
          onCancel={() => {
            if (!busy) setConfirmation(null);
          }}
          onConfirm={async () => {
            setConfirmation(null);
            await confirmation.onConfirm();
          }}
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
            {sessionId && (
              <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                A different model starts a new authoring session. This session
                remains available to resume.
              </p>
            )}
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
            <label className="block text-xs font-medium text-slate-700">
              Persona description <span className="text-rose-600">*</span>
              <textarea
                required
                value={personaDescription}
                onChange={(event) => setPersonaDescription(event.target.value)}
                rows={3}
                placeholder="Describe who the persona supports, what it does, and its intended outcome."
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            {conversationModels && conversationModels.models.length > 1 ? (
              <label className="block text-xs font-medium text-slate-700">
                Conversation model
                <select
                  value={chosenModelId}
                  onChange={(event) => setChosenModelId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {conversationModels.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName}
                      {model.default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {
                    conversationModels.models.find(
                      (model) => model.id === chosenModelId,
                    )?.description
                  }
                </span>
              </label>
            ) : conversationModels?.models.length === 1 ? (
              <p className="text-xs text-slate-600">
                Conversation model: {conversationModels.models[0].displayName}
              </p>
            ) : modelsError ? (
              <p className="text-xs text-amber-700" role="status">
                Models unavailable: {modelsError}. The server default will be
                used.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Loading conversation models…
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                tone="dark"
                disabled={busy || !personaDescription.trim()}
              >
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
    role="dialog"
    aria-modal="true"
    aria-label={title}
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
  onEditDraft?: () => void;
  onRequestRevisions?: () => void;
  onEvaluate: () => void;
  onLifecycle: (action: LifecycleAction) => void;
}> = ({
  persona,
  detail,
  loading,
  busy,
  onClose,
  onAdapt,
  onFork,
  onEditDraft,
  onRequestRevisions,
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
              <LifecycleProgress state={detail.lifecycleState} />
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
              {detail.personaType === 'DATA_PIPELINE' ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pipeline steps ({detail.pipelineSteps?.length ?? 0})
                  </h3>
                  {detail.pipelineSteps?.length ? (
                    <ol className="mt-3 space-y-3">
                      {[...detail.pipelineSteps]
                        .sort(
                          (first, second) =>
                            Number(first.sequence) - Number(second.sequence),
                        )
                        .map((step) => (
                          <li
                            key={String(step.stepId)}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-800">
                                {String(step.sequence)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="break-words text-sm font-semibold text-slate-900">
                                    {String(step.stepId)}
                                  </p>
                                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[10px] text-indigo-700">
                                    {String(step.type)}
                                  </span>
                                </div>
                                {step.description && (
                                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                    {String(step.description)}
                                  </p>
                                )}
                                {(step.inputVar || step.outputVar) && (
                                  <p className="mt-2 break-words font-mono text-[11px] text-slate-500">
                                    {step.inputVar
                                      ? String(step.inputVar)
                                      : 'Input'}{' '}
                                    →{' '}
                                    {step.outputVar
                                      ? String(step.outputVar)
                                      : 'Output'}
                                  </p>
                                )}
                                {step.type === 'review-gate' &&
                                  detail.policies?.review && (
                                    <p className="mt-2 text-xs font-medium text-amber-800">
                                      Clinical review required
                                      {detail.policies.review.expiresAfter
                                        ? ` · Expires after ${String(detail.policies.review.expiresAfter)}`
                                        : ''}
                                    </p>
                                  )}
                                {step.type === 'dedup-check' &&
                                  detail.policies?.dedup
                                    ?.possibleDuplicateWindowDays && (
                                    <p className="mt-2 text-xs text-slate-500">
                                      Duplicate window:{' '}
                                      {String(
                                        detail.policies.dedup
                                          .possibleDuplicateWindowDays,
                                      )}{' '}
                                      days
                                    </p>
                                  )}
                                {(step.config ||
                                  step.retryPolicy ||
                                  step.persistence) && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-xs font-medium text-cyan-700">
                                      Step configuration
                                    </summary>
                                    <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-100">
                                      {JSON.stringify(
                                        {
                                          config: step.config,
                                          retryPolicy: step.retryPolicy,
                                          persistence: step.persistence,
                                        },
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No pipeline steps available.
                    </p>
                  )}
                </section>
              ) : (
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
              )}
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
        {onEditDraft && (
          <Button disabled={busy} onClick={onEditDraft}>
            Edit draft
          </Button>
        )}
        {onRequestRevisions && (
          <Button disabled={busy} tone="danger" onClick={onRequestRevisions}>
            Request revisions
          </Button>
        )}
        <Button disabled={busy} onClick={onAdapt}>
          Adapt persona
        </Button>
        <Button disabled={busy} onClick={onFork}>
          Fork version
        </Button>
        {persona.lifecycleState === 'UAT_TRAINING' && (
          <Button disabled={busy} onClick={onEvaluate}>
            Evaluate
          </Button>
        )}
        {persona.lifecycleState === 'DRAFT' && (
          <Button
            disabled={busy}
            tone="accent"
            onClick={() => onLifecycle('promote')}
          >
            Submit for review
          </Button>
        )}
        {persona.lifecycleState === 'QUALITY_GATE_PENDING' && (
          <Button
            disabled={busy}
            tone="accent"
            onClick={() => onLifecycle('quality-approve')}
          >
            Approve quality gate
          </Button>
        )}
        {persona.lifecycleState === 'QUALITY_GATE_APPROVED' && (
          <Button
            disabled={busy}
            tone="accent"
            onClick={() => onLifecycle('enter-sandbox')}
          >
            Enter sandbox
          </Button>
        )}
        {persona.lifecycleState === 'MONITORING' && (
          <Button
            disabled={busy}
            onClick={() => onLifecycle('flag-for-improvement')}
          >
            Flag for improvement
          </Button>
        )}
        {persona.lifecycleState !== 'RETIRED' && (
          <Button
            disabled={busy || persona.authoringSource === 'platform'}
            title={
              persona.authoringSource === 'platform'
                ? 'Platform personas cannot be retired from this portal'
                : undefined
            }
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
