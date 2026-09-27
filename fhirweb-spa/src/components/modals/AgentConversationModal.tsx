import React, { useState, useRef, useEffect } from 'react';
import AgentResponseFormatter from '../common/AgentResponseFormatter';
import {
  ConversationMessage,
  AgentEndpointConfig,
  MissionExecutionResult,
} from '../../types/agent';
import {
  parseAgentResponse,
  extractMissionId,
} from '../../utils/agentResponseParser';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { extractOperationOutcomeText } from '../../utils/fhirError';
import { getAuthenticatedHeaders } from '../../services/auth/oidc';
import { useSSESubscription } from '../../hooks/useSSESubscription';

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
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    return () => {
      clearMissionWatchers();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConversations([]);
      setError(null);
      setHitlReason(null);
      setCurrentMissionId(null);
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
          channel: 'patient-portal',
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

  const fetchMissionStatus = async (
    missionId: string,
  ): Promise<MissionExecutionResult> => {
    const headers: Record<string, string> = {
      'X-Tenant-ID': tenantId,
      ...(agentConfig.headers || {}),
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const authenticatedHeaders = await getAuthenticatedHeaders(headers);

    const endpoint = agentConfig.endpoint;
    const missionStatusPath = `/api/agent/AgentMission/${encodeURIComponent(missionId)}`;
    let statusUrl = missionStatusPath;

    if (/^https?:\/\//i.test(endpoint)) {
      // Full HTTP URL - extract origin and use it
      try {
        const parsed = new URL(endpoint);
        statusUrl = `${parsed.origin}${missionStatusPath}`;
      } catch {
        statusUrl = missionStatusPath;
      }
    } else if (endpoint.startsWith('/')) {
      // Relative path like /api-azure/api/agent/AgentPersona/...
      // Extract proxy prefix (e.g., /api-azure) from endpoint
      const match = endpoint.match(/^(\/[^/]+)/);
      const proxyPrefix = match ? match[1] : '';
      statusUrl = `${proxyPrefix}${missionStatusPath}`;
    }

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

  const handleMissionResolution = (mission: MissionExecutionResult) => {
    if (missionResolvedRef.current) return;

    if (mission.status === 'COMPLETED') {
      missionResolvedRef.current = true;
      clearMissionWatchers();
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
      missionResolvedRef.current = true;
      clearMissionWatchers();
      // HITL (Human-In-The-Loop) triggered - assessment suspended for human review
      setHitlReason(mission.failureReason || 'Assessment under review');
      setLoading(false);
    }
    // Otherwise still RUNNING/PENDING — keep waiting for the next SSE event or poll tick.
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
      }, MISSION_FINAL_TIMEOUT_MS);
    }, MISSION_WAIT_TIMEOUT_MS);

    // Guard against a race where the mission already changed state before we
    // started watching.
    void checkMissionOnce(missionId);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
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

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm transition-colors"
          >
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-2">
          This AI assistant can help explain your health information. Always
          discuss important health decisions with your doctor.
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
