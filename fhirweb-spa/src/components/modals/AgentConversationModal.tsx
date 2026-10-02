import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useDispatch } from 'react-redux';
import AgentResponseFormatter from '../common/AgentResponseFormatter';
import {
  ConversationMessage,
  AgentEndpointConfig,
  MissionExecutionResult,
  ProposedPlanStep,
} from '../../types/agent';
import {
  parseAgentResponse,
  extractMissionId,
} from '../../utils/agentResponseParser';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { extractOperationOutcomeText } from '../../utils/fhirError';
import { getAuthenticatedHeaders } from '../../services/auth/oidc';
import { useSSESubscription } from '../../hooks/useSSESubscription';
import { fhirApi } from '../../services/fhir/client';

const PATIENT_RECORD_TAGS = [
  'Encounter',
  'Condition',
  'Observation',
  'DiagnosticReport',
  'ServiceRequest',
  'MedicationRequest',
  'MedicationDispense',
  'MedicationStatement',
  'Procedure',
  'CarePlan',
] as const;

interface AgentConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentConfig: AgentEndpointConfig;
  patientId: string;
  tenantId?: string;
  accessToken?: string;
  title?: string;
  mode?: 'modal' | 'panel';
}

interface PendingIntervention {
  id: string;
  missionId: string;
  question?: string;
  options: string[];
  steps: ProposedPlanStep[];
}

const DECISION_LABELS: Record<string, string> = {
  approve: 'Approve & save',
  'request-changes': 'Request changes',
  reject: 'Reject',
};

const DECISIONS_REQUIRING_NOTES = new Set([
  'request-changes',
  'clarify',
  'modify',
]);

const newConversationId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Web Speech API; Chrome/Edge/Safari expose it (Safari prefixed), Firefox does not.
const getSpeechRecognition = (): any =>
  typeof window === 'undefined'
    ? undefined
    : (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

export const ASSISTANT_NAME = 'Nova';

const isMobileDevice = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS reports a desktop Safari user agent.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

const joinWords = (first: string, second: string) =>
  first && second ? `${first} ${second}` : first || second;

// Trailing send command: "Nova, over to you" / "Nova, please check" or "over to Nova".
// A bare trailing "Nova" does not send: phones split "Nova… over to you" at the pause.
// 发送 covers Mandarin, where recognizers do not transcribe the English name reliably.
const VOICE_SEND_LEAD_IN = '(?:over to|thanks|thank you|okay|ok|hey)';
const VOICE_SEND_SUFFIX =
  '(?:over to you|over|please check|please send|go ahead|go|send it|send)';
const VOICE_SEND_PATTERN = new RegExp(
  `[\\s,.!?，。]*(?:\\b${VOICE_SEND_LEAD_IN}[\\s,]+${ASSISTANT_NAME}\\b|\\b${ASSISTANT_NAME}[\\s,.!?]+${VOICE_SEND_SUFFIX}\\b|发送)[\\s,.!?，。]*$`,
  'i',
);

export const AgentConversationModal: React.FC<AgentConversationModalProps> = ({
  isOpen,
  onClose,
  agentConfig,
  patientId,
  tenantId = 'default',
  accessToken,
  title = 'Ask About Your Health',
  mode = 'modal',
}) => {
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitlReason, setHitlReason] = useState<string | null>(null);
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [pendingIntervention, setPendingIntervention] =
    useState<PendingIntervention | null>(null);
  const [interventionNotes, setInterventionNotes] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const isClinician = agentConfig.audience === 'clinician';
  // Scopes backend conversation memory to this widget session.
  const conversationIdRef = useRef(newConversationId());
  // Backdated to tolerate client/server clock skew when matching meta.lastUpdated.
  const sessionStartedAtRef = useRef(
    new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  );
  const speechSupported = Boolean(getSpeechRecognition());
  const dispatch = useDispatch();
  // Set when the clinician approves a write; updates are not listed in createdResourceIds.
  const approvedWriteRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  // Hands-free mode: listening pauses while the AI works and resumes after it replies.
  const [voiceMode, setVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Mission completion is primarily detected via SSE "update AgentMission" events
  // (see Persona_Integration_Guide.md); these refs back a polling fallback only.
  const missionWatchIdRef = useRef<string | null>(null);
  const missionResolvedRef = useRef(true);
  const overallTimeoutRef = useRef<NodeJS.Timeout>();
  const finalTimeoutRef = useRef<NodeJS.Timeout>();
  const fallbackPollIntervalRef = useRef<NodeJS.Timeout>();

  const applyModalPosition = (x: number, y: number) => {
    modalPositionRef.current = { x, y };
    if (!modalRef.current) return;
    modalRef.current.style.left = `${x}px`;
    modalRef.current.style.top = `${y}px`;
  };

  const parseJsonSafely = (text: string): any => {
    if (!text || !text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  const normalizeMissionPayload = (
    payload: any,
    headers?: Headers,
  ): MissionExecutionResult => {
    const asObject = payload && typeof payload === 'object' ? payload : {};

    let parsedResult: any = null;
    if (typeof asObject.result === 'string' && asObject.result.trim()) {
      parsedResult = parseJsonSafely(asObject.result);
    } else if (asObject.result && typeof asObject.result === 'object') {
      parsedResult = asObject.result;
    }

    const summaryText =
      (typeof parsedResult?.summary === 'string' && parsedResult.summary) ||
      (typeof parsedResult?.parameters?.summary === 'string' &&
        parsedResult.parameters.summary) ||
      (typeof asObject.summary === 'string' && asObject.summary) ||
      (typeof asObject.message === 'string' && asObject.message) ||
      undefined;

    const resultOutputs =
      parsedResult?.outputs && typeof parsedResult.outputs === 'object'
        ? parsedResult.outputs
        : {};
    const payloadOutputs =
      asObject.outputs && typeof asObject.outputs === 'object'
        ? asObject.outputs
        : {};

    const outputs: MissionExecutionResult['outputs'] = {
      ...(resultOutputs as Record<string, any>),
      ...(payloadOutputs as Record<string, any>),
      response:
        (payloadOutputs as any).response ||
        (resultOutputs as any).response ||
        summaryText,
      confidence:
        typeof (payloadOutputs as any).confidence === 'number'
          ? (payloadOutputs as any).confidence
          : typeof (resultOutputs as any).confidence === 'number'
            ? (resultOutputs as any).confidence
            : typeof parsedResult?.confidence === 'number'
              ? parsedResult.confidence
              : typeof asObject.confidence === 'number'
                ? asObject.confidence
                : undefined,
      sources:
        (payloadOutputs as any).sources || (resultOutputs as any).sources,
      disclaimer:
        (payloadOutputs as any).disclaimer || (resultOutputs as any).disclaimer,
      executionTimeMs:
        (payloadOutputs as any).executionTimeMs ||
        (resultOutputs as any).executionTimeMs ||
        parsedResult?.durationMs ||
        asObject.durationMs,
      tokensUsed:
        (payloadOutputs as any).tokensUsed || (resultOutputs as any).tokensUsed,
      costBreakdown:
        (payloadOutputs as any).costBreakdown ||
        (resultOutputs as any).costBreakdown,
      groundingEvidence:
        (payloadOutputs as any).groundingEvidence ||
        (resultOutputs as any).groundingEvidence ||
        parsedResult?.groundingEvidence ||
        parsedResult?.parameters?.groundingEvidence ||
        asObject.groundingEvidence,
      reasoningTrace:
        (payloadOutputs as any).reasoningTrace ||
        (resultOutputs as any).reasoningTrace ||
        parsedResult?.reasoningTrace ||
        parsedResult?.parameters?.reasoningTrace ||
        asObject.reasoningTrace,
    };

    const missionIdFromHeader = headers
      ? extractMissionId({
          text: '',
          headers: {
            location: headers.get('location') || '',
            'x-mission-id': headers.get('x-mission-id') || '',
            'x-execution-id': headers.get('x-execution-id') || '',
          },
          metadata: asObject,
        })
      : null;

    const missionId =
      asObject.missionId ||
      asObject.id ||
      asObject.executionId ||
      missionIdFromHeader ||
      '';

    const status = String(
      asObject.status || parsedResult?.status || 'PENDING',
    ).toUpperCase() as MissionExecutionResult['status'];
    const failureReason =
      asObject.failureReason ||
      parsedResult?.failureReason ||
      asObject.error ||
      (parsedResult?.success === false
        ? 'Mission execution failed'
        : undefined);

    return {
      missionId,
      status,
      goal: asObject.goal || '',
      outputs,
      failureReason,
      startedAt: asObject.startedAt || asObject.createdAt,
      completedAt: asObject.completedAt,
      auditTrail: asObject.auditTrail,
    };
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    const maxHeight = Math.round(window.innerHeight * 0.4);
    element.style.height = 'auto';
    const overflowing = element.scrollHeight > maxHeight;
    element.style.height = `${overflowing ? maxHeight : element.scrollHeight}px`;
    element.style.overflowY = overflowing ? 'auto' : 'hidden';
    // Keep the newest dictated words in view once the box stops growing.
    if (overflowing && isListening) element.scrollTop = element.scrollHeight;
  }, [input, isListening]);

  useEffect(() => {
    return () => {
      clearMissionWatchers();
      recognitionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setVoiceMode(false);
      recognitionRef.current?.abort();
      setConversations([]);
      setError(null);
      setHitlReason(null);
      setCurrentMissionId(null);
      setPendingIntervention(null);
      setInterventionNotes('');
      conversationIdRef.current = newConversationId();
      sessionStartedAtRef.current = new Date(
        Date.now() - 2 * 60 * 1000,
      ).toISOString();
      setIsDragging(false);
      if (modalRef.current) {
        modalRef.current.style.left = '';
        modalRef.current.style.top = '';
      }
      missionResolvedRef.current = true;
      missionWatchIdRef.current = null;
      clearMissionWatchers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    if (window.innerWidth < 640) {
      if (modalRef.current) {
        modalRef.current.style.left = '';
        modalRef.current.style.top = '';
      }
      return;
    }

    const defaultWidthPx = Math.min(window.innerWidth * 0.95, 739.2);
    const x = Math.max(16, window.innerWidth - defaultWidthPx - 24);
    const y = Math.max(16, Math.round(window.innerHeight * 0.14));
    applyModalPosition(x, y);
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging || typeof window === 'undefined') return;

    const onMouseMove = (event: MouseEvent) => {
      if (!modalRef.current) return;

      const modalWidth = modalRef.current.offsetWidth;
      const modalHeight = modalRef.current.offsetHeight;
      const nextX = event.clientX - dragOffsetRef.current.x;
      const nextY = event.clientY - dragOffsetRef.current.y;

      const clampedX = Math.min(
        Math.max(0, nextX),
        Math.max(0, window.innerWidth - modalWidth),
      );
      const clampedY = Math.min(
        Math.max(0, nextY),
        Math.max(0, window.innerHeight - modalHeight),
      );

      applyModalPosition(clampedX, clampedY);
    };

    const onMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (typeof window === 'undefined' || window.innerWidth < 640) return;
    if (!modalRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;

    const rect = modalRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDragging(true);
  };

  const submitMissionRequest = async (
    goal: string,
  ): Promise<MissionExecutionResult> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
      ...(agentConfig.headers || {}),
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const authenticatedHeaders = await getAuthenticatedHeaders(headers);

    // Use extended timeout for AI processing (can involve complex FHIR queries)
    const response = await fetchWithTimeout(agentConfig.endpoint, {
      method: 'POST',
      headers: authenticatedHeaders,
      body: JSON.stringify({
        goal,
        context: {
          patientId,
          channel: isClinician ? 'ehr-widget' : 'patient-portal',
          ...(isClinician ? { conversationId: conversationIdRef.current } : {}),
          ...(agentConfig.missionContext || {}),
        },
      }),
      timeout: 75000, // 75 seconds for initial mission creation (with buffer for polling)
    });

    const parsed = parseJsonSafely(await response.text());

    if (!response.ok) {
      throw new Error(
        extractOperationOutcomeText(parsed) ||
          parsed.message ||
          `Failed to create mission (${response.status})`,
      );
    }

    return normalizeMissionPayload(parsed, response.headers);
  };

  const agentApiUrl = (path: string): string => {
    const endpoint = agentConfig.endpoint;
    if (/^https?:\/\//i.test(endpoint)) {
      try {
        return `${new URL(endpoint).origin}${path}`;
      } catch {
        return path;
      }
    }
    if (endpoint.startsWith('/')) {
      // Keep a dev proxy prefix such as /api-azure.
      const match = endpoint.match(/^(\/[^/]+)/);
      return `${match ? match[1] : ''}${path}`;
    }
    return path;
  };

  const buildAgentHeaders = async (
    extra: Record<string, string> = {},
  ): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'X-Tenant-ID': tenantId,
      ...(agentConfig.headers || {}),
      ...extra,
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return getAuthenticatedHeaders(headers);
  };

  const fetchMissionStatus = async (
    missionId: string,
  ): Promise<MissionExecutionResult> => {
    const authenticatedHeaders = await buildAgentHeaders();
    const statusUrl = agentApiUrl(
      `/api/agent/AgentMission/${encodeURIComponent(missionId)}`,
    );

    // Use 10-second timeout for status checks
    const response = await fetchWithTimeout(statusUrl, {
      headers: authenticatedHeaders,
      timeout: 10000, // 10 seconds for status polling
    });

    if (!response.ok) {
      const parsed = parseJsonSafely(await response.text());
      throw new Error(
        extractOperationOutcomeText(parsed) ||
          `Status check failed (${response.status})`,
      );
    }

    const parsed = parseJsonSafely(await response.text());
    return normalizeMissionPayload(parsed, response.headers);
  };

  const addAgentMessage = (responseText: string, metadata?: any) => {
    const parsed = agentConfig.parser
      ? agentConfig.parser({ text: responseText, metadata })
      : parseAgentResponse({ text: responseText, metadata });

    const agentMessage: ConversationMessage = {
      role: 'agent',
      content: parsed.text,
      timestamp: new Date(),
      metadata: {
        confidence: parsed.confidence,
        sources: parsed.sources,
        disclaimer: parsed.disclaimer,
        executionTimeMs: parsed.executionTimeMs,
        tokensUsed: parsed.tokensUsed,
        costBreakdown: parsed.costBreakdown,
        groundingEvidence: parsed.groundingEvidence,
        reasoningTrace: parsed.reasoningTrace,
        createdResourceIds: Array.isArray(metadata?.createdResourceIds)
          ? metadata.createdResourceIds.map(String)
          : undefined,
      },
    };

    setConversations((prev) => [...prev, agentMessage]);
  };

  // Give SSE a short head start, then use polling if the stream misses an event.
  const MISSION_WAIT_TIMEOUT_MS = 15000;
  // Fallback poll cadence after the primary SSE wait times out.
  const FALLBACK_POLL_INTERVAL_MS = 3000;
  // Extra polling window after the primary SSE wait times out, before
  // reporting a timeout to the user.
  const MISSION_FINAL_TIMEOUT_MS = 60000;

  const clearMissionWatchers = () => {
    if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);
    if (finalTimeoutRef.current) clearTimeout(finalTimeoutRef.current);
    if (fallbackPollIntervalRef.current)
      clearInterval(fallbackPollIntervalRef.current);
    overallTimeoutRef.current = undefined;
    finalTimeoutRef.current = undefined;
    fallbackPollIntervalRef.current = undefined;
  };

  const refreshRecordsIfWritten = (mission: MissionExecutionResult) => {
    const wroteRecords =
      (mission.outputs?.createdResourceIds?.length ?? 0) > 0 ||
      approvedWriteRef.current;
    approvedWriteRef.current = false;
    if (wroteRecords) {
      dispatch(fhirApi.util.invalidateTags([...PATIENT_RECORD_TAGS]));
    }
  };

  const handleMissionResolution = (mission: MissionExecutionResult) => {
    if (missionResolvedRef.current) return;

    if (mission.status === 'COMPLETED') {
      missionResolvedRef.current = true;
      clearMissionWatchers();
      refreshRecordsIfWritten(mission);
      if (mission.outputs?.response) {
        addAgentMessage(mission.outputs.response, mission.outputs);
      } else {
        addAgentMessage(
          'Mission completed, but no response body was returned.',
        );
      }
      setLoading(false);
    } else if (mission.status === 'FAILED') {
      missionResolvedRef.current = true;
      clearMissionWatchers();
      setError(mission.failureReason || 'Mission execution failed');
      setLoading(false);
    } else if (mission.status === 'AWAITING_INTERVENTION') {
      if (isClinician) {
        void resolveClinicianIntervention(mission);
        return;
      }
      missionResolvedRef.current = true;
      clearMissionWatchers();
      // HITL (Human-In-The-Loop) triggered - assessment suspended for human review
      setHitlReason(mission.failureReason || 'Assessment under review');
      setLoading(false);
    }
    // Otherwise still RUNNING/PENDING — keep waiting for the next SSE event or poll tick.
  };

  const loadPendingIntervention = async (
    missionId: string,
  ): Promise<PendingIntervention | null> => {
    const headers = await buildAgentHeaders();
    const response = await fetchWithTimeout(
      agentApiUrl(
        `/api/agent/AgentInterventionRequest?missionId=${encodeURIComponent(missionId)}&status=PENDING`,
      ),
      { headers, timeout: 10000 },
    );
    if (!response.ok) {
      throw new Error(`Unable to load pending approval (${response.status})`);
    }
    const payload = parseJsonSafely(await response.text());
    const first = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
    const entry = first?.resource ?? first;
    if (!entry?.id) return null;
    const steps = entry.context?.proposedPlan?.steps ?? entry.context?.steps;
    return {
      id: String(entry.id),
      missionId,
      question: typeof entry.question === 'string' ? entry.question : undefined,
      options:
        Array.isArray(entry.options) && entry.options.length
          ? entry.options.map(String)
          : ['approve', 'request-changes', 'reject'],
      steps: Array.isArray(steps) ? steps : [],
    };
  };

  const resolveClinicianIntervention = async (
    mission: MissionExecutionResult,
  ) => {
    let intervention: PendingIntervention | null;
    try {
      intervention = await loadPendingIntervention(mission.missionId);
    } catch {
      return; // Transient — the next SSE event or poll tick retries.
    }
    // No pending row yet means a submitted decision is still resuming the mission.
    if (!intervention || missionResolvedRef.current) return;
    missionResolvedRef.current = true;
    clearMissionWatchers();
    if (!intervention.steps.length) {
      intervention.steps = mission.outputs?.proposedPlan?.steps ?? [];
    }
    setPendingIntervention(intervention);
    setLoading(false);
  };

  const checkMissionOnce = async (missionId: string) => {
    if (missionResolvedRef.current) return;
    try {
      const mission = await fetchMissionStatus(missionId);
      handleMissionResolution(mission);
    } catch {
      // Transient error — rely on the next SSE event, fallback poll tick, or overall timeout.
    }
  };

  const startFallbackPolling = (missionId: string) => {
    if (fallbackPollIntervalRef.current) return;
    fallbackPollIntervalRef.current = setInterval(() => {
      if (missionResolvedRef.current) return;
      void checkMissionOnce(missionId);
    }, FALLBACK_POLL_INTERVAL_MS);
  };

  // Watches a mission for completion primarily via SSE "update AgentMission"
  // events (see Persona_Integration_Guide.md); only falls back to polling if
  // the SSE wait times out.
  const watchMissionForCompletion = (missionId: string) => {
    clearMissionWatchers();
    missionResolvedRef.current = false;
    missionWatchIdRef.current = missionId;

    overallTimeoutRef.current = setTimeout(() => {
      if (missionResolvedRef.current) return;
      startFallbackPolling(missionId);
      finalTimeoutRef.current = setTimeout(() => {
        if (missionResolvedRef.current) return;
        missionResolvedRef.current = true;
        clearMissionWatchers();
        setError('Request timed out. Please try again.');
        setLoading(false);
      }, agentConfig.missionTimeoutMs ?? MISSION_FINAL_TIMEOUT_MS);
    }, MISSION_WAIT_TIMEOUT_MS);

    // Guard against a race where the mission already changed state before we
    // started watching.
    void checkMissionOnce(missionId);
  };

  const submitInterventionDecision = async (decision: string) => {
    if (!pendingIntervention) return;
    const notes = interventionNotes.trim();
    if (DECISIONS_REQUIRING_NOTES.has(decision) && !notes) {
      setError('Please add notes describing what the AI should change.');
      return;
    }
    setIsSubmittingDecision(true);
    setError(null);
    try {
      const headers = await buildAgentHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetchWithTimeout(
        agentApiUrl(
          `/api/agent/AgentInterventionRequest/${encodeURIComponent(pendingIntervention.id)}`,
        ),
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ decision, ...(notes ? { notes } : {}) }),
          timeout: 15000,
        },
      );
      if (!response.ok) {
        const parsed = parseJsonSafely(await response.text());
        throw new Error(
          extractOperationOutcomeText(parsed) ||
            parsed.message ||
            `Unable to submit decision (${response.status})`,
        );
      }
      setConversations((prev) => [
        ...prev,
        {
          role: 'user',
          content: `${DECISION_LABELS[decision] || decision}${notes ? `: ${notes}` : ''}`,
          timestamp: new Date(),
        },
      ]);
      const missionId = pendingIntervention.missionId;
      if (decision === 'approve' || decision === 'retry') {
        approvedWriteRef.current = true;
      }
      setPendingIntervention(null);
      setInterventionNotes('');
      setLoading(true);
      watchMissionForCompletion(missionId);
    } catch (err: any) {
      setError(err?.message || 'Unable to submit decision. Please try again.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  useSSESubscription({
    topics: ['AgentMission'],
    actions: ['update'],
    autoConnect: isOpen,
    onEvent: (event) => {
      if (
        event.resourceType === 'AgentMission' &&
        event.resourceId === missionWatchIdRef.current
      ) {
        void checkMissionOnce(event.resourceId);
      }
    },
  });

  const toggleVoiceInput = () => {
    if (voiceMode) {
      setVoiceMode(false);
      recognitionRef.current?.stop();
      return;
    }
    setVoiceMode(true);
    startListening();
  };

  const startListening = () => {
    if (recognitionRef.current) return;
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    // Mobile engines repeat earlier words in continuous mode; use one utterance per session
    // there and let hands-free mode restart listening after each pause.
    recognition.continuous = !isMobileDevice();
    recognition.interimResults = true;
    let committed = input.trim() ? input.trimEnd() : '';
    let lastFinal = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const text = String(event.results[index][0].transcript || '').trim();
        if (!text) continue;
        if (event.results[index].isFinal) {
          if (text !== lastFinal) {
            committed = joinWords(committed, text);
            lastFinal = text;
          }
        } else {
          interim = joinWords(interim, text);
        }
      }
      if (VOICE_SEND_PATTERN.test(committed)) {
        recognition.onresult = null;
        recognition.stop();
        const message = committed.replace(VOICE_SEND_PATTERN, '').trim();
        setInput('');
        if (message) void sendMessage(message);
        return;
      }
      setInput(joinWords(committed, interim));
    };
    recognition.onerror = (event: any) => {
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed'
      ) {
        setVoiceMode(false);
        setError(
          'Microphone access is blocked. Allow microphone access in your browser to use voice input.',
        );
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceMode(false);
        setError(`Voice input stopped (${event.error}). Please try again.`);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setVoiceMode(false);
      setError('Unable to start voice input. Please try again.');
    }
  };

  useEffect(() => {
    if (!voiceMode || isListening || loading || pendingIntervention) return;
    // Also restarts after the browser ends a session on its own (e.g. long silence).
    startListening();
  }, [voiceMode, isListening, loading, pendingIntervention]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    recognitionRef.current?.stop();
    await sendMessage(input);
  };

  const sendMessage = async (text: string) => {
    const message = text.trim();
    if (!message) return;

    const userMessage: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setConversations((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);
    setHitlReason(null);

    try {
      const mission = await submitMissionRequest(message);
      if (!mission.missionId) {
        throw new Error('No mission ID returned by the agent service.');
      }

      setCurrentMissionId(mission.missionId);

      if (mission.status === 'COMPLETED' && mission.outputs?.response) {
        refreshRecordsIfWritten(mission);
        addAgentMessage(mission.outputs.response, mission.outputs);
        setLoading(false);
        return;
      }

      if (mission.status === 'FAILED') {
        throw new Error(mission.failureReason || 'Mission execution failed.');
      }

      watchMissionForCompletion(mission.missionId);
    } catch (err: any) {
      setError(err?.message || 'Failed to send message. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      ref={modalRef}
      className={
        mode === 'panel'
          ? 'h-full flex flex-col'
          : 'bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:absolute sm:w-[46.2rem] sm:min-w-[36rem] sm:max-w-[95vw] sm:resize sm:overflow-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col'
      }
    >
      {mode === 'modal' && (
        <div
          className={`flex items-center justify-between px-6 py-4 border-b border-gray-200 sm:cursor-move ${isDragging ? 'select-none' : ''}`}
          onMouseDown={handleHeaderMouseDown}
        >
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {conversations.length === 0 && mode === 'modal' ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">
              Ask a question about your health. I&apos;ll help explain your
              medical information.
            </p>
          </div>
        ) : (
          conversations.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={
                  msg.role === 'user'
                    ? 'max-w-xs md:max-w-md lg:max-w-lg rounded-lg px-4 py-2 bg-blue-600 text-white'
                    : 'w-full min-w-0 max-w-[90%]'
                }
              >
                {msg.role === 'agent' ? (
                  <AgentResponseFormatter
                    response={{
                      text: msg.content,
                      confidence: msg.metadata?.confidence || 0.5,
                      sources: msg.metadata?.sources || [],
                      disclaimer: msg.metadata?.disclaimer,
                      executionTimeMs: msg.metadata?.executionTimeMs,
                      tokensUsed: msg.metadata?.tokensUsed,
                      costBreakdown: msg.metadata?.costBreakdown,
                      groundingEvidence: msg.metadata?.groundingEvidence,
                      reasoningTrace: msg.metadata?.reasoningTrace,
                    }}
                    compact={true}
                    resourceActions={{
                      allowEdit: isClinician,
                      editableResourceIds: conversations.flatMap(
                        (message) => message.metadata?.createdResourceIds || [],
                      ),
                      editableSince: sessionStartedAtRef.current,
                    }}
                  />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-100" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-200" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {hitlReason && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex gap-2">
              <div className="text-amber-600 mt-0.5">⏳</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  Assessment Under Review
                </p>
                <p className="text-sm text-amber-800 mt-1">
                  Your assessment needs a quick human review before it can be
                  shared.
                </p>
                {hitlReason !== 'Assessment under review' && (
                  <p className="text-xs text-amber-700 mt-2 italic">
                    Reason: {hitlReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {currentMissionId && (
          <p className="text-xs text-gray-400">
            Mission ID: {currentMissionId}
          </p>
        )}

        {isClinician && pendingIntervention && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              Approval required before saving to the patient record
            </p>
            {pendingIntervention.question && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                {pendingIntervention.question}
              </p>
            )}
            {pendingIntervention.steps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-800">
                {pendingIntervention.steps.map((step, index) => (
                  <li key={index}>
                    {step.description || 'Proposed action'}
                    {step.riskClass && (
                      <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        {step.riskClass}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <textarea
              value={interventionNotes}
              onChange={(event) => setInterventionNotes(event.target.value)}
              rows={2}
              placeholder="Notes for the AI (required when requesting changes)"
              className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingIntervention.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={isSubmittingDecision}
                  onClick={() => void submitInterventionDecision(option)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                    option === 'approve'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : option === 'reject' || option === 'cancel'
                        ? 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                        : 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  {DECISION_LABELS[option] ||
                    option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={isClinician ? 3 : 1}
            placeholder={
              pendingIntervention
                ? 'Respond to the pending approval above first'
                : isClinician
                  ? 'Ask about this patient, or type S/O/A/P notes (Shift+Enter for a new line)'
                  : 'Type your question...'
            }
            disabled={loading || !!pendingIntervention}
            className="flex-1 resize-none px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={!voiceMode && (loading || !!pendingIntervention)}
              className={`self-end rounded-lg border p-2 transition-colors disabled:opacity-50 ${
                isListening
                  ? 'animate-pulse border-red-300 bg-red-600 text-white hover:bg-red-700'
                  : voiceMode
                    ? 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
              }`}
              title={voiceMode ? 'End voice mode' : 'Start voice input'}
              aria-label={voiceMode ? 'End voice mode' : 'Start voice input'}
              aria-pressed={voiceMode}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim() || !!pendingIntervention}
            className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm transition-colors"
          >
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </form>

        {isListening ? (
          <p className="mt-2 text-xs font-medium text-red-600">
            Listening… say “{ASSISTANT_NAME}, over to you” to send. Tap the
            microphone to end voice mode and review the text first.
          </p>
        ) : voiceMode ? (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Voice paused —{' '}
            {pendingIntervention
              ? 'listening resumes after you respond to the approval above.'
              : 'listening resumes when the AI replies.'}{' '}
            Tap the microphone to end voice mode.
          </p>
        ) : null}

        <p className="text-xs text-gray-500 mt-2">
          {isClinician
            ? 'AI-generated clinical decision support. Verify against the source record; nothing is saved without your approval.'
            : 'This AI assistant can help explain your health information. Always discuss important health decisions with your doctor.'}
        </p>
      </div>
    </div>
  );

  if (mode === 'panel') {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-start justify-center">
      {content}
    </div>
  );
};

export default AgentConversationModal;
