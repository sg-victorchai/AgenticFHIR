/**
 * Agent Types
 * Shared type definitions for agent personas, conversations, and responses
 */

/**
 * Conversation message (user or agent)
 */
export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  metadata?: ConversationMetadata;
}

/**
 * Optional metadata attached to a message
 */
export interface ConversationMetadata {
  confidence?: number; // 0.0-1.0 confidence score
  sources?: AgentSource[]; // References to data sources (FHIR resources, etc.)
  disclaimer?: string; // Medical/legal disclaimer text
  executionTimeMs?: number; // Processing time for agent response
  tokensUsed?: number; // LLM tokens consumed
  missionId?: string; // Unique mission/execution ID
  costBreakdown?: CostBreakdown;
}

/**
 * Cost tracking for LLM provider usage
 */
export interface CostBreakdown {
  provider: string; // 'anthropic', 'openai', 'azure', 'ollama'
  model: string; // e.g., 'claude-3-sonnet', 'gpt-4-turbo'
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/**
 * Source reference (FHIR resource or external reference)
 */
export interface AgentSource {
  resourceType?: string; // e.g., 'Observation', 'Condition', 'Medication'
  id?: string; // Resource ID
  reference?: string; // Full reference URL
  display?: string; // Human-readable display text
}

/**
 * Normalized agent response structure
 */
export interface AgentResponse {
  text: string; // Main response text
  confidence: number; // 0.0-1.0
  sources: AgentSource[];
  disclaimer?: string;
  executionTimeMs?: number;
  tokensUsed?: number;
  costBreakdown?: CostBreakdown;
  riskFlags?: RiskFlag[]; // Potential issues to flag to user
}

/**
 * Risk flag for data quality or safety issues
 */
export interface RiskFlag {
  type: string; // e.g., 'LOW_CONFIDENCE', 'DOSAGE_EXCEED', 'CONFLICT'
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  remediation?: string; // Suggested fix/action
}

/**
 * Response data type detection
 */
export type ResponseType =
  | 'text'
  | 'json'
  | 'markdown'
  | 'table'
  | 'error'
  | 'unknown';

/**
 * Raw response from agent before parsing
 */
export interface RawAgentResponse {
  text: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Agent endpoint configuration for modal to use
 */
export interface AgentEndpointConfig {
  endpoint: string; // Full API URL: /api/agent/AgentPersona/{personaId}/AgentMission
  personaId: string; // e.g., 'digital-twin'
  headers?: Record<string, string>; // Additional headers (tenant, patient ID, auth)
  parser?: (raw: RawAgentResponse) => AgentResponse; // Custom response parser
  supportsContinuation?: boolean; // Can agent handle follow-up questions?
}

/**
 * Mission execution result
 */
export interface MissionExecutionResult {
  missionId: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'AWAITING_INTERVENTION'
    | 'COMPLETED'
    | 'FAILED';
  goal: string;
  outputs?: {
    response?: string;
    confidence?: number;
    sources?: AgentSource[];
    disclaimer?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    costBreakdown?: CostBreakdown;
  };
  failureReason?: string;
  startedAt?: string;
  completedAt?: string;
  auditTrail?: {
    missionStarted?: string;
    missionCompleted?: string;
    toolCalls?: number;
    tokensUsed?: number;
  };
}

/**
 * A single step of a propose_plan-triggered intervention's proposed plan
 */
export interface ProposedPlanStep {
  description: string;
  riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | string;
}

/**
 * AgentInterventionRequest — a human-in-the-loop request raised by a mission
 * (via propose_plan or request_intervention) that a care coordinator must
 * act on. GET /api/agent/AgentInterventionRequest?status=PENDING is the
 * authoritative source; SSE only carries a lightweight change notification,
 * never this content, so it must be (re)fetched via that endpoint.
 */
export interface AgentInterventionRequest {
  id: string;
  missionId: string;
  type: string; // e.g. 'approval'
  status: 'PENDING' | 'RESOLVED' | 'EXPIRED' | string;
  question: string;
  assignee?: string | null;
  options: string[];
  timeoutAction?: string;
  timeoutMinutes?: number;
  createdAt: string;
  expiresAt?: string;
  context?: {
    hitlTriggerReason?: string;
    missionSignal?: string;
    proposedPlan?: {
      steps: ProposedPlanStep[];
    };
    [key: string]: unknown;
  };
}
