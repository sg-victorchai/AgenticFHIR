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

interface AgentConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentConfig: AgentEndpointConfig;
  patientId: string;
  tenantId?: string;
  accessToken?: string;
  title?: string;
}

export const AgentConversationModal: React.FC<AgentConversationModalProps> = ({
  isOpen,
  onClose,
  agentConfig,
  patientId,
  tenantId = 'default',
  accessToken,
  title = 'Ask About Your Health',
}) => {
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pollIntervalRef = useRef<NodeJS.Timeout>();

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
            : undefined,
      sources:
        (payloadOutputs as any).sources || (resultOutputs as any).sources,
      disclaimer:
        (payloadOutputs as any).disclaimer || (resultOutputs as any).disclaimer,
      executionTimeMs:
        (payloadOutputs as any).executionTimeMs ||
        (resultOutputs as any).executionTimeMs,
      tokensUsed:
        (payloadOutputs as any).tokensUsed || (resultOutputs as any).tokensUsed,
      costBreakdown:
        (payloadOutputs as any).costBreakdown ||
        (resultOutputs as any).costBreakdown,
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

    const status = (asObject.status ||
      'PENDING') as MissionExecutionResult['status'];
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
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConversations([]);
      setError(null);
      setCurrentMissionId(null);
      setIsDragging(false);
      if (modalRef.current) {
        modalRef.current.style.left = '';
        modalRef.current.style.top = '';
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
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
      'X-Patient-ID': patientId,
      ...(agentConfig.headers || {}),
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        goal,
        context: {
          patientId,
          channel: 'patient-portal',
        },
      }),
    });

    const parsed = parseJsonSafely(await response.text());

    if (!response.ok) {
      throw new Error(
        parsed.message || `Failed to create mission (${response.status})`,
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

    const response = await fetch(statusUrl, { headers });

    if (!response.ok) {
      throw new Error(`Status check failed (${response.status})`);
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
      },
    };

    setConversations((prev) => [...prev, agentMessage]);
  };

  const startPollingMission = (missionId: string) => {
    let pollCount = 0;
    const maxPolls = 60;
    const pollInterval = 500;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      pollCount++;

      try {
        const mission = await fetchMissionStatus(missionId);

        if (mission.status === 'COMPLETED') {
          clearInterval(pollIntervalRef.current);
          if (mission.outputs?.response) {
            addAgentMessage(mission.outputs.response, mission.outputs);
          } else {
            addAgentMessage(
              'Mission completed, but no response body was returned.',
            );
          }
          setLoading(false);
          return;
        }

        if (mission.status === 'FAILED') {
          clearInterval(pollIntervalRef.current);
          setError(mission.failureReason || 'Mission execution failed');
          setLoading(false);
          return;
        }

        if (pollCount >= maxPolls) {
          clearInterval(pollIntervalRef.current);
          setError('Request timed out. Please try again.');
          setLoading(false);
        }
      } catch (err: any) {
        clearInterval(pollIntervalRef.current);
        setError(err?.message || 'Failed to check status');
        setLoading(false);
      }
    }, pollInterval);
  };

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

      startPollingMission(mission.missionId);
    } catch (err: any) {
      setError(err?.message || 'Failed to send message. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-start justify-center">
      <div
        ref={modalRef}
        className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:absolute sm:w-[46.2rem] sm:min-w-[36rem] sm:max-w-[95vw] sm:resize sm:overflow-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col"
      >
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

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {conversations.length === 0 ? (
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
                      : 'w-full max-w-[90%]'
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
    </div>
  );
};

export default AgentConversationModal;
