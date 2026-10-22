import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import AiBrandIcon from './AiBrandIcon';
import { MarkdownMessageContent } from './AgentResponseFormatter';
import {
  abandonOnboardingSession,
  createOnboardingSession,
  getStorageArtifactsForSession,
  getOnboardingSession,
  listOnboardingSessions,
  OnboardingSessionSummary,
  pauseOnboardingSession,
  rememberStorageArtifacts,
  sendOnboardingMessage,
  StorageArtifact,
  streamOnboardingSession,
} from '../../services/configuredAssetsService';

type ChatMessage = { role: 'assistant' | 'user' | 'system'; content: string };
const phases = ['Model', 'APIs', 'Workflow'];
const storageSkill = 'fhir4java-map-entity-storage';
const ruleSkill = 'fhir4java-author-business-rule';
const defaultSkill = 'fhir4java-model-resource-entity';
const reconcileSkillPhases: Record<string, number> = {
  'fhir4java-model-resource-entity': 1,
  'fhir4java-define-entity-apis': 2,
  'fhir4java-model-business-workflow': 3,
  [storageSkill]: 4,
};

const reconcilePhases = [
  { skill: 'fhir4java-model-resource-entity', label: 'Model' },
  { skill: 'fhir4java-define-entity-apis', label: 'APIs' },
  { skill: 'fhir4java-model-business-workflow', label: 'Workflow' },
  { skill: storageSkill, label: 'Storage' },
];

const contextForSkill = (entrySkill?: string | null) =>
  entrySkill === storageSkill
    ? 'storage'
    : entrySkill === ruleSkill
      ? 'rule'
      : entrySkill && entrySkill !== defaultSkill
        ? 'reconcile'
        : 'new';

const greetingForVariant = (
  context: string,
  entityName: string,
  phase?: number,
) => {
  const entity = entityName || 'this asset';
  if (context === 'storage')
    return `Hi! Let's configure storage for ${entity}. Where should this data live?\n\nA1 · Internal JSON (default, no setup)\nA2 · Internal relational (platform-owned)\nB1 · External relational (existing DB)\nB2 · External REST API`;
  if (context === 'rule')
    return `What should a rule do for ${entity}? Describe the behavior in plain English and I'll help author it.`;
  if (context === 'reconcile') {
    const label = reconcilePhases[(phase || 1) - 1]?.label || 'Model';
    return `I found the existing ${entity} asset. This session will update ${label}. What would you like to change?`;
  }
  return 'Hi! What is the new entity called, and what does it represent?';
};

const inferStorageBranch = (text: string) => {
  const match = text.match(/\b(A1|A2|B1|B2)\b/i);
  return match?.[1]?.toUpperCase() || null;
};

const storageArtifactsFromText = (
  text: string,
  entityName: string,
): StorageArtifact[] => {
  const baseName = entityName || 'DataAsset';
  const blocks = [...text.matchAll(/```(sql|ya?ml|json)\s*\n([\s\S]*?)```/gi)];
  return blocks.map((match, index) => {
    const language = match[1].toLowerCase();
    const content = match[2].trim();
    const migrationVersion =
      content.match(/\bV(\d+)__/i)?.[1] || String(index + 1);
    const isProvider = /provider|application-dev|datasource/i.test(content);
    const fileName =
      language === 'sql'
        ? `V${migrationVersion}__${baseName}_relational.sql`
        : language === 'json'
          ? `${baseName}-provider-block.json`
          : isProvider
            ? 'provider-block.yml'
            : `${baseName}.yml`;
    return { fileName, content };
  });
};

const tokenBadges = (text: string, context: string) => {
  const lower = text.toLowerCase();
  const badges: string[] = [];
  if (context === 'storage') {
    if (lower.includes('storage design recorded'))
      badges.push('✓ Storage design saved');
    if (/(a1).*(confirmed|no-op)|(confirmed|no-op).*a1/i.test(text))
      badges.push('✓ Internal JSON (no setup needed)');
    if (lower.includes('flyway migration'))
      badges.push('⚙ Flyway migration generated');
    if (lower.includes('mapping yaml')) badges.push('⚙ Mapping YAML generated');
    if (lower.includes('provider block'))
      badges.push('⚙ Provider config generated');
  } else if (context === 'rule') {
    if (/rule\s+['“].*saved|rule saved ✓/i.test(text))
      badges.push('✓ Rule saved — active immediately');
    if (lower.includes('fhirpath-guard'))
      badges.push('⚙ Generating FHIRPath expression…');
    if (lower.includes('spel-guard'))
      badges.push('⚙ Generating SpEL expression…');
    if (lower.includes('cross-resource-check'))
      badges.push('⚙ Generating FHIR search check…');
    if (
      lower.includes('fhirpath-enrichment') ||
      lower.includes('spel-enrichment')
    )
      badges.push('⚙ Generating enrichment…');
  } else if (context === 'reconcile') {
    if (lower.includes('proposed change') || lower.includes('proposed update'))
      badges.push('⚙ Reviewing changes…');
    if (lower.includes('drift detected'))
      badges.push('⚠ Drift detected — reviewing');
    if (lower.includes('no changes needed') || lower.includes('up to date'))
      badges.push('✓ Already up to date');
    else if (lower.includes('reconcile') && lower.includes('complete'))
      badges.push('✓ Updates applied');
  }
  return [...new Set(badges)];
};

const completionChanges = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[•*+-]\s+/.test(line))
    .map((line) => line.replace(/^[•*+-]\s+/, '').replace(/[`*]/g, ''));

const downloadStorageArtifacts = async (
  entityName: string,
  artifacts: StorageArtifact[],
) => {
  if (!artifacts.length) return;
  const zip = new JSZip();
  artifacts.forEach((artifact) =>
    zip.file(artifact.fileName, artifact.content),
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${entityName}-storage-artifacts.zip`;
  link.click();
  URL.revokeObjectURL(url);
};
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
    if (!content || isInternalToolMessage(content)) return [];
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

const isInternalToolMessage = (content: string) =>
  /(?:\[\s*\{\s*"id"\s*:\s*"call_[^"]+"\s*,\s*"name"\s*:|\{\s*"id"\s*:\s*"call_[^"]+"\s*,\s*"name"\s*:|\[call_[\w-]+\])/i.test(
    content,
  );

export default function ServiceOnboarding({
  onBack,
  onViewAsset,
  onAddBusinessRules,
  onBackToAsset,
  onStartAnotherUpdate,
  launch,
  startImmediately = false,
}: {
  onBack: () => void;
  onViewAsset: (resourceType: string) => void;
  onAddBusinessRules: (resourceType: string) => void;
  onBackToAsset: (resourceType: string, section?: 'storage' | 'rules') => void;
  onStartAnotherUpdate: (resourceType: string) => void;
  launch?: {
    entrySkill?: string;
    context?: 'new' | 'storage' | 'rule' | 'reconcile';
    phase?: number;
    entityName?: string;
  };
  startImmediately?: boolean;
}) {
  const [sessions, setSessions] = useState<OnboardingSessionSummary[]>([]);
  const [session, setSession] = useState<OnboardingSessionSummary | null>(null);
  const [showSessionHistory, setShowSessionHistory] =
    useState(!startImmediately);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState(112);
  const composerResizeOrigin = useRef({ pointerY: 0, height: 112 });
  const [phase, setPhase] = useState(1);
  const [streaming, setStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [abandoningSession, setAbandoningSession] =
    useState<OnboardingSessionSummary | null>(null);
  const [abandonmentName, setAbandonmentName] = useState('');
  const [abandonmentError, setAbandonmentError] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [storageArtifacts, setStorageArtifacts] = useState<StorageArtifact[]>(
    [],
  );
  const [storageBranch, setStorageBranch] = useState<string | null>(null);
  const [artifactsLost, setArtifactsLost] = useState(false);
  const [turnText, setTurnText] = useState('');
  const responseTimer = useRef<number | null>(null);
  const storageTimeoutRetries = useRef(0);
  const sessionId = session?.sessionId;
  const entrySkill = session?.entrySkill || launch?.entrySkill || '';
  const storedContext = sessionId
    ? sessionStorage.getItem(`service-onboarding-context:${sessionId}`)
    : null;
  const context =
    launch?.context ||
    storedContext ||
    (entrySkill === storageSkill
      ? 'storage'
      : entrySkill === ruleSkill
        ? 'rule'
        : entrySkill && entrySkill !== defaultSkill
          ? 'reconcile'
          : 'new');
  const isStorage = context === 'storage' || entrySkill === storageSkill;
  const isRuleAuthoring = context === 'rule' || entrySkill === ruleSkill;
  const isReconcile = context === 'reconcile';
  const activeReconcilePhase =
    launch?.phase || reconcileSkillPhases[entrySkill] || phase;

  useEffect(() => {
    if (session || !showSessionHistory) return;
    let active = true;
    setBusy(true);
    void listOnboardingSessions()
      .then(async (result) => {
        const hydrated = await Promise.all(
          result.map(async (item) => {
            if (item.entityName || (item.currentPhase || 0) < 1) return item;
            try {
              const detail = await getOnboardingSession(item.sessionId);
              return {
                ...detail,
                ...item,
                entityName: detail.entityName || item.entityName,
              };
            } catch {
              return item;
            }
          }),
        );
        if (active) {
          setSessions(hydrated);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load onboarding sessions.',
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [session, attempt, showSessionHistory]);

  useEffect(() => {
    if (!sessionId || complete) return;
    const controller = new AbortController();
    let active = true;
    let retry = 0;
    const onKeepaliveEvent = (event: { type: string; data: string }) => {
      switch (event.type) {
        case 'connected':
          setStreaming(true);
          setError(null);
          break;
        case 'ping':
          break;
        case 'error':
          setSessionError(
            event.data || 'The onboarding session is unavailable.',
          );
          setStreaming(false);
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
            onKeepaliveEvent,
            controller.signal,
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
    setStreaming(false);
    void connect();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionId, complete]);

  const start = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const entrySkill = launch?.entrySkill || defaultSkill;
      const created = await createOnboardingSession({
        ...(launch?.entityName ? { entityName: launch.entityName } : {}),
        entrySkill,
      });
      sessionStorage.setItem('service-onboarding-session', created.sessionId);
      const variant =
        launch?.context ||
        (entrySkill === storageSkill
          ? 'storage'
          : entrySkill === ruleSkill
            ? 'rule'
            : launch?.phase
              ? 'reconcile'
              : 'new');
      sessionStorage.setItem(
        `service-onboarding-context:${created.sessionId}`,
        variant,
      );
      setSession({
        sessionId: created.sessionId,
        status: created.status,
        entityName: launch?.entityName,
        entrySkill: created.entrySkill || entrySkill,
      });
      setShowSessionHistory(false);
      setMessages([]);
      setPhase(variant === 'storage' ? 4 : launch?.phase || 1);
      setComplete(false);
      setSessionError(null);
      setBadges([]);
      setStorageArtifacts([]);
      setStorageBranch(null);
      setArtifactsLost(false);
      setTurnText('');
      setMessages([
        {
          role: 'assistant',
          content: greetingForVariant(
            variant,
            launch?.entityName || '',
            launch?.phase,
          ),
        },
      ]);
      return created.sessionId;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to create onboarding session.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const resume = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await getOnboardingSession(id);
      sessionStorage.setItem('service-onboarding-session', id);
      const inferredContext =
        sessionStorage.getItem(`service-onboarding-context:${id}`) ||
        contextForSkill(loaded.entrySkill);
      sessionStorage.setItem(
        `service-onboarding-context:${id}`,
        inferredContext,
      );
      setSession(loaded);
      setShowSessionHistory(false);
      const history = conversationMessages(loaded);
      setMessages(
        history.length
          ? history
          : [
              {
                role: 'assistant',
                content: greetingForVariant(
                  inferredContext,
                  loaded.entityName || '',
                  reconcileSkillPhases[loaded.entrySkill || ''],
                ),
              },
            ],
      );
      setPhase(loaded.currentPhase || 1);
      setComplete(loaded.status === 'COMPLETE');
      const artifacts = getStorageArtifactsForSession(id) || [];
      setStorageArtifacts(artifacts);
      setArtifactsLost(
        inferredContext === 'storage' &&
          artifacts.length === 0 &&
          /```(?:sql|ya?ml|json)/i.test(
            history.map((turn) => turn.content).join('\n'),
          ),
      );
      setStorageBranch(
        inferStorageBranch(history.map((turn) => turn.content).join('\n')),
      );
      setBadges([]);
      setTurnText('');
      setSessionError(null);
      setLastDraft(id);
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

  const refreshSessionAfterTurn = async (
    assistantText: string,
    targetSessionId = sessionId,
  ) => {
    if (!targetSessionId) return;
    try {
      const refreshed = await getOnboardingSession(targetSessionId);
      setSession(refreshed);
      setPhase(isStorage ? 4 : refreshed.currentPhase || 1);
      const completionText =
        /data asset is live|is ready|onboarding is complete|successfully onboarded/i.test(
          assistantText,
        );
      if (isRuleAuthoring) setComplete(false);
      else if (isStorage)
        setComplete(
          /storage configuration.*complete|storage design recorded/i.test(
            assistantText,
          ) || (refreshed.currentPhase || 0) >= 4,
        );
      else if (isReconcile)
        setComplete(
          /reconcile.*complete|updates applied|no changes needed|up to date/i.test(
            assistantText,
          ),
        );
      else
        setComplete(
          (refreshed.currentPhase || 0) >= phases.length && completionText,
        );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? `Message completed, but session state could not be refreshed: ${failure.message}`
          : 'Message completed, but session state could not be refreshed.',
      );
    }
  };

  const streamTurn = async (message: string, targetSessionId = sessionId) => {
    if (!targetSessionId) return;
    setSending(true);
    setSessionError(null);
    setError(null);
    let assistantText = '';
    let turnCompleted = false;
    let turnFailed = false;
    const controller = new AbortController();
    responseTimer.current = window.setTimeout(
      () => {
        if (isStorage) storageTimeoutRetries.current += 1;
        setSessionError(
          isStorage && storageTimeoutRetries.current > 2
            ? 'Artifact generation is taking longer than expected. Retry, or try a simpler storage branch.'
            : isStorage
              ? 'Artifact generation is taking longer than expected. Retry the last message.'
              : 'The AI is taking longer than expected. Retry the last message.',
        );
        setSending(false);
        controller.abort();
      },
      isStorage ? 120000 : 30000,
    );
    try {
      await sendOnboardingMessage(
        targetSessionId,
        message,
        (event) => {
          if (event.type === 'ping') return;
          if (event.type === 'token') {
            if (isInternalToolMessage(event.data)) return;
            if (isStorage) storageTimeoutRetries.current = 0;
            assistantText = event.data;
            const detectedBadges = tokenBadges(event.data, context);
            if (detectedBadges.length)
              setBadges((current) => [
                ...new Set([...current, ...detectedBadges]),
              ]);
            if (isStorage) {
              const branch = inferStorageBranch(event.data);
              if (branch) setStorageBranch(branch);
              const artifacts = storageArtifactsFromText(
                event.data,
                session?.entityName || launch?.entityName || 'DataAsset',
              );
              if (artifacts.length) {
                setStorageArtifacts(artifacts);
                rememberStorageArtifacts(
                  targetSessionId,
                  session?.entityName || launch?.entityName || 'DataAsset',
                  artifacts,
                );
              }
            }
            setTurnText(assistantText);
            setMessages((current) => {
              const lastMessage = current[current.length - 1];
              const assistantTurn = {
                role: 'assistant' as const,
                content: event.data,
              };
              return lastMessage?.role === 'assistant'
                ? [...current.slice(0, -1), assistantTurn]
                : [...current, assistantTurn];
            });
          } else if (event.type === 'done') {
            turnCompleted = true;
            setSending(false);
            if (responseTimer.current)
              window.clearTimeout(responseTimer.current);
            responseTimer.current = null;
            void refreshSessionAfterTurn(assistantText, targetSessionId);
          } else if (event.type === 'error') {
            turnFailed = true;
            setSessionError(
              event.data || 'The AI could not complete this turn.',
            );
            setSending(false);
            if (responseTimer.current)
              window.clearTimeout(responseTimer.current);
            responseTimer.current = null;
          }
        },
        controller.signal,
      );
      if (!turnCompleted && !turnFailed && !controller.signal.aborted) {
        setSessionError(
          'The AI stream ended before the turn completed. Retry the last message.',
        );
        setSending(false);
      }
    } catch (failure) {
      setSessionError(
        failure instanceof Error ? failure.message : 'Unable to send message.',
      );
      setSending(false);
    } finally {
      if (responseTimer.current) window.clearTimeout(responseTimer.current);
      responseTimer.current = null;
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || busy) return;
    const activeSessionId = sessionId || (await start());
    if (!activeSessionId) return;
    setDraft('');
    localStorage.removeItem(`service-onboarding-draft:${activeSessionId}`);
    setMessages((current) => [...current, { role: 'user', content }]);
    await streamTurn(content, activeSessionId);
  };

  const retryLastMessage = async () => {
    if (!sessionId) return;
    const last = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    if (!last) return;
    await streamTurn(last.content);
  };

  const pause = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await pauseOnboardingSession(sessionId);
      sessionStorage.removeItem('service-onboarding-session');
      setSession(null);
      setShowSessionHistory(true);
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

  const finishRuleAuthoring = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await pauseOnboardingSession(sessionId);
      sessionStorage.removeItem('service-onboarding-session');
      sessionStorage.removeItem(`service-onboarding-context:${sessionId}`);
      onAddBusinessRules(session?.entityName || launch?.entityName || '');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to finish this rule-authoring session.',
      );
    } finally {
      setBusy(false);
    }
  };

  const requestAbandon = (item: OnboardingSessionSummary) => {
    setAbandoningSession(item);
    setAbandonmentName('');
    setAbandonmentError(null);
  };

  const abandon = async () => {
    if (!abandoningSession) return;
    const targetName =
      abandoningSession.entityName?.trim() || abandoningSession.sessionId;
    if (
      abandonmentName.trim().toLocaleLowerCase() !==
      targetName.toLocaleLowerCase()
    )
      return;
    setAbandoning(true);
    setAbandonmentError(null);
    try {
      await abandonOnboardingSession(abandoningSession.sessionId);
      sessionStorage.removeItem(
        `service-onboarding-context:${abandoningSession.sessionId}`,
      );
      if (
        sessionStorage.getItem('service-onboarding-session') ===
        abandoningSession.sessionId
      )
        sessionStorage.removeItem('service-onboarding-session');
      setAbandoningSession(null);
      setAttempt((value) => value + 1);
    } catch (failure) {
      setAbandonmentError(
        failure instanceof Error
          ? failure.message
          : 'Unable to abandon session.',
      );
    } finally {
      setAbandoning(false);
    }
  };

  if (session || !showSessionHistory) {
    const resourceType = session?.entityName || launch?.entityName || '';
    const sessionTitle = isStorage
      ? 'Configure Data Source'
      : isRuleAuthoring
        ? 'Author Business Rules'
        : isReconcile
          ? `Update ${resourceType || 'Data Asset'}`
          : 'AI-assisted Setup';
    const phaseItems = isReconcile
      ? reconcilePhases
      : phases.map((label, index) => ({ skill: '', label, phase: index + 1 }));
    const activePhase = isReconcile ? activeReconcilePhase : phase;
    const completionList = completionChanges(turnText);
    const artifactDownloadAvailable =
      isStorage && storageBranch !== 'A1' && storageArtifacts.length > 0;
    const visibleMessages = messages.length
      ? messages
      : [
          {
            role: 'assistant' as const,
            content: greetingForVariant(context, resourceType, launch?.phase),
          },
        ];
    return (
      <section className="w-full min-w-0">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-100 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <AiBrandIcon size="large" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-800">
                {isStorage
                  ? `Phase 4${isReconcile ? ' · Reconcile' : ''}`
                  : isRuleAuthoring
                    ? 'AI-Assisted Authoring'
                    : isReconcile
                      ? 'AI-Assisted Reconcile'
                      : 'New Data Asset · AI Assisted'}
              </p>
              <h2 className="break-words text-xl font-semibold text-slate-900">
                {sessionTitle}
              </h2>
              {resourceType && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Configuring {resourceType}
                </p>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${streaming || !session ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
              role="status"
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${streaming || !session ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              AI guide{' '}
              {streaming ? 'connected' : session ? 'connecting' : 'ready'}
            </div>
            {session &&
              (isRuleAuthoring ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finishRuleAuthoring()}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pause()}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Pause
                </button>
              ))}
            <button
              type="button"
              onClick={onBack}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Asset List
            </button>
          </div>
        </header>
        {isStorage ? (
          <div className="mb-2 border-y border-slate-200 py-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
              ④ Storage {isReconcile ? '↻ Updating' : ''}
            </span>
          </div>
        ) : isRuleAuthoring ? null : (
          <nav
            aria-label="Onboarding phases"
            className="mb-2 flex items-center gap-2 border-y border-slate-200 py-2"
          >
            {phaseItems.map(({ label }, index) => {
              const number = index + 1;
              const completedPhase = isReconcile
                ? number < activePhase
                : number < activePhase;
              const active = number === activePhase;
              return (
                <div key={label} className="flex flex-1 items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${completedPhase ? 'bg-slate-200 text-slate-600' : active ? 'bg-cyan-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {completedPhase
                      ? '✓'
                      : active && isReconcile
                        ? '↻'
                        : number}
                  </span>
                  <span
                    className={`text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
                  >
                    {label}
                    {active && isReconcile ? ' Updating' : ''}
                  </span>
                  {index < phaseItems.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="ml-auto h-px flex-1 bg-slate-200"
                    />
                  )}
                </div>
              );
            })}
          </nav>
        )}
        {error && (
          <p role="status" className="mb-3 text-xs text-amber-800">
            {error}
          </p>
        )}
        <div
          className="mb-3 max-h-[60vh] min-h-48 space-y-2 overflow-auto border-y border-slate-200 py-3"
          aria-live="polite"
        >
          {visibleMessages
            .filter((message) => !isInternalToolMessage(message.content))
            .map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`max-w-[92%] break-words px-3 py-2 ${message.role === 'user' ? 'ml-auto whitespace-pre-wrap border border-cyan-100 bg-cyan-50 text-sm text-slate-800' : message.role === 'system' ? 'mx-auto whitespace-pre-wrap text-center text-xs text-slate-500' : 'border-l-2 border-cyan-600 bg-white text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.08)]'}`}
              >
                {message.role === 'assistant' ? (
                  <strong className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-800 px-1 text-[9px] font-bold uppercase text-white">
                    AI
                  </strong>
                ) : message.role === 'user' ? (
                  <strong className="mr-2 text-[10px] font-semibold uppercase text-cyan-900">
                    You
                  </strong>
                ) : null}
                {message.role === 'assistant' ? (
                  <MarkdownMessageContent text={message.content} />
                ) : (
                  message.content
                )}
              </div>
            ))}
          {sending && (
            <div
              role="status"
              aria-label="AI is thinking"
              className="flex w-fit items-center gap-2 border-l-2 border-cyan-600 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-900"
            >
              <span className="inline-flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-700" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-700 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-700 [animation-delay:240ms]" />
              </span>
              AI is thinking
            </div>
          )}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded px-2 py-1 text-xs font-medium ${badge.startsWith('⚠') ? 'bg-amber-50 text-amber-900' : badge.startsWith('✓') ? 'bg-emerald-50 text-emerald-800' : 'bg-cyan-50 text-cyan-900'}`}
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
          {session && !streaming && !complete && (
            <p className="text-xs text-amber-700">
              {error ? 'Reconnecting…' : 'Connecting to onboarding session…'}
            </p>
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
        {isStorage && artifactDownloadAvailable && !complete && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() =>
                void downloadStorageArtifacts(resourceType, storageArtifacts)
              }
              className="rounded border border-cyan-700 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100"
            >
              ↓ Download artifacts ({storageArtifacts.length})
            </button>
          </div>
        )}
        {isStorage && artifactsLost && !storageArtifacts.length && (
          <p className="mb-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            Artifacts from this session are no longer in browser memory. Re-run
            the storage session to regenerate them.
          </p>
        )}
        {complete ? (
          isStorage ? (
            <div className="border-l-4 border-emerald-600 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-900">
                Storage configuration for {resourceType || 'this asset'}{' '}
                complete.
              </h3>
              <p className="mt-1 text-sm text-emerald-800">
                Design recorded in entity spec.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {artifactDownloadAvailable && (
                  <button
                    type="button"
                    onClick={() =>
                      void downloadStorageArtifacts(
                        resourceType,
                        storageArtifacts,
                      )
                    }
                    className="rounded bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
                  >
                    ↓ Download artifacts
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('service-onboarding-session');
                    onBackToAsset(resourceType, 'storage');
                  }}
                  className="rounded border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
                >
                  Back to {resourceType}
                </button>
              </div>
            </div>
          ) : isReconcile ? (
            <div className="border-l-4 border-emerald-600 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-900">
                {resourceType}{' '}
                {badges.includes('✓ Already up to date')
                  ? 'is already up to date.'
                  : `${reconcilePhases[activeReconcilePhase - 1]?.label || 'Asset'} updated.`}
              </h3>
              {completionList.length > 0 && (
                <div className="mt-2 text-sm text-emerald-900">
                  <p className="font-medium">Changed:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {completionList.map((change, index) => (
                      <li key={`${index}-${change}`}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('service-onboarding-session');
                    onViewAsset(resourceType);
                  }}
                  className="rounded border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
                >
                  Back to {resourceType}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('service-onboarding-session');
                    onStartAnotherUpdate(resourceType);
                  }}
                  className="rounded bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
                >
                  Start another update
                </button>
              </div>
            </div>
          ) : (
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
                    onAddBusinessRules(resourceType);
                  }}
                  className="rounded border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
                >
                  Add Business Rules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('service-onboarding-session');
                    setSession(null);
                    setShowSessionHistory(true);
                    setAttempt((value) => value + 1);
                  }}
                  className="rounded border border-emerald-700 px-3 py-2 text-sm"
                >
                  My Sessions
                </button>
              </div>
            </div>
          )
        ) : (
          <form onSubmit={send} className="relative">
            <label className="block min-w-0">
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
                disabled={busy || sending}
                rows={2}
                style={{ height: composerHeight }}
                placeholder="Describe the data asset you want to configure…"
                className="min-h-[84px] w-full resize-none rounded border border-slate-300 px-3 py-5 pb-12 pr-14 text-sm disabled:bg-slate-100"
              />
            </label>
            <div
              role="separator"
              aria-label="Resize message input"
              aria-orientation="horizontal"
              aria-valuemin={84}
              aria-valuemax={480}
              aria-valuenow={composerHeight}
              tabIndex={0}
              title="Drag to resize message input"
              className="absolute inset-x-3 top-0 flex h-3 touch-none cursor-ns-resize items-center justify-center rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                composerResizeOrigin.current = {
                  pointerY: event.clientY,
                  height: composerHeight,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                setComposerHeight(
                  Math.min(
                    480,
                    Math.max(
                      84,
                      composerResizeOrigin.current.height +
                        composerResizeOrigin.current.pointerY -
                        event.clientY,
                    ),
                  ),
                );
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                  return;
                event.preventDefault();
                setComposerHeight((height) =>
                  Math.min(
                    480,
                    Math.max(84, height + (event.key === 'ArrowUp' ? 16 : -16)),
                  ),
                );
              }}
            >
              <span className="h-0.5 w-10 rounded-full bg-slate-300" />
            </div>
            <button
              type="submit"
              aria-label={sending ? 'Sending message' : 'Send message'}
              title={sending ? 'Sending message' : 'Send message'}
              disabled={busy || sending || !draft.trim()}
              className="absolute bottom-[13px] right-2 flex h-9 w-10 items-center justify-center rounded-xl bg-[#262626] text-white transition-colors hover:bg-[#404040] focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
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
                <path d="m9 10-5 5 5 5M4 15h11a4 4 0 0 0 4-4V4" />
              </svg>
            </button>
          </form>
        )}
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-cyan-700 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
          >
            Back to Asset List
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setShowSessionHistory(false);
              setMessages([]);
              setDraft('');
              setError(null);
              setNotice(null);
            }}
            className="rounded bg-cyan-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            + New Asset
          </button>
        </div>
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
        <>
          <div className="space-y-3 sm:hidden">
            {sessions.map((item) => (
              <article
                key={item.sessionId}
                className="border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words text-sm font-semibold text-slate-900">
                    {item.entityName || 'Untitled'}
                  </h3>
                  <span className="shrink-0 text-xs text-slate-500">
                    {item.currentPhase || 1}/3
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span
                    className={
                      item.status === 'COMPLETE'
                        ? 'font-medium text-emerald-700'
                        : item.status === 'ABANDONED'
                          ? 'text-slate-500'
                          : 'font-medium text-amber-700'
                    }
                  >
                    {item.status === 'COMPLETE'
                      ? '✓ Complete'
                      : item.status === 'ABANDONED'
                        ? 'Abandoned'
                        : '⏸ In progress'}
                  </span>
                  <time className="text-slate-500">
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : '—'}
                  </time>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-sm">
                  {item.status === 'COMPLETE' ? (
                    <button
                      type="button"
                      onClick={() => onViewAsset(item.entityName || '')}
                      className="font-medium text-cyan-800 underline"
                    >
                      View asset
                    </button>
                  ) : item.status !== 'ABANDONED' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resume(item.sessionId)}
                        className="font-medium text-cyan-800 underline disabled:opacity-50"
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => requestAbandon(item)}
                        className="font-medium text-rose-700 underline disabled:opacity-50"
                      >
                        Abandon
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400">No actions</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto border-y border-slate-200 sm:block">
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
                            onClick={() => requestAbandon(item)}
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
        </>
      )}
      {abandoningSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !abandoning)
              setAbandoningSession(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-abandon-title"
            className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
          >
            <header className="mb-4 flex items-center justify-between gap-4">
              <h2
                id="onboarding-abandon-title"
                className="text-base font-semibold text-slate-900"
              >
                Abandon this onboarding session?
              </h2>
              <button
                type="button"
                aria-label="Close confirmation"
                disabled={abandoning}
                onClick={() => setAbandoningSession(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </header>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="break-words text-sm font-semibold text-slate-900">
                  {abandoningSession.entityName || 'Untitled'}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-slate-600">
                  {abandoningSession.sessionId}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                <p className="font-semibold">
                  Please confirm that you intend to abandon this session.
                </p>
                <p className="mt-2">
                  It will be marked abandoned and removed from your session
                  list. Any assets already created remain active.
                </p>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Type{' '}
                <span className="break-all font-semibold">
                  {abandoningSession.entityName?.trim() ||
                    abandoningSession.sessionId}
                </span>{' '}
                to confirm abandonment
                <input
                  type="text"
                  aria-label="Type session name to confirm"
                  value={abandonmentName}
                  onChange={(event) => setAbandonmentName(event.target.value)}
                  disabled={abandoning}
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
                <button
                  type="button"
                  autoFocus
                  disabled={abandoning}
                  onClick={() => setAbandoningSession(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    abandoning ||
                    abandonmentName.trim().toLocaleLowerCase() !==
                      (
                        abandoningSession.entityName?.trim() ||
                        abandoningSession.sessionId
                      ).toLocaleLowerCase()
                  }
                  onClick={() => void abandon()}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {abandoning ? 'Abandoning...' : 'Yes, abandon this session'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
