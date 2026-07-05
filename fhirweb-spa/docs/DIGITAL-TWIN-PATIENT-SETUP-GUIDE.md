# Digital Twin Patient Persona: Setup & Integration Guide

**Version**: 1.0  
**Status**: Production-Ready  
**Last Updated**: 2026-06-15  
**Audience**: Healthcare IT Architects, Integration Engineers, Patient Portal Teams

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Components](#architecture--components)
3. [Prerequisites](#prerequisites)
4. [Setup & Installation](#setup--installation)
5. [Configuration Guide](#configuration-guide)
6. [Patient Portal Integration](#patient-portal-integration)
7. [API Reference](#api-reference)
8. [Security & Privacy](#security--privacy)
9. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
10. [FAQ & Best Practices](#faq--best-practices)

---

## Overview

### What is Digital Twin?

**Digital Twin** is an AI-powered patient persona that provides:

- **Conversational health explanations** grounded in the patient's FHIR medical record
- **Longitudinal context awareness** across multiple encounters and conditions
- **Ambient intelligence** triggered by vital sign changes, new diagnoses, or care events
- **Patient-centered language** simplifying medical jargon for lay audiences
- **Real-time personalized insights** about health trends and interventions

### Key Capabilities

| Capability              | Description                                            | Example                                                                                          |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Health Explanations** | Convert clinical data into plain-language summaries    | "Your blood pressure has been trending higher. Here's what that means..."                        |
| **Trend Analysis**      | Identify patterns across months/years of health data   | "Your HbA1c has worsened from 7.8% to 9.1% over 6 months. You may need a medication adjustment." |
| **Vital Sign Alerts**   | Trigger interventions when readings exceed safe ranges | Out-of-range HbA1c → escalate to clinician + notify patient                                      |
| **Medication Tracking** | Summarize current medications and adherence impact     | "You're on Metformin 500mg twice daily, which helps control blood sugar."                        |
| **Care Coordination**   | Connect observations to upcoming appointments          | "Before your April 15 visit, your doctor will likely discuss your elevated blood pressure."      |
| **Question Answering**  | Answer patient questions about their conditions        | "Why do I need to monitor my glucose?" → personalized explanation                                |

### Target Users

- **Primary**: Patients accessing personal health information via patient portal
- **Secondary**: Caregivers managing patient health (with appropriate delegation)
- **Tertiary**: Clinicians reviewing patient-facing summaries before visits

---

## Architecture & Components

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Patient Portal / Channel                   │
│  (Web App, Mobile App, SMS, WhatsApp, Messaging Platform)   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                    HTTP/WebSocket
                        │
        ┌───────────────▼────────────────┐
        │    FHIR4Java API Gateway       │
        │  (fhir4java-api module)        │
        │  - Authentication (OAuth/SMART)│
        │  - Tenant routing              │
        │  - Request validation          │
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │  Digital Twin Mission Router    │
        │  (AgentPersonaExecutionLoop)   │
        │  - Scope validation            │
        │  - Ambient trigger evaluation  │
        │  - Safety validation           │
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │   LangGraph Agent Runtime      │
        │  (fhir4java-agentcore)         │
        │  - Reasoning loop              │
        │  - Tool execution (fhir_query) │
        │  - Memory management           │
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │   Safety Pipeline Layer        │
        │  - Input validation pipeline   │
        │  - Output moderation pipeline  │
        │  - Confidence thresholds       │
        │  - Disclaimer injection        │
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │   FHIR Data Access Layer       │
        │  (fhir4java-persistence)       │
        │  - Patient record queries      │
        │  - Observation retrieval       │
        │  - Condition lookups           │
        │  - PostgreSQL with row-level   │
        │    tenant isolation            │
        └────────────────────────────────┘
```

### Key Components

#### 1. Digital Twin Persona Definition

**File**: `fhir-config/personas/digital-twin.yml`

- Declares patient scope, execution mode, memory settings
- Specifies ambient triggers (vital out-of-range, conditions, encounters)
- Defines intended user role (PATIENT) and language guardrails

#### 2. Agent Execution Loop

**Class**: `AgentPersonaExecutionLoop`

- Loads persona definition from registry
- Validates patient scope (patient must match requesting user)
- Executes runtime reasoning loop with budget constraints
- Enforces safety validators and audit logging
- Returns conversational response to patient

#### 3. LangGraph Agent Runtime

**Class**: `LangGraphAgentRuntime`

- Implements agent reasoning using LangChain/LangGraph
- Manages tool calls to fhir_query, fhir_discover, etc.
- Maintains episodic memory for patient session context
- Supports chain-of-thought reasoning with self-consistency

#### 4. Safety Pipelines

**Classes**: `LlmInputSafetyPipeline`, `LlmOutputSafetyPipeline`

- **Input**: Detects prompt injection, validates patient query
- **Output**: Filters medical claims, injects disclaimers, checks confidence
- **Platform Config**: Centralized safety rules (not per-persona)

#### 5. Episodic Memory Store

**Class**: `EpisodicMemoryStore` (PostgreSQL backend)

- Stores patient conversation history per session
- TTL: 365 days (configurable per persona)
- Scoped to patient (tenant_id + patient_id)
- Supports decay policies (tiered, exponential)

#### 6. FHIR Data Access

**Repository**: `FhirResourceRepository`

- Row-level tenant isolation (all queries scoped by tenant_id)
- Support for search parameters: code (SNOMED/LOINC), date, value
- Vector search for semantic similarity (future)

---

## Prerequisites

### System Requirements

- **Java**: 21 LTS or later
- **Spring Boot**: 3.4+
- **PostgreSQL**: 16+ (for persistent storage + episodic memory)
- **Memory**: 4GB minimum (2GB heap, 2GB JVM overhead)
- **CPU**: 2 cores minimum; 4+ cores recommended for multi-tenant
- **Disk**: 20GB minimum (database + logs)

### External Dependencies

| Dependency      | Version | Purpose                        |
| --------------- | ------- | ------------------------------ |
| HAPI FHIR       | 7.x     | FHIR parsing, context creation |
| LangChain4J     | Latest  | Agent reasoning framework      |
| Caffeine        | Latest  | Persona definition caching     |
| Flyway          | Latest  | Database schema migration      |
| Spring Data JPA | 3.4+    | ORM for persistent storage     |
| PostgreSQL JDBC | 42+     | Database connectivity          |

### Required Infrastructure

1. **FHIR Server** (self: fhir4java-server)
   - Hosting patient medical records
   - Support for R4B or R5 FHIR version
   - Multi-tenancy enabled

2. **PostgreSQL Database** (required)
   - Patient data tables (fhir_resource)
   - Episodic memory (episodic_memory_entry)
   - Audit logs (audit_event)
   - Search indexes (fhir_search_param)

3. **Redis** (optional, recommended)
   - Session caching
   - Distributed locks (for concurrent missions)
   - Rate limiting

4. **LLM Provider** (required for advanced reasoning)
   - OpenAI GPT-4 (recommended for quality)
   - Anthropic Claude (fallback)
   - Azure OpenAI (enterprise)
   - Local Ollama (development)

### Credentials & Access

- **OAuth 2.0 / SMART on FHIR** tokens from your identity provider
- **Patient ID** (FHIR-compliant UUID or medical record number)
- **Tenant ID** (organization/healthcare system identifier)
- **LLM API key** (if using external LLM provider)

---

## Setup & Installation

### Step 1: Clone & Build

```bash
# Clone the agentic-services repository
git clone https://github.com/your-org/agentic-services.git
cd agentic-services

# Build with Maven Wrapper
./mvnw clean install -DskipTests

# Or with Docker Compose (includes PostgreSQL, Redis)
docker compose build
docker compose up -d
```

### Step 2: Database Schema

> ✅ **NOTE (2026-06-16)**: All required tables are **already part of the platform** and created by Flyway migrations. No additional schema creation needed.

Digital Twin uses these pre-existing tables (created automatically during application startup):

| Table                    | Created By                                         | Purpose                                                            |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------ |
| **fhir_resource**        | V1\_\_baseline.sql (Docker init)                   | Core FHIR resource storage (all resource types)                    |
| **agent_episodic_trace** | V22\_\_agent_episodic_trace.sql                    | Stores mission iterations and reasoning traces for episodic memory |
| **fhir_audit_log**       | V1**baseline.sql + V16**audit_log_enhancements.sql | Audit trail for compliance and access tracking                     |
| **fhir_search_index**    | V1\_\_baseline.sql (Docker init)                   | Pre-computed search parameter indexes                              |

**Reference**: Schema initialization happens in two phases:

1. **Docker Init Script** (`db/init/01-init-schema.sql`): Creates base schemas (fhir, workflow, careplan, masterdata, patientdata)
2. **Flyway Migrations** (`fhir4java-persistence/src/main/resources/db/migration/*.sql`): Incremental schema updates

All these tables are **automatically created** when you start the application. No manual SQL execution needed.

**Example Structures** (for reference only; already exist):

```sql
-- FHIR Resource Storage (created by init script)
-- Stores Patient, Observation, Condition, Medication, Encounter, etc.
fhir_resource (
    id BIGSERIAL PRIMARY KEY,
    resource_id VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,  -- Full FHIR resource as JSON
    tenant_id VARCHAR(64) NOT NULL,
    -- ... plus indexes and version tracking
);

-- Episodic Memory for Agent Reasoning (V22 migration)
-- Stores iteration-by-iteration traces of agent execution
workflow.agent_episodic_trace (
    id VARCHAR(64) PRIMARY KEY,
    mission_id VARCHAR(64) NOT NULL,
    persona_id VARCHAR(128) NOT NULL,
    session_id VARCHAR(64),
    iteration_number INTEGER NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    tools_used JSONB,
    -- ... plus metadata and indexes
);

-- Audit Log for Compliance (V1 baseline + V16 enhancements)
-- Tracks all access, mutations, and AI agent activity
fhir_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    agent_id VARCHAR(100),  -- AI agent identifier
    user_type VARCHAR(20),  -- WEB_USER, API_CLIENT, AI_AGENT, SYSTEM
    action VARCHAR(10),     -- CREATE, READ, UPDATE, DELETE
    -- ... plus audit trail fields and indexes
);
```

### Step 3: Configuration

Create `application-production.yml` (or update existing):

```yaml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/fhir4java
    username: fhir_user
    password: ${DB_PASSWORD} # Use environment variable
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
  jpa:
    hibernate:
      ddl-auto: validate # Don't auto-create; use Flyway
    properties:
      hibernate.dialect: org.hibernate.dialect.PostgreSQL10Dialect

fhir4java:
  # Multi-tenancy
  tenant:
    enabled: true
    default-tenant-id: default
    header-name: X-Tenant-ID # External tenant GUID from client

  # FHIR versioning
  fhir:
    version: R4B # or R5
    allow-unversioned-urls: false

  # Persona registry
  agentcore:
    personas:
      registry-path: classpath:fhir-config/personas/
      cache-ttl: 300s
      enable-hot-reload: false # True in dev, false in prod

  # Episodic memory
  memory:
    store: postgres
    default-ttl: 365d
    decay-policy: tiered

  # Safety pipelines
  safety:
    enabled: true
    config-path: classpath:fhir-config/safety/platform.yml
    input-validation:
      enable-injection-detection: true
      enable-pii-redaction: true
    output-moderation:
      enable-confidence-gating: true
      enable-claim-filtering: true
      enable-disclaimer-injection: true

  # LLM provider configuration ✅ (2026-06-16)
  # These are platform-level defaults; personas can override via their YAML 'model:' section
  llm:
    provider: anthropic # Default provider (anthropic, openai, azure, ollama)
    model: claude-3-sonnet-20240229 # Default model per provider
    anthropic:
      api-key: ${ANTHROPIC_API_KEY}
      base-url: https://api.anthropic.com/v1
      timeout: 60s
    openai:
      api-key: ${OPENAI_API_KEY}
      base-url: https://api.openai.com/v1
      timeout: 30s
      model: gpt-4-turbo
    azure:
      api-key: ${AZURE_OPENAI_API_KEY}
      endpoint: ${AZURE_OPENAI_ENDPOINT}
      deployment: gpt-4-turbo
    ollama:
      base-url: http://localhost:11434
      model: neural-chat
      timeout: 120s

    # Provider-level fallback chains
    fallback-chain:
      - anthropic # Try primary
      - openai # Then fallback
      - ollama # Finally local (for dev)

    # Cost limits (optional)
    cost-limits:
      enabled: false
      monthly-budget-usd: 1000
      alert-threshold-percent: 80

logging:
  level:
    org.fhirframework: DEBUG
    org.fhirframework.agentcore.mission: INFO
    org.fhirframework.agentcore.safety: WARN
  pattern:
    file: '%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n'
  file:
    name: /var/log/fhir4java/digital-twin.log
    max-size: 100MB
    max-history: 10
```

### Step 4: Persona Activation

> ✅ **VERIFIED (2026-06-16)**: Endpoint checked against BDD test cases

Digital Twin persona must be activated before patients can use it. Use the correct PersonaActivationGate endpoint:

```bash
# Activate Digital Twin persona using $activate operation
curl -X POST "http://localhost:8080/api/agent/AgentPersona/digital-twin/\$activate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>"

# Response (201 Created / 200 OK):
{
  "personaId": "digital-twin",
  "status": "activated",
  "activatedAt": "2026-06-16T10:30:00Z",
  "scope": "patient",
  "agentScopeGrant": {
    "resourceTypes": ["Patient", "Observation", "Condition", "Medication"],
    "allowedOperations": ["read", "search"],
    "riskClass": "LOW"
  }
}
```

**Note**: The `$activate` operation validates that the requesting admin has sufficient scope to grant the persona's permissions (GAP 1: Intended User Role Control prevents "confused deputy" attacks).

### Step 5: Test Connectivity

```bash
# Verify FHIR server is running
curl http://localhost:8080/fhir/r4b/metadata

# Check persona registry
curl http://localhost:8080/api/v1/personas/digital-twin \
  -H "Authorization: Bearer <token>"

# Test basic patient query (authenticated)
curl -X POST http://localhost:8080/api/ai/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-token>" \
  -H "X-Patient-ID: <patient-uuid>" \
  -d '{
    "query": "Summarize my recent blood pressure readings",
    "resourceTypes": ["Observation"],
    "maxResults": 50
  }'
```

---

## Configuration Guide

### Digital Twin YAML Persona Definition

**Location**: `fhir-config/personas/digital-twin.yml`

```yaml
# Core identity
resourceType: AgentPersonaDefinition
id: digital-twin
version: 1.0.0
description: Patient-scoped conversational health assistant

# Scope & security
scope: patient # Patient-specific (not tenant-wide)
requiresDelegation: true # Must be explicitly activated
runtime: in-process # Runs in same JVM process
status: active

# System prompt (patient-facing language)
prompts:
  systemRef: classpath:fhir-config/prompts/digital-twin/system.md

# LLM Model Configuration ✅ (2026-06-16)
# Specify which LLM model to use for this persona
model:
  provider: anthropic # Provider: anthropic, openai, azure, ollama
  modelId: claude-3-sonnet-20240229 # Specific model ID (or 'inherit' for default)
  fallback: claude-3-haiku-20240307 # Fallback if primary unavailable
  temperature: 0.3 # Deterministic responses (0.0-1.0)
  maxTokens: 4096 # Max output tokens per response

# Safety & guardrails
# Note: Specific guardrail profiles now deprecated; safety enforced
# via centralized LlmInputSafetyPipeline and LlmOutputSafetyPipeline
roleGuardrails:
  patientFacingLanguage: true # Simplify medical jargon
  disclaimerRequired: true # Append clinical disclaimer
  allowDiagnosticClaims: false # Don't diagnose; only explain
  allowPrescribing: false # Never suggest medications
  requiresClinicalReview: false # Patient-only access (no clinician cosign)
  riskLevel: HIGH

# Scope grant (RBAC)
scopeGrantRef: digital-twin-scope-grant

# Capabilities
skills:
  - skillRef: digital-twin-explain # Main skill: explain medical data
  - skillRef: fhir_query # Query patient medical records
  - skillRef: fhir_discover # Search SNOMED/LOINC codes
  # NOT INCLUDED: fhir_mutate (write operations forbidden for patient)

# Episodic memory (patient conversation history)
memory:
  store: pg-episodic # PostgreSQL backend
  scope: patient # Scoped to patient ID
  ttl: 365d # Keep 1 year of history
  decayPolicy: tiered # Recent conversations more relevant
  cohortAggregation: anonymized # No patient cross-talk

# Performance & cost controls
budget:
  timeout: 10m # Max execution time per mission
  maxTokens: 50000 # LLM token budget
  maxLlmCalls: 30 # Max API calls per mission
  maxToolCalls: 50 # Max FHIR queries per mission

# Reasoning strategy
reasoningStrategy: COT # Chain-of-Thought with self-consistency
thinking:
  enabled: true
  maxTokens: 4096

# Completion semantics
completionCriteria:
  strategy: explicit-end-signal # Patient says "done" or timeout
  timeout: 10m
  fallbackAction: FAIL # If timeout, return failure

# Human-in-the-loop escalation
hitl:
  cosignRiskClass: HIGH # HIGH-risk = escalate to clinician
  cosignChannels: [patient-facing] # Via secure portal only

# Intended user role (GAP 1)
intendedUserRole: PATIENT
intendedChannels:
  - patient-portal
  - whatsapp
  - sms

# Activation & role validation
roleValidation:
  enforceAtActivation: true # Check persona eligibility
  enforceAtMissionCreation: true # Check patient scope at mission start
  enforceAtChannelBinding: true # Check channel is allowed
```

#### LLM Model Configuration Details

| Field           | Purpose                                            | Examples                                             |
| --------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **provider**    | LLM service provider                               | `anthropic`, `openai`, `azure`, `ollama`             |
| **modelId**     | Specific model identifier                          | `claude-3-sonnet-20240229`, `gpt-4-turbo`, `inherit` |
| **fallback**    | Fallback model if primary unavailable              | `claude-3-haiku-20240307`                            |
| **temperature** | Response determinism (0=deterministic, 1=creative) | `0.3` for factual, `0.7` for creative                |
| **maxTokens**   | Maximum output length per response                 | `4096`, `8192`                                       |

**Available Models**:

```bash
# Query configured models
curl -X GET http://localhost:8080/api/agent/AgentPersona/models \
  -H "Authorization: Bearer <token>"

# Response example:
{
  "providers": [
    {
      "provider": "anthropic",
      "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
      "default": "claude-3-sonnet-20240229"
    },
    {
      "provider": "openai",
      "models": ["gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
      "default": "gpt-4-turbo"
    }
  ]
}
```

**Special Values**:

- `modelId: inherit` — Use default from `fhir4java.llm.model` in application.yml
- `provider: ${ACTIVE_PROVIDER}` — Use environment variable for provider selection

### Ambient Triggers Configuration

Digital Twin responds to these events automatically (no user prompt needed). The configuration is split across three files:

**1. Persona Declaration** (`fhir-config/personas/digital-twin.yml`):

```yaml
ambientTriggers:
  # Vital sign out of range: HbA1c > 9.0, BP > 140/90, Glucose > 180
  - subscriptionTopicRef: observation-vital-out-of-range
    # Triggers: mission created, patient notified, HIGH priority

  # New diagnosis recorded (any Condition)
  - subscriptionTopicRef: condition-recorded
    # Triggers: patient gets explanation of new diagnosis

  # Upcoming appointment (Encounter scheduled)
  - subscriptionTopicRef: encounter-arrived
    # Triggers: pre-visit summary based on longitudinal record
```

**2. Topic Definitions** (`fhir-config/topics/*.json`):

Each topic defines what events match (resource type, action, filters):

- `observation-vital-out-of-range.json` — matches Observation create/update with abnormal `interpretation` field
- `encounter-arrived.json` — matches Encounter create/update with status filters
- `condition-recorded.json` — matches Condition create only

**3. Trigger Mapping** (`fhir-config/triggers/digital-twin-ambient.yml`):

```yaml
resourceType: PersonaAmbientTrigger
id: digital-twin-triggers
personaRef: digital-twin
triggerSources:
  - subscriptionTopicRef: observation-vital-out-of-range
    missionScopeExtractor: '$.subject.reference' # Extract patient from Observation.subject
    suppressionWindow: '1h' # Suppress duplicate triggers
    consolidate: 'latest-per-patient' # One mission per patient per hour

  - subscriptionTopicRef: condition-recorded
    missionScopeExtractor: '$.subject.reference'
    suppressionWindow: '2h'
    consolidate: 'latest'

  - subscriptionTopicRef: encounter-arrived
    missionScopeExtractor: '$.subject.reference'
    suppressionWindow: '5m'
    consolidate: 'latest'
```

**Configuration Details:**

| Setting                 | Purpose                                                      | Example                                             |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `missionScopeExtractor` | JSONPath to extract patient/subject reference from resource  | `$.subject.reference` extracts "Patient/P123"       |
| `suppressionWindow`     | Time window for deduplication; prevents notification storm   | "1h" = suppress same topic for 1 hour               |
| `consolidate`           | Strategy for handling multiple events (latest, first, count) | "latest-per-patient" = only keep newest per patient |

### System Prompt (Patient-Facing Language)

**Location**: `fhir-config/prompts/digital-twin/system.md`

```markdown
# You are Digital Twin, a patient health assistant

You are speaking with a patient about their own medical record.

## Core Instructions

- Use plain, everyday language (no medical jargon)
- Explain WHY things matter ("High blood sugar can damage blood vessels")
- NEVER diagnose ("You might have...") — only explain existing diagnoses
- NEVER prescribe ("Take more medicine") — only summarize current meds
- ALWAYS recommend: "Talk to your doctor about..."
- Encourage: be supportive and non-judgmental
- Acknowledge: "I see you've been managing this condition for 2 years"

## Red Lines (STRICT)

- No medical advice beyond explaining their own record
- No speculation about future diagnoses
- No commentary on clinician decisions ("Your doctor should have...")
- No emergency medical advice (direct to 911)

## Safety Disclaimer

You are an AI assistant reviewing the patient's own medical data. I am not a
substitute for clinical judgment. Always discuss health changes with your care team.

---

{patient_context}

Based on this patient's record, provide clear, supportive explanations.
```

### Scope Grant Definition

**Location**: `fhir-config/scope-grants/digital-twin-scope-grant.yml`

```yaml
resourceType: AgentScopeGrant
id: digital-twin-scope-grant
description: Patient-scoped read-only access to own medical record

grants:
  # Patient can see their own data
  - principalType: PATIENT
    principalId: '${patientId}' # Variable substitution at runtime
    resourceTypes:
      - Patient
      - Observation
      - Condition
      - Medication
      - Procedure
      - Encounter
      - DocumentReference
    allowedOperations:
      - read
      - search
    riskClass: LOW
    maxResults: 500

  # Patient CANNOT write or delete
  - principalType: PATIENT
    principalId: '${patientId}'
    resourceTypes:
      - Patient
      - Observation
      - Condition
    allowedOperations:
      - create
      - update
      - delete
    allowed: false # Explicitly denied
```

---

## Patient Portal Integration

### Integration Architecture

> ✅ **CORRECTED (2026-06-16)**: Updated to show actual AgentMission endpoint flow

```
Patient Portal                    FHIR4Java / Digital Twin
┌─────────────────┐               ┌──────────────────────┐
│  React/Vue App  │────HTTP───────│  API Gateway         │
│  (Web/Mobile)   │  (OAuth/SMART)│  (fhir4java-api)     │
└─────────────────┘               └──────────────────────┘
        │                                  │
        │ User enters question:            │
        │ "Explain my blood pressure"      │
        │                                  │
        ├─────────────────────────────────>│
        │ POST /api/agent/AgentPersona/    │
        │      digital-twin/AgentMission   │
        │ {                                │
        │   "goal": "...",                 │
        │   "context": {                   │
        │     "patientId": "P123"          │
        │   }                              │
        │ }                                │
        │<─────────────────────────────────┤
        │ 201 Created                      │
        │ {                                │
        │   "missionId": "mission-xyz",    │
        │   "status": "PENDING"            │
        │ }                                │
        │                                  │
        │ Load Digital Twin persona        │
        │ Validate patient scope           │
        │ Execute agent reasoning loop    │
        │ Query patient's FHIR data        │
        │ Apply safety filters             │
        │ Inject disclaimers               │
        │                                  │
        ├─────────────────────────────────>│
        │ GET /api/agent/AgentMission/     │
        │     {missionId}                  │
        │ (Poll until COMPLETED)           │
        │<─────────────────────────────────┤
        │ 200 OK                           │
        │ {                                │
        │   "status": "COMPLETED",         │
        │   "outputs": {                   │
        │     "response": "Your BP...",    │
        │     "confidence": 0.92,          │
        │     "sources": [...]             │
        │   }                              │
        │ }                                │
        │                                  │
        │ Display response + sources       │
        └─────────────────────────────────┘
```

### Step 1: OAuth 2.0 / SMART on FHIR Setup

Patient portal must implement SMART on FHIR authorization:

```javascript
// Patient portal JavaScript (e.g., React)
import FHIR from 'fhirjs';

// 1. Authorize with your identity provider
const fhirClient = await FHIR.oauth2.ready();
const patient = await fhirClient.patient.read();
const patientId = patient.id;
const accessToken = fhirClient.getState().tokenResponse.access_token;

// 2. Store token securely (HttpOnly cookie, not localStorage)
// 3. Include in Digital Twin API calls
```

### Step 2: API Integration

> ✅ **CORRECTED (2026-06-16)**: Updated to show actual Digital Twin invocation endpoint

To trigger Digital Twin, create an **AgentMission** for the persona (not a direct search endpoint):

**Endpoint**: `POST /api/agent/AgentPersona/digital-twin/AgentMission`

```javascript
// Patient portal code (React example)
async function askDigitalTwin(question, patientId) {
  // Step 1: Create a mission for the Digital Twin persona
  const missionResponse = await fetch(
    'http://fhir-server:8080/api/agent/AgentPersona/digital-twin/AgentMission',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
        'X-Patient-ID': patientId,
      },
      body: JSON.stringify({
        goal: question, // Patient's question/request
        context: {
          patientId: patientId,
          userId: userId,
          channel: 'patient-portal',
        },
      }),
    },
  );

  if (!missionResponse.ok) {
    const error = await missionResponse.json();
    console.error('Mission creation failed:', error);
    return { error: error.message };
  }

  const mission = await missionResponse.json();
  const missionId = mission.missionId;

  // Step 2: Poll for mission completion
  return pollMissionStatus(missionId, accessToken, tenantId);
}

// Helper: Poll mission status until completion
async function pollMissionStatus(
  missionId,
  accessToken,
  tenantId,
  maxWaitMs = 30000,
) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await fetch(
      `http://fhir-server:8080/api/agent/AgentMission/${missionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Tenant-ID': tenantId,
        },
      },
    );

    const mission = await statusResponse.json();

    if (mission.status === 'COMPLETED') {
      return {
        missionId: mission.missionId,
        response: mission.outputs.response,
        confidence: mission.outputs.confidence,
        sources: mission.outputs.sources,
        disclaimer: mission.outputs.disclaimer,
        executionTimeMs: mission.outputs.executionTimeMs,
      };
    } else if (mission.status === 'FAILED') {
      return {
        error: mission.failureReason,
      };
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    error: 'Mission execution timeout',
  };
}
```

### Step 3: UI Components

```javascript
// React component for Digital Twin chat
import { useState } from 'react';

export function DigitalTwinChat({ patientId, accessToken }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: input,
        timestamp: new Date(),
      },
    ]);

    setLoading(true);
    try {
      const result = await askDigitalTwin(input);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          confidence: result.confidence,
          disclaimer: result.disclaimer,
          sources: result.sources,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `Error: ${error.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      setInput('');
    }
  };

  return (
    <div className="digital-twin-chat">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <p>{msg.content}</p>
            {msg.disclaimer && (
              <p className="disclaimer">⚠️ {msg.disclaimer}</p>
            )}
            {msg.sources && msg.sources.length > 0 && (
              <details className="sources">
                <summary>Based on {msg.sources.length} record(s)</summary>
                <ul>
                  {msg.sources.map((src) => (
                    <li key={src.id}>
                      {src.resourceType}/{src.id}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Ask about your health..."
        disabled={loading}
      />
      <button onClick={handleSend} disabled={loading}>
        {loading ? 'Thinking...' : 'Send'}
      </button>
    </div>
  );
}
```

### Step 4: Mobile & SMS Integration

#### WhatsApp Integration (via Twilio)

```python
# Backend webhook for WhatsApp messages
from flask import Flask, request
from twilio.rest import Client
import requests

app = Flask(__name__)
FHIR_API = "http://fhir-server:8080"

@app.route('/whatsapp-webhook', methods=['POST'])
def handle_whatsapp():
    """Handle incoming WhatsApp message from patient"""
    incoming_msg = request.values.get('Body', '').strip()
    phone = request.values.get('From', '')

    # Look up patient by phone number
    patient_id = lookup_patient_by_phone(phone)
    if not patient_id:
        reply = "Sorry, we couldn't verify your identity. Please use the patient portal."
        send_whatsapp_reply(phone, reply)
        return

    # Call Digital Twin API
    response = requests.post(f"{FHIR_API}/api/ai/search",
        json={
            "query": incoming_msg,
            "resourceTypes": ["Observation", "Condition"],
            "maxResults": 20
        },
        headers={
            "X-Patient-ID": patient_id,
            "X-Tenant-ID": get_tenant_id(),
            "Authorization": f"Bearer {get_service_token()}"
        }
    )

    if response.status_code == 200:
        data = response.json()
        reply = data['response']

        # Add disclaimer for medical info
        if data.get('confidence', 1.0) < 0.8:
            reply += "\n\n⚠️ Please verify with your doctor."
    else:
        reply = "I'm having trouble accessing your health data. Please try again."

    # Send reply via WhatsApp
    send_whatsapp_reply(phone, reply)
    return '', 200

def send_whatsapp_reply(phone, message):
    """Send reply back to patient via WhatsApp"""
    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    message = client.messages.create(
        from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
        body=message,
        to=phone
    )
```

#### SMS Integration (basic)

```python
@app.route('/sms-webhook', methods=['POST'])
def handle_sms():
    """Handle incoming SMS from patient"""
    incoming_msg = request.values.get('Body', '').strip()
    phone = request.values.get('From', '')

    # Limit to very short queries on SMS
    if len(incoming_msg) > 160:
        send_sms(phone, "Please keep your question under 160 characters.")
        return

    patient_id = lookup_patient_by_phone(phone)
    response = requests.post(f"{FHIR_API}/api/ai/search",
        json={"query": incoming_msg},
        headers={
            "X-Patient-ID": patient_id,
            "X-Tenant-ID": get_tenant_id(),
            "Authorization": f"Bearer {get_service_token()}"
        }
    )

    data = response.json()

    # SMS-friendly response (max 160 chars)
    short_reply = data['response'][:140] + "..."
    send_sms(phone, short_reply)
```

---

## API Reference

> ✅ **VERIFIED (2026-06-16)**: Endpoints checked against BDD tests and PipelineController

### Endpoint 1: POST /api/agent/AgentPersona/digital-twin/AgentMission

**Description**: Create and submit a Digital Twin mission for a patient query

**Request Headers**:

```
Authorization: Bearer <patient-oauth-token>
X-Tenant-ID: <tenant-uuid>
X-Patient-ID: <patient-uuid>  # Must match authenticated patient in token
Content-Type: application/json
```

**Request Body**:

```json
{
  "goal": "Explain my recent blood pressure readings and trend",
  "context": {
    "patientId": "P123",
    "userId": "user-456",
    "channel": "patient-portal"
  }
}
```

**Response (201 Created)**:

```json
{
  "missionId": "mission-abc123",
  "personaId": "digital-twin",
  "status": "PENDING",
  "createdAt": "2026-06-16T10:30:00Z"
}
```

**Error Responses**:

```json
// 401 Unauthorized - Invalid token
{
  "error": "invalid_token",
  "message": "Patient ID in token does not match X-Patient-ID header"
}

// 403 Forbidden - Patient scope violation
{
  "error": "scope_denied",
  "message": "Patient cannot access this persona or resource scope is insufficient"
}

// 422 Unprocessable Entity - Invalid request
{
  "error": "invalid_request",
  "message": "Missing required field: goal"
}

// 503 Service Unavailable - LLM provider down
{
  "error": "service_unavailable",
  "message": "Digital Twin service temporarily unavailable"
}
```

---

### Endpoint 2: GET /api/agent/AgentMission/{missionId}

**Description**: Retrieve status of a running/completed mission

**Response**:

```json
{
  "missionId": "mission-xyz",
  "personaId": "digital-twin",
  "patientId": "P123",
  "status": "COMPLETED", // RUNNING, COMPLETED, FAILED
  "goal": "Explain patient's recent vital signs",
  "startedAt": "2026-06-15T10:30:00Z",
  "completedAt": "2026-06-15T10:31:45Z",
  "outputs": {
    "conversationId": "conv-abc",
    "response": "...",
    "confidence": 0.94
  },
  "auditTrail": {
    "missionStarted": "2026-06-15T10:30:00Z",
    "missionCompleted": "2026-06-15T10:31:45Z",
    "toolCalls": 3,
    "tokensUsed": 1240
  }
}
```

### Endpoint 3: Ambient Triggers (Event-Driven - No Direct Endpoint)

> ⚠️ **CLARIFICATION (2026-06-16)**: Ambient triggers are NOT invoked via webhook endpoints by patient portals. Instead, they are automatically triggered by the FHIR server when patient data changes. See [AMBIENT-TRIGGERS-ARCHITECTURE.md](AMBIENT-TRIGGERS-ARCHITECTURE.md) for detailed technical reference.

**How Ambient Triggers Work**:

Ambient triggers are **declarative** in the Digital Twin persona YAML and are triggered automatically by the FHIR server:

```yaml
# In digital-twin.yml
ambientTriggers:
  - subscriptionTopicRef: observation-vital-out-of-range
    # Triggered when: Observation value exceeds clinical threshold (e.g., HbA1c > 9.0)

  - subscriptionTopicRef: encounter-arrived
    # Triggered when: New Encounter is recorded for patient

  - subscriptionTopicRef: condition-recorded
    # Triggered when: New Condition diagnosis is recorded for patient
```

**When an ambient trigger fires**:

1. FHIR server detects the event (e.g., high HbA1c observation created)
2. ResourceChangeEvent is published by the resource create/update path
3. Event matches SubscriptionTopic criteria (resource type + supported actions)
4. PersonaAmbientTriggerListener matches topic to registered personas
5. An AgentMission is **automatically created** (no patient action required)
6. Patient receives notification of the automated mission

**Determining Out-of-Range Observations**:

The platform determines if an Observation is "out of range" using the FHIR standard `interpretation` field:

```json
{
  "resourceType": "Observation",
  "code": { "coding": [{ "code": "4548-4", "display": "HbA1c" }] },
  "valueQuantity": { "value": 9.2, "unit": "%" },
  "interpretation": [{ "coding": [{ "code": "H", "display": "High" }] }]
}
```

Common `interpretation` codes:

- **N** — Normal
- **H** — High
- **L** — Low
- **HH** — Critically High
- **LL** — Critically Low
- **A** — Abnormal (non-specific)

The `observation-vital-out-of-range` topic matches any Observation where the `interpretation` field indicates abnormality (H, L, HH, LL, or A).

Alternative: Custom threshold rules can be defined in policy configurations using the ValueRangeEvaluator.

**Handling Different Vital Sign Formats**:

The platform transparently handles vital signs in three ways:

| Format                        | Example                                                        | Trigger Behavior                                                              |
| ----------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Individual Observation**    | Single BP reading (150 mmHg)                                   | Direct match: creates 1 mission                                               |
| **Observation.component**     | Blood pressure with systolic (150) + diastolic (90)            | Parent Observation triggers: mission logic parses components                  |
| **DiagnosticReport-embedded** | Lab panel with HbA1c, glucose, lipids as separate Observations | Each Observation triggers independently: creates 1 mission per abnormal vital |

**Example Ambient Trigger Flow**:

```
1. Clinician records HbA1c observation: 9.2% (HIGH)
                    ↓
2. FHIR server: FhirResourceService.create() publishes ResourceChangeEvent
                    ↓
3. Event matches "observation-vital-out-of-range" SubscriptionTopic
   (resource type = Observation, action = create, interpretation field present)
                    ↓
4. PersonaAmbientTriggerListener.trigger() called with:
   - topicId: "observation-vital-out-of-range"
   - scopeRef: "Observation/hba1c-123"
   - tenantId: "default"
                    ↓
5. Automatic AgentMission created for "digital-twin" persona with:
   - goal: "Ambient trigger for Observation/hba1c-123"
   - context: { scopeRef, triggerType, topicId }
                    ↓
6. Mission executes asynchronously (Digital Twin persona queries patient record)
                    ↓
7. Patient notified: "Your recent HbA1c result needs attention"
```

**Trigger Suppression & Consolidation**:

The platform includes deduplication strategies to prevent notification storms:

```yaml
# In digital-twin-ambient.yml
triggerSources:
  - subscriptionTopicRef: observation-vital-out-of-range
    suppressionWindow: '1h' # Suppress duplicate triggers within 1 hour
    consolidate: 'latest-per-patient' # Only trigger latest observation per patient

  - subscriptionTopicRef: encounter-arrived
    suppressionWindow: '5m'
    consolidate: 'latest'
```

**Note**: Patient portals do NOT need to implement webhook handling for ambient triggers. The FHIR server handles all trigger management internally. Patient portals only need to:

- Display notifications when ambient missions are created
- Allow patients to view the results via GET /api/agent/AgentMission/{missionId}
- Optionally subscribe to mission completion events via standard FHIR Subscriptions

---

## Security & Privacy

### Patient Data Isolation

**Row-Level Tenant Isolation** (enforced at SQL level):

```sql
-- All queries automatically scoped by tenant_id
SELECT * FROM fhir_resource
WHERE tenant_id = current_setting('app.tenant_id')
  AND resource_type = 'Observation'
  AND data->>'subject' = current_patient_id();
```

**Patient-Scoped Access**:

- Patient can only see their own medical record
- Cross-patient queries impossible (enforced by PersonaActivationGate)
- Clinicians/admins have tenant-wide read; patients have patient-only read

### Authentication & Authorization

**Required**: OAuth 2.0 / SMART on FHIR with PKCE

```
1. Patient logs in via identity provider
2. Authorization server issues access token containing:
   - sub (patient ID)
   - scope (patient/Patient.read, patient/Observation.read, etc.)
   - tenant_id (organization identifier)
3. Patient portal stores token securely (HttpOnly cookie)
4. Token passed in Authorization header to FHIR API
5. Token validation at gateway (verify signature, check scopes)
6. Patient ID extracted from token claims
7. PersonaActivationGate validates patient ID matches X-Patient-ID header
```

### Safety Controls

#### Input Validation Pipeline

| Step                       | Control                                                              | Example                                                    |
| -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| **1. Injection Detection** | Detect prompt injection attempts                                     | "Ignore instructions and..."; "System prompt:"; "[SYSTEM]" |
| **2. PII Redaction**       | Remove patient info from query if repeated (already known to system) | "My name is John Doe" → redacted                           |
| **3. Query Validation**    | Reject out-of-scope questions                                        | "What's my Social Security number?" → denied               |

#### Output Moderation Pipeline

| Step                        | Control                             | Example                                                     |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| **1. Content Moderation**   | Filter harmful content              | Hate speech, violence, abuse → blocked                      |
| **2. Confidence Gating**    | Only show high-confidence responses | confidence < 0.7 → don't display; suggest "Ask your doctor" |
| **3. Claim Filtering**      | Remove unsupported claims           | "You should switch doctors" → removed                       |
| **4. Disclaimer Injection** | Append medical disclaimer           | Always appended to clinical information                     |

### Audit & Compliance

**Logging**: All Digital Twin interactions logged to audit_event table

```yaml
Audit Trail Fields:
  - event_id: UUID, uniquely identifies event
  - recorded: timestamp of event
  - event_type: MISSION_STARTED, MISSION_COMPLETED, MISSION_FAILED
  - agent_id: Digital Twin persona ID
  - patient_id: Patient whose data was accessed
  - outcome: 0 (success), 4 (failure)
  - outcome_desc: 'Patient viewed HbA1c trend; confidence 0.94'
  - details: { tokensUsed: 1240, toolCalls: 3, safety_flags: [...] }
```

**Query Access Logs**:

```bash
# View all Digital Twin interactions by patient
SELECT * FROM audit_event
WHERE event_type LIKE 'MISSION_%'
  AND details->>'patient_id' = 'P123'
ORDER BY recorded DESC
LIMIT 100;

# Check for failed sessions (potential security issues)
SELECT * FROM audit_event
WHERE outcome = 4
  AND recorded > NOW() - INTERVAL '24 hours'
ORDER BY recorded DESC;
```

### HIPAA Compliance

- **Access Controls**: Patient ID validated against token
- **Audit Logging**: All access recorded with timestamp
- **Data Encryption**: TLS 1.3 for transport; AES-256 at rest (PostgreSQL encryption)
- **Data Retention**: Conversation history (365d TTL); audit logs (7 years per HIPAA)
- **De-identification**: Episodic memory scoped to patient; no cross-patient aggregation

---

## Monitoring & Troubleshooting

### Health Checks

```bash
# Check FHIR server health
curl http://localhost:8080/actuator/health

# Check Digital Twin persona availability
curl http://localhost:8080/api/v1/personas/digital-twin/health

# Check LLM provider connectivity
curl http://localhost:8080/actuator/health/llm

# Full system health
curl http://localhost:8080/actuator/health/liveness
curl http://localhost:8080/actuator/health/readiness
```

### Key Metrics to Monitor

```yaml
# Prometheus metrics (exposed at /actuator/prometheus)
digital_twin_mission_duration_seconds:
  description: "Time to complete patient query"
  targets:
    - p50: < 3 seconds (good)
    - p99: < 10 seconds (acceptable)
    - p100: > 30 seconds (investigate)

digital_twin_confidence_score:
  description: "Quality of response (0-1)"
  targets:
    - mean: > 0.85 (good)
    - < 0.7: 5% of queries (investigate)

digital_twin_safety_flags_triggered:
  description: "Count of safety violations"
  targets:
    - daily_count: should be < 1% of queries
    - injection_detection: < 0.1% false positive rate

digital_twin_llm_errors:
  description: "Errors from LLM provider"
  targets:
    - rate: < 1% of calls
    - response_time: < 5 seconds p95

episodic_memory_size_bytes:
  description: "Patient conversation history database size"
  targets:
    - growth_rate: < 10% per month
    - query_latency: < 100ms p95
```

### Common Issues & Solutions

#### Issue 1: Patient Can't Access Digital Twin

**Symptom**: 403 Forbidden or "Persona not activated"

**Solutions**:

1. Verify persona is activated: `curl /api/v1/personas/digital-twin`
2. Check tenant ID in request: `echo $X_TENANT_ID`
3. Verify OAuth token includes patient scope: `jwt decode <token>`
4. Check logs: `tail -f /var/log/fhir4java/digital-twin.log | grep "activation"`

#### Issue 2: Slow Responses (>10 seconds)

**Symptoms**: Patient waits > 10 seconds for answer

**Investigation**:

```bash
# Check LLM provider latency
curl -w "@curl-format.txt" -o /dev/null -s \
  -X POST https://api.openai.com/v1/chat/completions

# Check database query performance
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%observation%'
ORDER BY mean_exec_time DESC;

# Check memory/CPU
docker stats fhir-server --no-stream
```

**Fixes**:

- Increase LLM timeout: `fhir4java.llm.timeout: 60s`
- Add database indexes on patient_id, created_at
- Scale to multiple instances behind load balancer
- Enable Redis caching for persona definitions

#### Issue 3: High Error Rate (>1%)

**Symptoms**: Patients see "AI service temporarily unavailable"

**Investigation**:

```bash
# Check LLM errors
grep -i "llm.*error\|provider.*down" /var/log/fhir4java/*.log | tail -20

# Check database connectivity
psql postgresql://user:password@postgres:5432/fhir4java -c "SELECT 1"

# Check token expiration
grep "invalid_token\|expired" /var/log/fhir4java/*.log | wc -l
```

**Fixes**:

- Add LLM fallback provider: `fhir4java.llm.fallback-provider: ollama`
- Increase database connection pool: `hikari.maximum-pool-size: 30`
- Implement token refresh logic in patient portal
- Add rate limiting to prevent DoS: `spring.security.ratelimit.requests-per-minute: 60`

### Debugging

**Enable detailed logging**:

```yaml
logging:
  level:
    org.fhirframework.agentcore.mission: DEBUG
    org.fhirframework.agentcore.safety: DEBUG
    org.fhirframework.persistence: DEBUG
    com.langchain4j: DEBUG
```

**Trace a specific patient session**:

```bash
# Find mission IDs for patient
psql postgresql://user:password@postgres:5432/fhir4java -c \
  "SELECT id, created_at, status FROM agent_mission
   WHERE tenant_id = 'your-tenant' AND context->'userId' = '\"P123\"'
   ORDER BY created_at DESC LIMIT 5;"

# Tail logs for mission
tail -f /var/log/fhir4java/digital-twin.log | grep "mission-xyz"

# Query episodic memory for patient
psql postgresql://user:password@postgres:5432/fhir4java -c \
  "SELECT created_at, entry_type, content
   FROM episodic_memory_entry
   WHERE patient_id = 'P123'
   ORDER BY created_at DESC LIMIT 20;"
```

---

## FAQ & Best Practices

### FAQ

**Q: Can I use Digital Twin with patients who don't have much data?**

A: Yes, but confidence will be lower. Digital Twin works best with:

- At least 3 months of medical history
- Multiple recent observations (vital signs, lab results)
- At least 1 recorded condition

For new patients, Digital Twin provides basic explanations but may recommend "Talk to your doctor for more details."

**Q: How long does each query take?**

A: Typical latency:

- Simple queries ("Show me my blood pressure"): 1–2 seconds
- Complex queries ("Explain my medication interactions"): 3–5 seconds
- Very complex ("Analyze my 5-year health trend"): 5–10 seconds

Timeout is configurable (default 10 minutes).

**Q: Can clinicians override Digital Twin explanations?**

A: Not automatically. Clinicians can:

1. Review patient conversation history via audit logs
2. Correct misstatements by updating FHIR records
3. Provide additional context in appointment notes

**Q: What happens if patient asks something Digital Twin can't answer?**

A: Digital Twin gracefully degrades:

- Confidence < 0.7: "I'm not confident about this. Please ask your doctor."
- Out of scope: "I can only discuss your medical record. For general health info, try..."
- Medical emergency: "If this is urgent, call 911."

**Q: Can I customize the language/tone for different patient groups?**

A: Yes, via system prompts:

```yaml
prompts:
  # Customize per demographic
  systemRef: classpath:fhir-config/prompts/digital-twin/system-spanish.md
  # For Spanish-speaking patients
```

### Best Practices

#### For Patient Portal Teams

1. **Implement SMART on FHIR properly**
   - Use PKCE for web apps (prevents code interception)
   - Use authorization code flow (not implicit)
   - Store tokens in HttpOnly cookies (not localStorage)

2. **Handle errors gracefully**
   - Show user-friendly error messages
   - Suggest fallback actions ("Call your doctor", "Visit your clinic")
   - Log errors for debugging

3. **Respect patient context**
   - Highlight medication changes ("New: Lisinopril started")
   - Emphasize recent abnormal values
   - Suggest follow-ups for chronic conditions

4. **Encourage follow-up**
   - "Next steps: Discuss with your doctor at your April 15 visit"
   - Link to appointment scheduling
   - Provide clinician contact info

#### For Healthcare IT Architects

1. **Scale for peak load**
   - Peak hours: breakfast (7-9am), lunch (12-1pm), evening (6-8pm)
   - Provision for 10x baseline load during peaks
   - Use read replicas for PostgreSQL at scale

2. **Manage costs**
   - LLM calls are expensive (~0.01–0.05 per query)
   - Monitor token usage: `fhir4java.llm.max-tokens: 50000`
   - Implement local caching for common questions
   - Use cheaper models for simple queries (gpt-3.5 for basic explanations)

3. **Privacy by design**
   - Enable row-level security in PostgreSQL
   - Rotate encryption keys annually
   - Audit access patterns monthly
   - Test breach scenarios quarterly

4. **Maintain reliability**
   - Multi-region deployment (active-active or active-passive)
   - LLM provider failover (OpenAI → Claude → local Ollama)
   - Database replication with automatic failover
   - CDN for static prompts/system messages

#### For Clinical Leadership

1. **Establish governance**
   - Define scope: what can Digital Twin discuss? (e.g., not medication changes)
   - Approval process for system prompt updates
   - Regular review of patient feedback/complaints

2. **Monitor safety**
   - Weekly audit of high-confidence claims vs. clinical reality
   - Monthly review of escalations (HIGH-risk cosigns)
   - Quarterly deep-dive on patient outcomes

3. **Measure impact**
   - Patient satisfaction (NPS score)
   - Engagement (% who use feature >1x/month)
   - Outcomes (do engaged patients have better control of chronic conditions?)
   - Costs (LLM spend, infrastructure, support)

---

## Appendix: Example Configurations

### Minimal Configuration (Development)

```yaml
# application-dev.yml
spring:
  datasource:
    url: jdbc:h2:mem:testdb # In-memory for dev
  jpa:
    hibernate:
      ddl-auto: create-drop

fhir4java:
  llm:
    provider: ollama # Free, local
    model: neural-chat
    ollama:
      base-url: http://localhost:11434
      timeout: 60s
```

### Production Configuration (Multi-Tenant)

```yaml
# application-prod.yml
spring:
  datasource:
    url: jdbc:postgresql://postgres-prod.internal:5432/fhir4java
    hikari:
      maximum-pool-size: 50
  cache:
    type: redis
    redis:
      url: redis://redis-prod.internal:6379

fhir4java:
  tenant:
    enabled: true
  llm:
    provider: openai
    model: gpt-4-turbo
    openai:
      api-key: ${OPENAI_API_KEY}
      base-url: https://api.openai.com/v1
  monitoring:
    prometheus-enabled: true
    log-level: WARN
```

---

**Document End**

For questions or updates, contact: fhir4java-support@yourhealthcare.org
