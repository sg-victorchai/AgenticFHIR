# AgentBuilder Portal — Frontend Integration Guide

**Date:** 2026-10-04  
**Scope:** Complete REST API reference for the Agent Builder and Lifecycle Management portal

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Tenant Headers](#2-authentication--tenant-headers)
3. [Activity 1 — Browse Platform Personas](#3-activity-1--browse-platform-personas)
4. [Activity 2 — Browse User-Created Personas](#4-activity-2--browse-user-created-personas)
5. [Activity 3 — Authoring Sessions (Stop & Resume)](#5-activity-3--authoring-sessions-stop--resume)
6. [Activity 4 — Author a New Persona](#6-activity-4--author-a-new-persona)
7. [Activity 5 — Experiment, Evaluate & Promote](#7-activity-5--experiment-evaluate--promote)
8. [Admin Operations](#8-admin-operations)
9. [Data Models](#9-data-models)
10. [Error Handling](#10-error-handling)
11. [Recommended UX Flows](#11-recommended-ux-flows)
12. [Annex: Database Tables](#12-annex-database-tables)

---

## 1. Overview

The AgentBuilder subsystem exposes four groups of REST endpoints:

| Group                   | Base Path                       | Purpose                                                           |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------- |
| Persona Browse          | `/api/agentbuilder/personas`    | List platform personas and user-owned personas                    |
| Authoring Sessions      | `/api/agentbuilder/sessions`    | Create, list, resume, and stop authoring sessions (SSE streaming) |
| Lifecycle & Experiments | `/api/agentbuilder/experiments` | Fork, evaluate, compare, and promote persona versions             |
| Admin                   | `/api/agentbuilder/admin`       | Skill sync, platform persona system-prompt update                 |

**Persona read/search** (for full YAML, version history, etc.) is also available via the standard FHIR API at `/fhir/r5/AgentPersonaDefinition` — see `AGENTCORE-API-REFERENCE.md`.

---

## 2. Authentication & Tenant Headers

### Bearer Token (Required)

All AgentBuilder endpoints require a valid JWT bearer token:

```
Authorization: Bearer <jwt>
```

Requests without a valid token receive `401 Unauthorized`.

### Required Role: `agentbuilder`

The JWT must contain `agentbuilder` in `realm_access.roles` (Keycloak format):

```json
{ "realm_access": { "roles": ["agentbuilder"] } }
```

Authenticated users who lack this role receive `403 Forbidden` on any `/api/agentbuilder/**` endpoint.

### User Identity

The server resolves the caller's identity from the token automatically — **no `userId` field in request bodies or query params**. Resolution order:

1. `preferred_username` claim (Keycloak human-readable username)
2. `sub` claim (fallback — unique subject identifier)

### Tenant Isolation

```
X-Tenant-ID: <tenant-guid>
```

When multi-tenancy is enabled, include this header on every request. Omitting it uses the default tenant.

---

## 3. Activity 1 — Browse Platform Personas

Platform personas are loaded at startup from classpath YAML files (`authoring_source = 'platform'`). They are the reusable building blocks users can adapt from.

### List Platform Personas

```
GET /api/agentbuilder/personas?source=platform
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

**Response — 200 OK:**

```json
[
  {
    "personaId": "care-gap-manager",
    "version": "v1",
    "name": "Care Gap Manager",
    "description": "Identifies patients missing preventive care",
    "personaType": "AGENT",
    "authoringSource": "platform",
    "lifecycleState": "PRODUCTION_APPROVED",
    "ownerUserId": "",
    "updatedAt": "2026-09-01T10:00:00Z"
  }
]
```

**Persona summary fields:**

| Field             | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `personaId`       | Stable unique identifier (kebab-case)                     |
| `version`         | Semver-style version string (e.g. `v1`, `v0.1.0`)         |
| `name`            | Human-readable display name                               |
| `description`     | Short description                                         |
| `scope`           | Mission scope: `patient`, `organization`, or `platform`   |
| `personaType`     | `AGENT` or `DATA_PIPELINE`                                |
| `authoringSource` | `platform` (startup YAML) or `portal` (user-authored)     |
| `lifecycleState`  | Current lifecycle state (see §7.1)                        |
| `ownerUserId`     | Empty for platform personas; JWT-resolved user for portal |
| `updatedAt`       | ISO-8601 timestamp                                        |

> List responses return summary fields only. Use `GET /api/agentbuilder/personas/{personaId}` for the full detail including system prompt, formatters, and skills.

---

### Get Persona Detail

Returns full detail for a persona including the resolved system prompt, tool configuration, formatter coverage, pre/post skills, mission parameters, and role guardrails.

```
GET /api/agentbuilder/personas/{personaId}?version=v0.1.0
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

`version` is optional — omit to get the most recently updated active version.

**Response — 200 OK:**

```json
{
  "personaId": "clinician-digital-twin",
  "version": "v0.1.0",
  "name": "Clinician Digital Twin",
  "description": "A clinician opens an EHR-embedded AI chat...",
  "scope": "patient",
  "personaType": "AGENT",
  "authoringSource": "platform",
  "lifecycleState": "PRODUCTION_APPROVED",
  "ownerUserId": "",
  "createdAt": "2026-10-04T15:08:17Z",
  "updatedAt": "2026-10-04T15:08:17Z",

  "systemPrompt": "You are Clinician Digital Twin, a patient-scoped clinical decision support assistant...",

  "model": {
    "provider": "bedrock",
    "modelId": "smart",
    "fallback": "fast"
  },
  "reasoningStrategy": "COT",
  "confidenceThreshold": 0.75,

  "budget": {
    "maxIterations": 20,
    "maxToolCallsPerIteration": 10,
    "timeoutSeconds": 900
  },
  "memory": {
    "episodicEnabled": true,
    "semanticEnabled": false,
    "maxShortTermTokens": 32768
  },

  "tools": [
    "fhir_discover",
    "fhir_query",
    "fhir_decomposer",
    "fhir_mutate",
    "propose_plan",
    "request_intervention",
    "spawn_agent",
    "mission_complete"
  ],
  "toolConfig": {
    "fhir_query": {
      "allowedResourceTypes": [
        "Patient",
        "Observation",
        "Condition",
        "DiagnosticReport",
        "MedicationRequest",
        "MedicationDispense",
        "CarePlan",
        "FamilyMemberHistory",
        "Appointment",
        "DocumentReference",
        "CareTeam",
        "Immunization",
        "ImmunizationRecommendation",
        "Encounter",
        "Procedure",
        "AllergyIntolerance",
        "ServiceRequest"
      ]
    },
    "fhir_decomposer": {
      "allowedResourceTypes": [
        "Observation",
        "MedicationRequest",
        "Condition",
        "AllergyIntolerance",
        "Procedure",
        "Immunization"
      ]
    },
    "fhir_mutate": {
      "allowedResourceTypes": [
        "Condition",
        "Observation",
        "DiagnosticReport",
        "MedicationRequest",
        "CarePlan",
        "ServiceRequest",
        "Bundle"
      ]
    }
  },

  "formatters": {
    "personaId": "clinician-digital-twin",
    "personaSpecificTypes": [
      "AllergyIntolerance",
      "Condition",
      "Immunization",
      "MedicationRequest",
      "Observation",
      "Procedure"
    ],
    "defaultFallbackTypes": ["Observation"],
    "customizedTypes": [
      "AllergyIntolerance",
      "Condition",
      "Immunization",
      "MedicationRequest",
      "Observation",
      "Procedure"
    ],
    "defaultOnlyTypes": [],
    "note": "Persona-specific formatters override the default for: AllergyIntolerance, Condition, Immunization, MedicationRequest, Observation, Procedure",
    "formatters": [
      {
        "resourceType": "Observation",
        "yamlContent": "resourceType: Observation\nformat: table\n..."
      },
      {
        "resourceType": "Condition",
        "yamlContent": "resourceType: Condition\nformat: table\n..."
      }
    ],
    "defaultFormatters": [
      {
        "resourceType": "Observation",
        "yamlContent": "resourceType: Observation\nformat: table\n..."
      }
    ]
  },

  "skills": {
    "preSkillIds": ["digital-twin-prefetch-patient-context"],
    "postSkillIds": [],
    "resolvedSkills": [
      {
        "id": "digital-twin-prefetch-patient-context",
        "name": "Digital Twin Prefetch Patient Context",
        "description": "Pre-mission context primer that fetches the scoped patient profile.",
        "hook": "pre",
        "stepCount": 1
      }
    ]
  },

  "params": [],

  "intendedUserRole": "CLINICIAN",
  "intendedChannels": ["ehr-widget"],
  "roleGuardrails": {
    "allowDiagnosticClaims": true,
    "allowPrescribing": true,
    "patientFacingLanguage": false,
    "disclaimerRequired": false,
    "requiresClinicalReview": true,
    "riskLevel": "HIGH"
  }
}
```

**Detail field reference:**

| Field               | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `systemPrompt`      | Fully resolved system prompt text (loaded from `system-prompt-ref` at startup)                  |
| `model`             | LLM provider (`bedrock`, `openai`, etc.), model alias, and fallback                             |
| `reasoningStrategy` | `COT` (chain-of-thought) or `DIRECT`                                                            |
| `budget`            | Max iterations, tool calls per iteration, and timeout                                           |
| `memory`            | Episodic/semantic memory toggle and token budget                                                |
| `tools`             | List of tool names enabled for the persona                                                      |
| `toolConfig`        | Per-tool allowed resource types and operations                                                  |
| `formatters`        | Formatter coverage: which resource types use persona-specific vs. default formatters (see §8.2) |
| `skills`            | Pre/post skill hooks with resolved definitions (see §8.3)                                       |
| `params`            | Configurable mission parameters the user fills at launch (see §8.4)                             |
| `roleGuardrails`    | Safety rules scoped to the intended user role                                                   |
| `intendedUserRole`  | The clinical role this persona is designed for                                                  |

#### DATA_PIPELINE personas — different response shape

When `personaType` is `DATA_PIPELINE`, the endpoint returns **pipeline-specific fields** instead of the AGENT fields above (`systemPrompt`, `model`, `tools`, etc. are absent). Use `personaType` to branch rendering.

**Response — 200 OK (DATA_PIPELINE example: `clinical-docs-harmonizer`):**

```json
{
  "personaId": "clinical-docs-harmonizer",
  "version": "v0.1.0",
  "name": "Clinical Document Harmonizer",
  "description": "Parses unstructured clinical documents and harmonizes them into FHIR R5 resources with a mandatory clinician review gate before committing.",
  "scope": "organization",
  "personaType": "DATA_PIPELINE",
  "authoringSource": "platform",
  "lifecycleState": "PRODUCTION_APPROVED",
  "ownerUserId": "",
  "createdAt": "2026-10-05T08:00:00Z",
  "updatedAt": "2026-10-05T08:00:00Z",

  "trigger": {
    "type": "api",
    "triggerEndpoint": "/api/persona/DataPipelinePersona/clinical-docs-harmonizer/$execute"
  },

  "inputSchema": {
    "type": "object",
    "properties": {
      "documentContent": {
        "type": "string",
        "description": "Raw clinical document text or base64-encoded bytes"
      },
      "documentFormat": {
        "type": "string",
        "enum": ["text/plain", "application/pdf", "text/html"],
        "default": "text/plain"
      },
      "patientId": {
        "type": "string",
        "description": "FHIR Patient resource ID the document belongs to"
      },
      "encounterId": {
        "type": "string",
        "description": "Optional FHIR Encounter ID for context"
      }
    },
    "required": ["documentContent", "patientId"]
  },

  "pipelineSteps": [
    {
      "stepId": "bulk-query-patient-context",
      "sequence": 1,
      "type": "FHIR_QUERY",
      "description": "Fetch active conditions, recent observations, and current medications for patient context",
      "outputVar": "patientContext",
      "config": {
        "resourceTypes": ["Condition", "Observation", "MedicationRequest"],
        "searchParams": { "patient": "${patientId}", "status": "active" },
        "maxResults": 50
      },
      "retryPolicy": { "maxAttempts": 3, "backoffMs": 500 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "document-parse-clinical-note",
      "sequence": 2,
      "type": "DOCUMENT_PARSE",
      "description": "Extract structured sections and metadata from the raw clinical note",
      "inputVar": "documentContent",
      "outputVar": "parsedSections",
      "config": {
        "formats": ["text/plain", "application/pdf"],
        "sectionExtraction": true,
        "metadataExtraction": true
      },
      "retryPolicy": { "maxAttempts": 2, "backoffMs": 1000 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "llm-extract-clinical-entities",
      "sequence": 3,
      "type": "LLM_EXTRACT",
      "description": "Use LLM to extract diagnoses, medications, lab results, procedures, and clinical observations",
      "inputVar": "parsedSections",
      "outputVar": "extractedEntities",
      "config": {
        "promptPath": "classpath:/fhir-config/prompts/clinical-docs-harmonizer/llm-analyze.prompt.txt",
        "modelAlias": "smart",
        "responseFormat": "json",
        "maxTokens": 4096,
        "contextVar": "patientContext"
      },
      "retryPolicy": { "maxAttempts": 2, "backoffMs": 2000 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "llm-fhir-mapping",
      "sequence": 4,
      "type": "LLM_FHIR_MAP",
      "description": "Map extracted clinical entities to FHIR R5 resources using binding rules and LLM judgment",
      "inputVar": "extractedEntities",
      "outputVar": "proposedFhirResources",
      "config": {
        "promptPath": "classpath:/fhir-config/prompts/clinical-docs-harmonizer/llm-fhir-map.prompt.txt",
        "modelAlias": "smart",
        "targetResources": [
          "Condition",
          "Observation",
          "MedicationRequest",
          "Procedure",
          "DiagnosticReport"
        ],
        "bindingsPath": "classpath:/fhir-config/personas/clinical-docs-harmonizer/bindings/",
        "fhirVersion": "R5"
      },
      "retryPolicy": { "maxAttempts": 2, "backoffMs": 2000 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "dedup-check",
      "sequence": 5,
      "type": "DEDUP_CHECK",
      "description": "Identify duplicate resources against existing FHIR data for the patient",
      "inputVar": "proposedFhirResources",
      "outputVar": "dedupResult",
      "config": {
        "strategy": "SEMANTIC_SIMILARITY",
        "threshold": 0.92,
        "lookbackDays": 90
      },
      "retryPolicy": { "maxAttempts": 1, "backoffMs": 0 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "review-gate",
      "sequence": 6,
      "type": "HUMAN_REVIEW",
      "description": "Pause for mandatory clinician review. Pipeline resumes only after explicit approval.",
      "inputVar": "dedupResult",
      "outputVar": "reviewDecision",
      "config": {
        "reviewerRole": "data-steward",
        "timeoutHours": 72,
        "autoReject": true
      },
      "retryPolicy": { "maxAttempts": 1, "backoffMs": 0 },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "90d",
        "description": "Retain review records for audit"
      }
    },
    {
      "stepId": "fhir-write-resources",
      "sequence": 7,
      "type": "FHIR_WRITE",
      "description": "Commit approved FHIR resources and attach AI-generation provenance extensions",
      "inputVar": "reviewDecision",
      "outputVar": "writeResult",
      "config": {
        "transactionBundle": true,
        "provenanceExtension": "http://fhirframework.org/fhir/StructureDefinition/ai-generation-provenance",
        "writeOnlyApproved": true
      },
      "retryPolicy": { "maxAttempts": 3, "backoffMs": 1000 },
      "persistence": { "mode": "FULL", "retentionPolicy": "30d" }
    },
    {
      "stepId": "aggregate-import-summary",
      "sequence": 8,
      "type": "AGGREGATE",
      "description": "Produce a structured import summary with counts by resource type and dedup disposition",
      "inputVar": "writeResult",
      "outputVar": "importSummary",
      "config": {
        "summaryFields": ["resourceType", "count", "status", "dedupDisposition"]
      },
      "retryPolicy": { "maxAttempts": 1, "backoffMs": 0 },
      "persistence": { "mode": "SUMMARY", "retentionPolicy": "30d" }
    }
  ],

  "bindings": [
    {
      "resourceType": "Condition",
      "yamlContent": "resourceType: Condition\nbindings:\n  clinicalStatus:\n    active: active\n    Active: active\n    ACTIVE: active\n    resolved: resolved\ntransforms:\n  - condition: \"clinicalStatus.empty()\"\n    script: \"clinicalStatus = {\\\"coding\\\": [{\\\"system\\\": \\\"http://terminology.hl7.org/CodeSystem/condition-clinical\\\", \\\"code\\\": \\\"active\\\"}]}\"\n    description: \"Default clinical status to active if not specified\"\n"
    },
    {
      "resourceType": "Observation",
      "yamlContent": "resourceType: Observation\nbindings:\n  status:\n    FINAL: final\n    final: final\n    PRELIMINARY: preliminary\n    pending: registered\ntransforms:\n  - condition: \"status.empty()\"\n    script: \"status = 'final'\"\n    description: \"Default to final for clinical observations\"\n  - condition: \"category.empty()\"\n    script: \"category = [{\\\"coding\\\": [{\\\"system\\\": \\\"http://terminology.hl7.org/CodeSystem/observation-category\\\", \\\"code\\\": \\\"laboratory\\\"}]}]\"\n    description: \"Auto-populate laboratory category if missing\"\n"
    }
  ],

  "policies": {
    "review": {
      "required": true,
      "reviewerRole": "data-steward",
      "timeoutHours": 72,
      "autoRejectOnTimeout": true
    },
    "dedup": {
      "strategy": "SEMANTIC_SIMILARITY",
      "threshold": 0.92,
      "lookbackDays": 90
    },
    "authorization": {
      "executeRoles": ["admin", "data-steward"],
      "approveRoles": ["data-steward"],
      "rejectRoles": ["data-steward", "clinician"]
    }
  },

  "completionCriteria": {
    "strategy": "ALL_STEPS_COMPLETE",
    "requiredOutputVar": "importSummary"
  },

  "budget": {
    "maxStepDurationSeconds": 300,
    "maxTotalDurationSeconds": 3600,
    "maxLlmCallsPerStep": 3,
    "maxRetryAttempts": 3
  },

  "safety": {
    "phiHandling": "DEIDENTIFY_ON_LOG",
    "requiresHumanApproval": true,
    "auditLevel": "FULL"
  }
}
```

**DATA_PIPELINE detail field reference:**

| Field                | Type   | Description                                                                             |
| -------------------- | ------ | --------------------------------------------------------------------------------------- |
| `trigger`            | object | How the pipeline is invoked: `type` (`api`, `scheduled`, `event`) and `triggerEndpoint` |
| `inputSchema`        | object | JSON Schema of the `$execute` request body (use to build the launch form)               |
| `pipelineSteps`      | array  | Ordered pipeline steps (see step fields below)                                          |
| `bindings`           | array  | SpEL transformation rules per FHIR resource type (see binding fields below)             |
| `policies`           | object | `review`, `dedup`, and `authorization` policy blocks                                    |
| `completionCriteria` | object | Strategy (`ALL_STEPS_COMPLETE`, `REQUIRED_OUTPUT_PRESENT`) and required output var      |
| `budget`             | object | Per-step and total duration limits, LLM call caps, retry limits                         |
| `safety`             | object | PHI handling mode, human approval requirement, audit level                              |

**Step fields (`pipelineSteps[n]`):**

| Field         | Type   | Description                                                                                                             |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `stepId`      | string | Unique step identifier                                                                                                  |
| `sequence`    | number | Execution order (1-based)                                                                                               |
| `type`        | string | `FHIR_QUERY`, `DOCUMENT_PARSE`, `LLM_EXTRACT`, `LLM_FHIR_MAP`, `DEDUP_CHECK`, `HUMAN_REVIEW`, `FHIR_WRITE`, `AGGREGATE` |
| `description` | string | Human-readable step description                                                                                         |
| `inputVar`    | string | Variable name carrying this step's input (from a prior step's `outputVar`)                                              |
| `outputVar`   | string | Variable name where this step stores its output                                                                         |
| `config`      | object | Step-type-specific configuration including `promptPath` and `modelAlias` for LLM steps                                  |
| `retryPolicy` | object | `maxAttempts` and `backoffMs`                                                                                           |
| `persistence` | object | `mode` (`FULL`, `SUMMARY`, `NONE`), `retentionPolicy`, optional `description`                                           |

**Binding fields (`bindings[n]`):**

| Field          | Type   | Description                                                                              |
| -------------- | ------ | ---------------------------------------------------------------------------------------- |
| `resourceType` | string | FHIR resource type this binding applies to                                               |
| `yamlContent`  | string | Raw YAML with `bindings` (value mappings) and `transforms` (SpEL condition+script pairs) |

**Rendering tips:**

- Use `sequence` to render a numbered pipeline diagram or step list; show `type` as a badge.
- For `HUMAN_REVIEW` steps, highlight the review endpoint (`POST .../clinical-docs-harmonizer/$review`) and the timeout.
- Parse `yamlContent` client-side (or display as a collapsible code block) to show field mappings and transform rules.
- The `$execute` launch form should be driven by `inputSchema` — render required fields with asterisks.
- Show `policies.review.reviewerRole` and `policies.authorization.executeRoles` to communicate who can do what.

---

## 4. Activity 2 — Browse User-Created Personas

### List All Portal-Authored Personas (for Tenant)

```
GET /api/agentbuilder/personas?source=portal
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

Returns all portal-authored personas for the tenant, regardless of owner. Useful for tenant admins to see the full inventory.

### List My Personas

```
GET /api/agentbuilder/personas/mine
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

Returns only personas where `ownerUserId` matches the bearer token's identity. This is the primary view for the "My Personas" screen.

**Response** — same structure as §3 persona summary list.

### List All Personas (Combined View)

```
GET /api/agentbuilder/personas?source=all
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

Returns all active personas for the tenant (platform + portal combined). Useful for the "New persona from existing" picker.

---

## 5. Activity 3 — Authoring Sessions (Stop & Resume)

An authoring session encapsulates a multi-turn AI conversation used to author a persona. Sessions are persistent — users can close the browser and resume later.

### List My In-Progress Sessions

```
GET /api/agentbuilder/sessions
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

**Response — 200 OK:**

```json
[
  {
    "session_id": "a1b2c3d4-...",
    "tenant_id": "my-tenant",
    "owner_user_id": "alice",
    "authoring_mode": "FROM_SCRATCH",
    "source_persona_id": null,
    "persona_type": "AGENT",
    "persona_name": "My New Agent",
    "status": "IN_PROGRESS",
    "current_phase": 2,
    "created_at": "2026-10-01T09:00:00Z",
    "updated_at": "2026-10-01T14:30:00Z"
  }
]
```

Shows all non-ABANDONED sessions owned by the calling user, ordered by last updated. Use this for the "Resume Work" screen.

**Session `status` values:**

| Value             | Meaning                                      |
| ----------------- | -------------------------------------------- |
| `IN_PROGRESS`     | Active authoring; can resume                 |
| `AWAITING_REVIEW` | Submitted for review; can view but not edit  |
| `COMPLETE`        | Persona successfully authored and saved      |
| `ABANDONED`       | Stopped by the user; excluded from this list |

### Get Session Detail (for Resume)

```
GET /api/agentbuilder/sessions/{sessionId}
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

**Response — 200 OK:** Session metadata object (no conversation history blob).

**Response — 403 Forbidden:** If the calling user is not the session owner.

**Response — 404 Not Found:** If sessionId does not exist.

### Abandon a Session

```
POST /api/agentbuilder/sessions/{sessionId}/$abandon
Authorization: Bearer <jwt>
X-User-Id: <user-id>
```

No request body required.

**Response — 204 No Content:** Session marked `ABANDONED`.

**Response — 403 Forbidden:** Caller is not the session owner.

**Response — 404 Not Found:** Session does not exist.

### Resume a Session

Call `$resume` first to reload conversation history and re-activate the session, then send messages as normal.

**Step 1 — Resume the session:**

```
POST /api/agentbuilder/sessions/{sessionId}/$resume
Authorization: Bearer <jwt>
X-User-Id: <user-id>
```

**Response — 200 OK:**

```json
{
  "session_id": "a1b2c3d4-...",
  "status": "IN_PROGRESS",
  "current_phase": 2,
  "persona_name": "My New Agent",
  "conversation_turn_count": 12
}
```

**Response — 403 Forbidden:** Caller is not the session owner.

**Response — 404 Not Found:** Session does not exist.

**Step 2 — Continue sending messages:**

```
POST /api/agentbuilder/sessions/{sessionId}/messages
Authorization: Bearer <jwt>
Content-Type: application/json

{ "message": "Let's continue from where we left off" }
```

The agent picks up exactly where the session left off. See §6.2 for the full SSE streaming protocol.

---

## 6. Activity 4 — Author a New Persona

### 6.1 Create an Authoring Session

**From scratch:**

```
POST /api/agentbuilder/sessions
Authorization: Bearer <jwt>
Content-Type: application/json
X-Tenant-ID: <tenant-guid>

{
  "personaType": "AGENT",
  "authoringMode": "FROM_SCRATCH"
}
```

**Adapting an existing persona:**

```
POST /api/agentbuilder/sessions
Authorization: Bearer <jwt>
Content-Type: application/json
X-Tenant-ID: <tenant-guid>

{
  "personaType": "AGENT",
  "authoringMode": "ADAPT_FROM",
  "sourcePersonaId": "care-gap-manager",
  "sourcePersonaVersion": "v1"
}
```

In `ADAPT_FROM` mode, the AI agent automatically loads the source persona's YAML as a starting point and asks the user to describe only what they want to change (Phase 0 adapt mode).

**Request fields:**

| Field                  | Type   | Required    | Values                                   |
| ---------------------- | ------ | ----------- | ---------------------------------------- |
| `personaType`          | string | No          | `AGENT` (default), `DATA_PIPELINE`       |
| `authoringMode`        | string | No          | `FROM_SCRATCH` (default), `ADAPT_FROM`   |
| `sourcePersonaId`      | string | Conditional | Required when `authoringMode=ADAPT_FROM` |
| `sourcePersonaVersion` | string | Conditional | Required when `authoringMode=ADAPT_FROM` |

**Response — 200 OK:**

```json
{ "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

Store `sessionId` — it is needed for all subsequent calls in this session.

---

### 6.2 Send Message (SSE Stream)

```
POST /api/agentbuilder/sessions/{sessionId}/messages
Authorization: Bearer <jwt>
Content-Type: application/json

{ "message": "I want to create an agent that identifies diabetic patients missing HbA1c tests" }
```

**Response — 200 OK, Content-Type: `text/event-stream`**

The response is a Server-Sent Events stream:

| Event type | Data                 | Meaning                                        |
| ---------- | -------------------- | ---------------------------------------------- |
| `token`    | Partial text string  | Incremental response token — append to display |
| `done`     | (empty)              | End of AI turn — ready for next user message   |
| `error`    | Error message string | Processing error                               |

**Example stream:**

```
event: token
data: I'll help you author a care-gap identification agent.

event: token
data: First, let me understand your patient population.

event: done
data:
```

**Frontend implementation:**

- Use Fetch API with `ReadableStream` (not `EventSource` — POST is required)
- Buffer `token` events and render incrementally
- On `done`, enable input for the next turn
- On `error`, display the message and allow retry
- Session supports up to **200 turns** maximum

**TypeScript example:**

```typescript
const response = await fetch(
  `/api/agentbuilder/sessions/${sessionId}/messages`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify({ message: userText }),
  },
);

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.startsWith('data: ')) appendToDisplay(line.slice(6));
  }
}
```

---

## 7. Activity 5 — Experiment, Evaluate & Promote

### 7.1 Persona Lifecycle State Machine

```
DRAFT ──► REVIEW ──► PRODUCTION_APPROVED
  │          │               │
  └──────────┴───────────────┴──► (retired: active=false)
```

| State                 | Meaning                                        | Allowed transitions                   |
| --------------------- | ---------------------------------------------- | ------------------------------------- |
| `DRAFT`               | Editable, not yet reviewed                     | Promote → REVIEW, Retire              |
| `REVIEW`              | Submitted for quality review                   | Approve → PRODUCTION_APPROVED, Retire |
| `PRODUCTION_APPROVED` | Live in production, loaded into agent registry | Retire                                |
| _(retired)_           | `active=false`, excluded from browse results   | None                                  |

Only `PRODUCTION_APPROVED` + `active=true` versions are loaded into the live agent registry and can serve real missions.

---

### 7.2 Fork an Experimental Version

Creates a new `DRAFT` version based on an existing version with optional YAML overrides.

```
POST /api/agentbuilder/experiments/fork
  ?personaId=care-gap-manager
  &baseVersion=v1
  &tenantId=my-tenant
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "patchYaml": "metadata:\n  description: Updated intervention thresholds\n"
}
```

**Response — 200 OK:**

```json
{ "newVersion": "v1-exp-1728032401234" }
```

The forked version has:

- `lifecycleState`: `DRAFT`
- `active`: `false`
- `authoringSource`: `portal`
- `ownerUserId`: resolved from bearer token

---

### 7.3 Author an Evaluation Scenario

Before running an evaluation you must create a scenario that specifies the test data cohort and the mission input (parameters or conversation). Seeding happens in a separate step so the portal can show progress before the long-running eval begins.

```
POST /api/agentbuilder/scenarios
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
Content-Type: application/json

{
  "personaId": "diabetic-care-assessment",
  "scenarioName": "Diabetic Care Gap — HbA1c Screening",
  "scenarioType": "AGENT",

  "seedSpec": {
    "description": "20 diabetic patients: 10 with recent HbA1c, 10 without; 2 of the 10 exceed 8%",
    "cohortGroups": [
      {
        "label": "diabetic, controlled HbA1c (le 8%)",
        "count": 8,
        "conditionCodes": ["73211009"],
        "observationConstraints": [
          { "loincCode": "4548-4", "daysBack": 180, "comparator": "le", "value": 8.0 }
        ]
      },
      {
        "label": "diabetic, poor HbA1c control (gt 8%)",
        "count": 2,
        "conditionCodes": ["73211009"],
        "observationConstraints": [
          { "loincCode": "4548-4", "daysBack": 180, "comparator": "gt", "value": 8.0 }
        ]
      },
      {
        "label": "diabetic, no recent HbA1c",
        "count": 10,
        "conditionCodes": ["73211009"],
        "noObservations": true
      }
    ],
    "expectedCohortSize": 20
  },

  "missionParams": {
    "patientCohortFilter": "missing-hba1c-6mo",
    "maxResults": 50
  },

  "generateRubric": true
}
```

**Note on mission input:** The field to use depends on the persona type:

- **Parameter-driven personas** (e.g. `diabetic-care-assessment`): use `missionParams` with typed key-value pairs matching the persona's exposed parameters. Free-text questions are not allowed.
- **Chat personas** (e.g. `clinician-digital-twin`): use `conversationScript` with a list of `{role, content}` turns. Supports both single-turn and multi-turn conversations.

**Response — 201 Created:**

```json
{
  "scenarioId": "b3c4d5e6-...",
  "scenarioName": "Diabetic Care Gap — HbA1c Screening",
  "scenarioType": "AGENT",
  "createdAt": "2026-10-04T10:00:00Z"
}
```

> **UX guidance:** Present this as a 3-step wizard: (1) Name and type, (2) Mission input (params or conversation), (3) Test data cohort definition. Describe the cohort in plain English and map it to `CohortGroup` entries. Store the returned `scenarioId` — it is required for the seeding step (§7.4).

**Field descriptions:**

| Field                | Required            | Description                                                                               |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `personaId`          | Yes                 | Persona this scenario tests                                                               |
| `scenarioName`       | Yes                 | Human-readable name                                                                       |
| `scenarioType`       | Yes                 | `AGENT`, `DATA_PIPELINE`, or `DATA_PIPELINE_ETL`                                          |
| `seedSpec`           | Recommended         | Cohort descriptor for auto-generated FHIR test data; seeded in Step 1 before eval submit  |
| `missionParams`      | Conditional         | Typed params for parameter-driven personas (mutually exclusive with `conversationScript`) |
| `conversationScript` | Conditional         | Free-text turns for chat personas (mutually exclusive with `missionParams`)               |
| `generateRubric`     | No (default `true`) | Auto-generate `responseCriteria` from persona definition                                  |

**List scenarios for a persona:**

```
GET /api/agentbuilder/scenarios?personaId=diabetic-care-assessment
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

---

### 7.4 Seed Eval Tenant (Step 1 of 2)

Before submitting the eval run, seed FHIR test data into an isolated eval tenant.

**This is a background job.** The request returns immediately with a `seedJobId`; the actual resource generation happens in a server-side thread pool. Users can close the browser and query status later.

```
POST /api/agentbuilder/experiments/eval/$seed
  ?scenarioId=b3c4d5e6-...
Authorization: Bearer <jwt>
X-Tenant-ID: <owner-tenant-guid>
```

**Response — 202 Accepted:**

```json
{ "seedJobId": "c4d5e6f7-...", "evalTenantId": "eval-a1b2c3d4-..." }
```

**Response — 400 Bad Request** (if cohort exceeds the patient limit):

```json
{ "error": "Seed spec requests 1500 patients but the limit is 1000. ..." }
```

**Query status (at any time):**

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}
Authorization: Bearer <jwt>
```

```json
{
  "seedJobId": "c4d5e6f7-...",
  "evalTenantId": "eval-a1b2c3d4-...",
  "seedStatus": "COMPLETED",
  "seededCounts": { "patients": 20, "conditions": 20, "observations": 10 },
  "errorMessage": null
}
```

Possible `seedStatus` values: `PENDING` → `SEEDING` → `COMPLETED` | `FAILED` | `TORN_DOWN`.

**Hard limit:** Total patients across all cohort groups is capped at **1000** by default (configurable via `fhir4java.eval.seed.max-patients` in `application.yml`). The limit is enforced synchronously before the job is created — a request over the limit gets a 400 immediately.

> **UX guidance:** Store `seedJobId` in local state after `$seed`. When the user returns to the Evaluation tab, call `GET /eval/seed/{seedJobId}` to restore status. Show a progress indicator while `PENDING` or `SEEDING`; display `seededCounts` as a summary once `COMPLETED`. Only enable the "Submit Eval Run" button after `COMPLETED`.

---

### 7.5 Submit Evaluation Run (Step 2 of 2, Async)

After seeding is `COMPLETED`, submit the eval run with the `evalTenantId` returned in step 1.

```
POST /api/agentbuilder/experiments/eval/$submit
  ?personaId=diabetic-care-assessment
  &version=v1-exp-1728032401234
  &scenarioId=b3c4d5e6-...
  &tenantId=my-tenant
  &evalTenantId=eval-a1b2c3d4-...
Authorization: Bearer <jwt>
```

**Response — 202 Accepted:**

```json
{ "runId": "f47ac10b-58cc-4372-a567-0e02b2c3d479" }
```

**Parameters:**

| Parameter      | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `personaId`    | Persona to evaluate                                                         |
| `version`      | Version to evaluate                                                         |
| `tenantId`     | Production tenant owning the persona                                        |
| `evalTenantId` | Isolated sandbox tenant for this run (unique per run — e.g. `eval-<runId>`) |

---

### 7.5 Poll Evaluation Run Status

```
GET /api/agentbuilder/experiments/eval/{runId}
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "runId": "f47ac10b-...",
  "personaId": "care-gap-manager",
  "personaVersion": "v1-exp-1728032401234",
  "runStatus": "COMPLETED",
  "qualityScore": 87.5,
  "qualityDimensions": "{\"dataAccuracy\":0.90,\"queryCorrectness\":0.85,\"responseQuality\":0.80}",
  "simulatedQuestion": "Which diabetic patients are missing HbA1c tests in the last 6 months?",
  "personaResponse": "I found 3 patients missing HbA1c screening: ...",
  "replayTrace": "{ \"steps\": [...] }",
  "startedAt": "2026-10-04T10:00:00Z",
  "completedAt": "2026-10-04T10:00:45Z",
  "errorMessage": null
}
```

| `runStatus` | Meaning                           |
| ----------- | --------------------------------- |
| `PENDING`   | Job queued, not yet started       |
| `RUNNING`   | Evaluation in progress            |
| `COMPLETED` | Quality score and trace available |
| `FAILED`    | See `errorMessage`                |

> **Polling strategy:** Poll every 5 s while `runStatus = PENDING | RUNNING`. Stop on `COMPLETED` or `FAILED`.

---

### 7.6 Tear Down Eval Tenant (Step 3 — Optional)

Once evaluation is complete and the results have been reviewed, tear down the sandbox to reclaim storage. All FHIR resources seeded into the eval tenant are deleted, and the seed job status transitions to `TORN_DOWN`.

```
POST /api/agentbuilder/experiments/eval/$teardown
  ?evalTenantId=eval-a1b2c3d4-...
Authorization: Bearer <jwt>
```

**Response — 204 No Content**

> **When to call this:** After the eval run reaches `COMPLETED` or `FAILED` and the user has reviewed results. If you want to re-run the same scenario, call `$seed` again first — it creates a fresh `evalTenantId`.

| `seedStatus` after teardown | Meaning                                |
| --------------------------- | -------------------------------------- |
| `TORN_DOWN`                 | All resources removed; tenant is empty |

---

### 7.7 List Evaluation Runs for a Persona

```
GET /api/agentbuilder/experiments/eval?personaId=care-gap-manager&tenantId=my-tenant
Authorization: Bearer <jwt>
```

Filter to a specific version:

```
GET /api/agentbuilder/experiments/eval?personaId=care-gap-manager&tenantId=my-tenant&version=v1-exp-1728032401234
```

**Response — 200 OK:** Array of run objects (same schema as §7.4).

---

### 7.7 Compare Versions

Returns which version has the highest quality score across completed evaluation runs.

```
GET /api/agentbuilder/experiments/compare?personaId=care-gap-manager&tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{ "betterVersion": "v1-exp-1728032401234" }
```

Returns `{ "betterVersion": "none" }` if no completed runs exist.

---

### 7.8 Promote (DRAFT → REVIEW)

```
POST /api/agentbuilder/experiments/promote
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

**Error:** `400 Bad Request` if not in `DRAFT` state.

---

### 7.9 Approve (REVIEW → PRODUCTION_APPROVED)

```
POST /api/agentbuilder/experiments/approve
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

Records `qualityApprovedBy` (from JWT `preferred_username`) and `qualityApprovedAt` on the persona. The approved version is immediately registered into the live agent registry.

**Error:** `400 Bad Request` if not in `REVIEW` state.

---

### 7.10 Retire (Any State → Inactive)

```
POST /api/agentbuilder/experiments/retire
  ?personaId=care-gap-manager
  &version=v1
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

Sets `active=false`. The version is soft-deleted and excluded from browse results.

---

## 8. Reference Endpoints — Formatters and Skills

These endpoints expose the server-side configuration assets (formatters and skills) so the portal can display them to users and allow customisation during persona authoring.

---

### 8.1 List All Formatter Definitions

Returns every formatter YAML grouped by persona: the `default` group (applied when no persona-specific override exists) and per-persona groups (overrides).

```
GET /api/agentbuilder/formatters
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "default": {
    "personaId": "default",
    "description": "Baseline formatters applied when no persona-specific override exists.",
    "resourceTypes": ["Observation"],
    "formatters": [
      {
        "resourceType": "Observation",
        "yamlContent": "resourceType: Observation\nformat: table\nheader: \"OBSERVATIONS -- {count} results\"\n..."
      }
    ]
  },
  "personaSpecific": [
    {
      "personaId": "clinician-digital-twin",
      "description": "Persona-specific formatters that override the default for resource types listed.",
      "resourceTypes": ["AllergyIntolerance", "Condition", "Immunization", "MedicationRequest", "Observation", "Procedure"],
      "formatters": [
        { "resourceType": "AllergyIntolerance", "yamlContent": "..." },
        { "resourceType": "Condition",           "yamlContent": "..." },
        { "resourceType": "Observation",         "yamlContent": "..." }
      ]
    },
    {
      "personaId": "digital-twin",
      "description": "Persona-specific formatters that override the default for resource types listed.",
      "resourceTypes": ["AllergyIntolerance", "Condition", "MedicationRequest", "Observation"],
      "formatters": [...]
    }
  ]
}
```

> **UX guidance:** Use the `default` group as the starting template in the "Customise Formatter" editor. Show the persona-specific formatters side-by-side with the default so users can see which columns were added, removed, or reordered.

---

### 8.2 Get Formatter Coverage for a Persona

Returns formatter coverage for a specific persona with full YAML content. Use `personaId = default` to browse the baseline formatters.

```
GET /api/agentbuilder/formatters/{personaId}
Authorization: Bearer <jwt>
```

**Response — 200 OK (for `clinician-digital-twin`):**

```json
{
  "personaId": "clinician-digital-twin",
  "personaSpecificTypes": [
    "AllergyIntolerance",
    "Condition",
    "Immunization",
    "MedicationRequest",
    "Observation",
    "Procedure"
  ],
  "defaultFallbackTypes": ["Observation"],
  "customizedTypes": [
    "AllergyIntolerance",
    "Condition",
    "Immunization",
    "MedicationRequest",
    "Observation",
    "Procedure"
  ],
  "defaultOnlyTypes": [],
  "note": "Persona-specific formatters override the default for: AllergyIntolerance, Condition, ...",
  "formatters": [
    {
      "resourceType": "Observation",
      "yamlContent": "resourceType: Observation\nformat: table\n..."
    },
    {
      "resourceType": "Condition",
      "yamlContent": "resourceType: Condition\nformat: table\n..."
    }
  ],
  "defaultFormatters": [
    {
      "resourceType": "Observation",
      "yamlContent": "resourceType: Observation\nformat: table\n..."
    }
  ]
}
```

**Field descriptions:**

| Field                      | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `personaSpecificTypes`     | Resource types with a persona-specific formatter YAML                           |
| `defaultFallbackTypes`     | Resource types covered by the default formatter                                 |
| `customizedTypes`          | Types where the persona overrides the default                                   |
| `defaultOnlyTypes`         | Types with a default formatter that the persona does not override               |
| `formatters[].yamlContent` | Full YAML definition — columns, SpEL expressions, filters                       |
| `defaultFormatters`        | Default formatter definitions for comparison (omitted when `personaId=default`) |

---

### 8.3 Get a Single Formatter Definition

Returns the raw YAML for one resource type under a given persona.

```
GET /api/agentbuilder/formatters/{personaId}/{resourceType}
Authorization: Bearer <jwt>
```

Example: `GET /api/agentbuilder/formatters/clinician-digital-twin/Observation`

**Response — 200 OK:**

```json
{
  "personaId": "clinician-digital-twin",
  "resourceType": "Observation",
  "yamlContent": "resourceType: Observation\nformat: table\nheader: \"OBSERVATIONS -- {count} results (newest first)\"\n\nstatusFilter:\n  fhirPath: \"status\"\n  include: [final, amended, corrected]\n\ncolumns:\n  - header: Date\n    ..."
}
```

**Response — 404 Not Found:** No formatter YAML exists for that persona + resource type combination.

> **UX guidance:** Use this endpoint to populate the inline YAML editor when a user clicks "Edit Formatter" on a resource type card. Allow saving the edited YAML back to `workflow.platform_persona_artifact` for portal-authored personas.

---

### 8.4 List Available Skills

Returns all skills registered in the skill library. Used by the "Add Skills" picker in the persona authoring wizard.

```
GET /api/agentbuilder/skills
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
[
  {
    "id": "digital-twin-prefetch-patient-context",
    "name": "Digital Twin Prefetch Patient Context",
    "description": "Pre-mission context primer that fetches the scoped patient profile.",
    "successRate": 0.0,
    "executionCount": 0,
    "stepCount": 1,
    "steps": [{ "id": "fetch-patient-profile", "tool": "fhir_query" }]
  },
  {
    "id": "diabetic-care-gap-analysis",
    "name": "Diabetic Care Gap Analysis",
    "description": "Identifies diabetic patients with care gaps (missing HbA1c or foot exam)",
    "successRate": 0.0,
    "executionCount": 0,
    "stepCount": 2,
    "steps": [
      { "id": "find-diabetic-patients", "tool": "fhir_query" },
      { "id": "check-hba1c-recency", "tool": "fhir_query" }
    ]
  }
]
```

**Field descriptions:**

| Field            | Description                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| `id`             | Stable skill identifier — use this in `metadata.preSkillIds` / `metadata.postSkillIds` |
| `name`           | Human-readable display name                                                            |
| `description`    | What the skill does and when it runs                                                   |
| `successRate`    | Historical success rate (0.0–1.0) from provenance tracking                             |
| `executionCount` | Number of times the skill has executed                                                 |
| `stepCount`      | Number of procedure steps                                                              |
| `steps`          | List of `{id, tool}` — shows which FHIR tools each step calls                          |

> **UX guidance:** Show skills in two groups in the authoring wizard: **Pre-skills** (run before the first user message, e.g. to prefetch patient context) and **Post-skills** (run after mission completion). Render `successRate` as a percentage badge. Skills with `executionCount = 0` are new and untested — show a "New" label.

---

## 9. Admin Operations

### Sync Skills

Rescans the configured plugin directory and upserts new SKILL.md versions into `workflow.persona_plugin_skill`. Required after updating skill files.

```
POST /api/agentbuilder/admin/plugins/sync
Authorization: Bearer <jwt>
X-Requested-By: admin-user
```

**Response — 200 OK:**

```json
{ "status": "ok", "skillsUpdated": 3 }
```

Other responses:

```json
{ "status": "error", "message": "Skill directory not found: /skills" }
{ "status": "skipped", "reason": "No skill directory configured" }
```

---

## 9. Data Models

### 9.1 Persona Summary (Browse response)

```typescript
interface PersonaSummary {
  personaId: string; // e.g. "care-gap-manager"
  version: string; // e.g. "v1", "v1-exp-1728032401234"
  name: string;
  description: string;
  personaType: 'AGENT' | 'DATA_PIPELINE';
  authoringSource: 'platform' | 'portal' | 'cli';
  lifecycleState: 'DRAFT' | 'REVIEW' | 'PRODUCTION_APPROVED';
  ownerUserId: string; // empty for platform personas
  updatedAt: string; // ISO-8601
}
```

### 9.2 Authoring Session

```typescript
interface AuthoringSession {
  session_id: string; // UUID
  tenant_id: string;
  owner_user_id: string;
  authoring_mode: 'FROM_SCRATCH' | 'ADAPT_FROM';
  source_persona_id?: string;
  source_persona_version?: string;
  persona_type: 'AGENT' | 'DATA_PIPELINE';
  persona_name?: string; // set once Phase 0 collects it
  status: 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'COMPLETE' | 'ABANDONED';
  current_phase: number; // 0–6
  created_at: string;
  updated_at: string;
}
```

### 9.3 Evaluation Run

```typescript
interface EvalRun {
  runId: string; // UUID
  personaId: string;
  personaVersion: string;
  tenantId: string;
  evalTenantId: string;
  runStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  qualityScore?: number; // 0–100, BigDecimal
  qualityDimensions?: string; // JSON: {"dataAccuracy":0.9,"queryCorrectness":0.85,"responseQuality":0.8}
  simulatedQuestion?: string;
  personaResponse?: string;
  replayTrace?: string; // JSON: { steps: [...], queriesIssued: [...], writesIssued: [...] }
  humanRating?: number; // 1–5
  humanNotes?: string;
  evaluatedBy?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}
```

### 9.4 Replay Trace Structure

```typescript
interface ReplayTrace {
  steps: Array<{
    stepNumber: number;
    stepType: 'llm_turn' | 'tool_call' | 'hitl_pause';
    toolName?: string; // e.g. "fhir_query", "fhir_mutate"
    input: unknown;
    output: unknown;
    durationMs: number;
  }>;
  queriesIssued: Array<{
    resourceType: string;
    params: Record<string, string>;
    resultCount: number;
  }>;
  writesIssued: Array<{
    resourceType: string;
    resourceId: string;
    operation: 'create' | 'update' | 'delete';
  }>;
}
```

---

## 10. Error Handling

### HTTP Status Codes

| Status                      | Cause                                             | Frontend action                   |
| --------------------------- | ------------------------------------------------- | --------------------------------- |
| `200 OK`                    | Success with body                                 | Render response                   |
| `202 Accepted`              | Async job submitted                               | Store `runId`, begin polling      |
| `204 No Content`            | Mutation succeeded                                | Update UI state                   |
| `400 Bad Request`           | Invalid state transition, missing params          | Show `message` from response body |
| `403 Forbidden`             | Not session owner, or missing `agentbuilder` role | Show access-denied message        |
| `404 Not Found`             | Resource not found                                | Show not-found state              |
| `500 Internal Server Error` | Unexpected error                                  | Show generic error, offer retry   |

### Lifecycle Violation Response

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Cannot approve persona care-gap-manager/v1: expected REVIEW state but found DRAFT"
}
```

### SSE Error Event

```
event: error
data: Session reached max turns (200).
```

---

## 11. Recommended UX Flows

### Flow 1: Browse Platform Personas → Author a New Persona From One

```
1. Load platform personas:
   GET /api/agentbuilder/personas?source=platform

2. User selects "Adapt care-gap-manager v1"
3. POST /api/agentbuilder/sessions
   Body: { personaType:"AGENT", authoringMode:"ADAPT_FROM",
           sourcePersonaId:"care-gap-manager", sourcePersonaVersion:"v1" }
   → { sessionId }

4. Open chat interface (SSE streaming)
5. Agent presents source persona and asks what to change
6. Multi-turn conversation → agent produces new YAML definition
7. Agent calls write_persona_config → persona saved as DRAFT to workflow.agent_persona_definition
```

### Flow 2: Resume In-Progress Authoring

```
1. User opens "My Work" screen:
   GET /api/agentbuilder/sessions  →  list of IN_PROGRESS sessions

2. User clicks "Resume" on a session
3. GET /api/agentbuilder/sessions/{sessionId}  →  session metadata
4. POST /api/agentbuilder/sessions/{sessionId}/$resume  →  { session_id, status, current_phase, conversation_turn_count }
5. Open chat interface; continue sending messages:
   POST /api/agentbuilder/sessions/{sessionId}/messages
   Body: { "message": "Continue from where we left off" }
5. Agent reloads conversation history and continues
```

### Flow 3: Stop Work

```
1. User clicks "Stop" on an active session
2. Confirmation: "This session will be abandoned."
3. POST /api/agentbuilder/sessions/{sessionId}/$abandon
   Body: { "status": "ABANDONED" }
4. Session disappears from the "My Work" list
```

### Flow 4: Experiment and Evaluate

```
1. User views their persona (lifecycleState = DRAFT, version = v1)
2. Clicks "Fork for Experiment"
3. Portal shows YAML diff editor
4. POST /api/agentbuilder/experiments/fork
   → { newVersion: "v1-exp-1728032401234" }

5. On new version: click "Run Evaluation"

5a. Create an eval scenario (if not already created):
    POST /api/agentbuilder/scenarios
      Body: {
        personaId, version, scenarioName, scenarioType,
        seedSpec: {                              // cohort-based test data
          description: "20 diabetic patients: 10 with recent HbA1c, 10 without",
          cohortGroups: [
            { label: "diabetic, controlled", count: 8,
              conditionCodes: ["73211009"],
              observationConstraints: [{loincCode:"4548-4", daysBack:180, comparator:"le", value:8.0}] },
            { label: "diabetic, poor control", count: 2,
              conditionCodes: ["73211009"],
              observationConstraints: [{loincCode:"4548-4", daysBack:180, comparator:"gt", value:8.0}] },
            { label: "diabetic, no recent HbA1c", count: 10,
              conditionCodes: ["73211009"], noObservations: true }
          ]
        },
        // For parameter-driven personas (e.g. diabetic-care-assessment):
        missionParams: { patientCohortFilter: "missing-hba1c-6mo", maxResults: 50 }
        // OR for chat personas (e.g. clinician-digital-twin) instead:
        // conversationScript: [{ role: "user", content: "Which of my diabetic patients need a care plan?" }]
      }
    → 201 { scenarioId }

5b. Seed the eval tenant (Step 1):
    POST /api/agentbuilder/experiments/eval/$seed?scenarioId=<uuid>
    Header: X-Tenant-ID: <owner-tenant-id>
    → 202 { seedJobId, evalTenantId: "eval-<uuid>" }

5c. Poll seed status until COMPLETED:
    GET /api/agentbuilder/experiments/eval/seed/{seedJobId}  (every 2s)
    → { seedStatus: "SEEDING", evalTenantId, seededCounts: null }
    ...
    → { seedStatus: "COMPLETED", evalTenantId: "eval-abc", seededCounts: { patients: 20, conditions: 20, observations: 10 } }

6. Submit eval run (Step 2):
   POST /api/agentbuilder/experiments/eval/$submit
     Params: personaId=..., version=..., scenarioId=<uuid>,
             tenantId=<owner>, evalTenantId=eval-abc
   → 202 { runId }

7. Poll eval run status until COMPLETED:
   GET /api/agentbuilder/experiments/eval/{runId}  (every 5s)

8. On COMPLETED: display quality score gauge + Q&A replay + trace viewer

8b. (Optional) Tear down eval tenant once review is done:
    POST /api/agentbuilder/experiments/eval/$teardown?evalTenantId=eval-a1b2c3d4-...  →  204

9. Compare versions:
   GET /api/agentbuilder/experiments/compare  →  { betterVersion: "v1-exp-..." }

10. Promote winner:
    POST /api/agentbuilder/experiments/promote  →  204
    POST /api/agentbuilder/experiments/approve  →  204
    ← version now PRODUCTION_APPROVED, live in registry
```

### Flow 5: View My Personas

```
1. GET /api/agentbuilder/personas/mine  →  list of user's portal personas
2. User sees each persona with lifecycleState badge
3. Actions available per state:
   - DRAFT: "Fork", "Submit for Review" (promote), "Retire"
   - REVIEW: "Approve", "Retire"
   - PRODUCTION_APPROVED: "Fork", "Retire"
```

---

## 12. Annex: Database Tables

All tables live in the `workflow` schema of the PostgreSQL database.

| Table                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow.agent_persona_definition`        | **Central persona store.** One row per `(persona_id, version, tenant_id)`. Holds `definition_yaml` (raw YAML), `system_prompt` (resolved system prompt text), `lifecycle_state`, `authoring_source` (`platform` / `portal`), `owner_user_id`, and `is_active`. **Platform personas are seeded at server startup** by `PlatformPersonaSeedService` which reads classpath YAML files and upserts them with `authoring_source='platform'` and `lifecycle_state='PRODUCTION_APPROVED'`. Portal personas are written by the `write_persona_config` MCP tool with `authoring_source='portal'`. Only `PRODUCTION_APPROVED + active=true` versions are loaded into `AgentPersonaRegistry` for live mission execution. |
| `workflow.platform_agent_onboarding`       | **Authoring session state.** One row per authoring session. Stores `session_id`, `owner_user_id`, `authoring_mode` (`FROM_SCRATCH` or `ADAPT_FROM`), `source_persona_id/version` for adapt mode, `status` (`IN_PROGRESS`, `AWAITING_REVIEW`, `COMPLETE`, `ABANDONED`), `current_phase`, `phase_status` JSONB (per-phase progress summary), the full `conversation` JSONB (turn history for resume), and `spec_markdown` (the accumulated persona specification document). This is the portal-side equivalent of the CLI's `docs/personas/<Persona>.md` file.                                                                                                                                                  |
| `workflow.platform_agent_onboarding_phase` | **Per-phase artifacts** (child of `platform_agent_onboarding`). One row per `(session_id, phase_number)`. Stores phase-specific content (YAML, Markdown, JSON) produced by each authoring skill phase. Decoupled so the schema supports any number of phases without DDL changes.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow.platform_authoring_memory`       | **Per-user authoring memory.** Analogous to Claude Code's file-based memory system. One row per `(tenant_id, user_id, memory_key)`. Types: `user` (role/preferences), `feedback` (what to avoid/repeat), `project` (ongoing work), `reference` (external pointers). Injected into the system prompt at session start so the AI agent has continuity across sessions.                                                                                                                                                                                                                                                                                                                                          |
| `workflow.platform_persona_artifact`       | **Intermediate skill artifacts** scoped to a session. Keyed by `(session_id, path)`. Stores files generated during authoring: `system.md`, companion skill YAMLs, formatters, confirmed terminology codes, and generated BDD feature files. `write_artifact` / `read_artifact` MCP tools read and write this table. Materialized to the server's `fhir-config/` directory when a persona is promoted to `PRODUCTION_APPROVED`.                                                                                                                                                                                                                                                                                |
| `workflow.persona_evaluation_run`          | **Evaluation run records.** One row per async eval run. Stores `run_status` (`PENDING` → `RUNNING` → `COMPLETED` / `FAILED`), `quality_score` (0–100), `quality_dimensions` JSONB (per-dimension breakdown), `simulated_question` + `persona_response` (for the portal's Q&A replay view), `replay_trace` JSONB (full step-by-step execution trace), and `human_rating` (1–5 optional reviewer score). Each run targets an isolated `eval_tenant_id` sandbox.                                                                                                                                                                                                                                                 |
| `workflow.eval_scenario`                   | **Evaluation scenario definitions.** Scenarios are reusable — the same scenario can be run against multiple persona versions. Contains `seed_spec` (cohort descriptor for auto-generated FHIR test data; seeded in Step 1 before eval submit), `mission_params` (typed params for parameter-driven personas), `conversation_script` (free-text turns for chat personas), `hitl_script` (canned HITL responses), `response_criteria` (rubric for LLM Judge scoring), and `score_weights`. Referenced by `persona_evaluation_run.scenario_id`.                                                                                                                                                                  |
| `workflow.eval_seed_job`                   | **Seeding job tracker.** One row per `POST /experiments/eval/$seed` call. Tracks `seed_status` (`PENDING` → `SEEDING` → `COMPLETED` / `FAILED` / `TORN_DOWN`), the isolated `eval_tenant_id` created for the job, `seeded_counts` JSONB (number of Patient / Condition / Observation resources generated), and `error_message` on failure. The portal polls until `COMPLETED` before submitting; `$teardown` transitions status to `TORN_DOWN`.                                                                                                                                                                                                                                                               |
| `workflow.persona_plugin_skill`            | **SKILL.md version store** (renamed from `plugin_skill`). Indexed by `(plugin_id, skill_id, version)`. Stores the full SKILL.md content of each authoring skill. Synced from the filesystem via `POST /api/agentbuilder/admin/plugins/sync`. The view `workflow.persona_plugin_skill_latest` returns the active version per skill. `SkillLoader` reads from this view and pins a snapshot to each authoring session at session start.                                                                                                                                                                                                                                                                         |

### Table Relationships

```
platform_agent_onboarding (session)
  ├── platform_agent_onboarding_phase (per-phase artifacts, ON DELETE CASCADE)
  └── platform_persona_artifact (intermediate files, ON DELETE CASCADE)

agent_persona_definition (persona)
  ├── persona_evaluation_run (eval runs, ON DELETE CASCADE)
  │     └── eval_scenario (reusable scenario, FK scenario_id)
  │           └── eval_seed_job (seeding jobs, FK scenario_id ON DELETE SET NULL)
  └── platform_agent_onboarding (FK finalized_persona_id → agent_persona_definition)

platform_authoring_memory (standalone, keyed by tenant_id + user_id)
persona_plugin_skill (standalone, keyed by plugin_id + skill_id + version)
```

### Quick API Reference

```
# Persona Browse
GET    /api/agentbuilder/personas?source=platform|portal|all   List personas by source
GET    /api/agentbuilder/personas/mine                         List caller's own (portal-authored) personas
GET    /api/agentbuilder/personas/{personaId}                  Get full persona detail (AGENT or DATA_PIPELINE)
GET    /api/agentbuilder/skills                                List all available skills for persona authoring
GET    /api/agentbuilder/formatters                            List all formatter definitions across all personas
GET    /api/agentbuilder/formatters/{personaId}                Formatter coverage for a specific persona
GET    /api/agentbuilder/formatters/{personaId}/{resourceType} Single formatter definition (YAML)

# Authoring Sessions
POST   /api/agentbuilder/sessions                              Create session (FROM_SCRATCH or ADAPT_FROM)
GET    /api/agentbuilder/sessions                              List caller's non-abandoned sessions
GET    /api/agentbuilder/sessions/{sessionId}                  Get session detail (for resume)
POST   /api/agentbuilder/sessions/{sessionId}/$abandon         Abandon (soft-delete) a session
POST   /api/agentbuilder/sessions/{sessionId}/$resume          Resume a session (returns turn count)
POST   /api/agentbuilder/sessions/{sessionId}/messages         Send message, stream response (SSE)

# Experiments & Lifecycle
POST   /api/agentbuilder/experiments/fork                      Fork version as new DRAFT experiment
POST   /api/agentbuilder/experiments/eval/$seed                Step 1: seed eval tenant with test data
GET    /api/agentbuilder/experiments/eval/seed/{seedJobId}     Poll seed job status (PENDING→COMPLETED)
POST   /api/agentbuilder/experiments/eval/$submit              Step 2: submit async evaluation run
POST   /api/agentbuilder/experiments/eval/$teardown            Step 3: delete eval tenant resources
GET    /api/agentbuilder/experiments/eval                      List eval runs for persona/version
GET    /api/agentbuilder/experiments/eval/{runId}              Get eval run detail + quality score + trace
GET    /api/agentbuilder/experiments/compare                   Compare versions by quality score
POST   /api/agentbuilder/experiments/promote                   DRAFT → REVIEW
POST   /api/agentbuilder/experiments/approve                   REVIEW → PRODUCTION_APPROVED
POST   /api/agentbuilder/experiments/retire                    Any → retired (active=false)

# Admin
POST   /api/agentbuilder/admin/plugins/sync                    Sync SKILL.md files into DB
```

All endpoints require `Authorization: Bearer <jwt>` with the `agentbuilder` role in `realm_access.roles`.

---

## Appendix — Complete Persona API Responses

Full verbatim responses from `GET /api/agentbuilder/personas/{personaId}` for the three key platform personas. Use these as the ground truth for frontend field mapping and component rendering.

> **Note on `systemPrompt`:** The full resolved runtime prompt is included. Frontends typically display only a short excerpt; the full text is useful for the persona-authoring detail panel and copy functionality.

---

### A.1 — `clinician-digital-twin` (AGENT, patient scope)

```json
{
  "personaId": "clinician-digital-twin",
  "version": "v0.1.0",
  "name": "Clinician Digital Twin",
  "description": "A clinician opens an EHR-embedded AI chat for a specific patient. The assistant\nretrieves the patient's longitudinal record, answers clinical questions with full\ndetail, surfaces diagnostic and medication/procedure recommendations, and can\ncreate clinical records from the clinician's free-text instructions — grounded\nin real FHIR data.\n",
  "scope": "patient",
  "personaType": "AGENT",
  "authoringSource": "platform",
  "lifecycleState": "PRODUCTION_APPROVED",
  "ownerUserId": "",
  "createdAt": "2026-10-05T00:03:05.368106Z",
  "updatedAt": "2026-10-05T00:03:05.368115Z",
  "systemPrompt": "You are Clinician Digital Twin, a patient-scoped clinical decision support assistant grounded in the patient's longitudinal FHIR record. Your primary user is a clinician who needs precise, data-grounded clinical information to support point-of-care decisions and may ask you to create clinical records based on their assessment.\n\n## CRITICAL EXECUTION MODEL\n\n**You will operate in TWO SEPARATE TURNS:**\n\n### TURN 1 (RIGHT NOW): Generate Tool Calls ONLY\n- Output ONLY the tool calls you need in JSON format\n- Do NOT write any narrative explanation\n- Do NOT include any \"Tool Result:\" sections\n- Do NOT write a final answer\n- Do NOT summarize anything\n- Just output the JSON tool call blocks and STOP\n- The system will execute your tools and return real results\n\n### TURN 2 (AFTER TOOL EXECUTION): Generate Final Answer\n- You will receive actual tool results from the system\n- Only then will you write your clinical assessment\n- You will have access to REAL data from the tools\n- End with `mission_complete` as a JSON tool call (format shown in the TURN 2 section below)\n\n[... full prompt ~6 000 tokens; stored in fhir-config/personas/clinician-digital-twin.yml → system-prompt-ref ...]",
  "model": {
    "modelId": "smart",
    "fallback": "fast",
    "provider": "bedrock"
  },
  "budget": {
    "maxIterations": 20,
    "maxToolCallsPerIteration": 10,
    "timeoutSeconds": 900
  },
  "memory": {
    "maxShortTermTokens": 32768,
    "semanticEnabled": false,
    "episodicEnabled": true
  },
  "reasoningStrategy": "COT",
  "confidenceThreshold": 0.75,
  "tools": [
    "fhir_discover",
    "fhir_query",
    "fhir_decomposer",
    "fhir_mutate",
    "propose_plan",
    "request_intervention",
    "spawn_agent",
    "mission_complete"
  ],
  "toolConfig": {
    "fhir_query": {
      "allowedResourceTypes": [
        "Patient",
        "Observation",
        "Condition",
        "DiagnosticReport",
        "MedicationRequest",
        "MedicationDispense",
        "CarePlan",
        "FamilyMemberHistory",
        "Appointment",
        "DocumentReference",
        "CareTeam",
        "Immunization",
        "ImmunizationRecommendation",
        "Encounter",
        "Procedure",
        "AllergyIntolerance",
        "ServiceRequest"
      ]
    },
    "fhir_decomposer": {
      "allowedResourceTypes": [
        "Observation",
        "MedicationRequest",
        "Condition",
        "AllergyIntolerance",
        "Procedure",
        "Immunization"
      ]
    },
    "fhir_mutate": {
      "allowedResourceTypes": [
        "Condition",
        "Observation",
        "DiagnosticReport",
        "MedicationRequest",
        "CarePlan",
        "ServiceRequest",
        "Bundle"
      ]
    }
  },
  "roleGuardrails": {
    "allowPrescribing": true,
    "riskLevel": "HIGH",
    "allowDiagnosticClaims": true,
    "requiresClinicalReview": true,
    "disclaimerRequired": false,
    "patientFacingLanguage": false
  },
  "intendedUserRole": "MULTI_ROLE",
  "intendedChannels": ["ehr-widget"],
  "skills": {
    "preSkillIds": ["digital-twin-prefetch-patient-context"],
    "postSkillIds": [],
    "resolvedSkills": [
      {
        "id": "digital-twin-prefetch-patient-context",
        "name": "Digital Twin Prefetch Patient Context",
        "description": "Pre-mission context primer that fetches the scoped patient profile.",
        "hook": "pre",
        "stepCount": 1
      }
    ]
  },
  "params": [],
  "formatters": {
    "personaId": "clinician-digital-twin",
    "personaSpecificTypes": [
      "AllergyIntolerance",
      "Condition",
      "Immunization",
      "MedicationRequest",
      "Observation",
      "Procedure"
    ],
    "defaultFallbackTypes": ["Observation"],
    "customizedTypes": [
      "AllergyIntolerance",
      "Condition",
      "Immunization",
      "MedicationRequest",
      "Observation",
      "Procedure"
    ],
    "defaultOnlyTypes": [],
    "note": "Persona-specific formatters override the default for: AllergyIntolerance, Condition, Immunization, MedicationRequest, Observation, Procedure"
  }
}
```

**Key rendering notes:**

- `scope: "patient"` — launch requires a `patientId`; show the patient context picker in the launch dialog.
- `params: []` — no user-configurable parameters; the launch form only needs the patient selector.
- `skills.preSkillIds` — show the pre-skill badge ("Prefetch patient context") on the persona card.
- `formatters.personaSpecificTypes` — 6 resource types have custom display formatters; use these when rendering query results from this persona's missions.
- `roleGuardrails.riskLevel: "HIGH"` + `requiresClinicalReview: true` — show the clinical review warning in the launch confirmation.
- `tools` includes `fhir_mutate` + `propose_plan` — this persona can write to the FHIR record; show the "May create/update records" capability badge.

---

### A.2 — `diabetic-care-assessment-manager` (AGENT, organization scope)

```json
{
  "personaId": "diabetic-care-assessment-manager",
  "version": "v0.1.0",
  "name": "Diabetic Care Assessment Manager",
  "description": "Finds diabetic patients at or above the configured minimum age (default 45)\nwho are missing an HbA1c test within the configured lookback window\n(default 6 months), drafts a care-gap note and screening recommendation\nfor each, and requests care-manager sign-off before completing.\nOptionally includes patients with poor glycaemic control (HbA1c above a\nconfigurable threshold) and supports geographic filtering by city, state,\nor postal code.\n",
  "scope": "organization",
  "personaType": "AGENT",
  "authoringSource": "platform",
  "lifecycleState": "PRODUCTION_APPROVED",
  "ownerUserId": "",
  "createdAt": "2026-10-05T00:03:05.376073Z",
  "updatedAt": "2026-10-05T14:09:50.775384Z",
  "systemPrompt": "You are Diabetic Care Assessment Manager, an organization-scoped AI assistant for\nthe FHIR4Java platform. Your primary user is a CARE_COORDINATOR (a care manager\nresponsible for closing preventive-care gaps across a patient panel). You have\naccess to the tools listed below and operate within the guardrails defined for\nyour role.\n\n[... full prompt ~4 500 tokens; stored in fhir-config/personas/diabetic-care-assessment-manager.yml → system-prompt-ref ...]",
  "model": {
    "modelId": "smart",
    "fallback": "fast",
    "provider": "bedrock"
  },
  "budget": {
    "maxIterations": 20,
    "maxToolCallsPerIteration": 10,
    "timeoutSeconds": 900
  },
  "memory": {
    "maxShortTermTokens": 8192,
    "semanticEnabled": false,
    "episodicEnabled": false
  },
  "reasoningStrategy": "COT",
  "confidenceThreshold": 0.75,
  "tools": [
    "fhir_query",
    "fhir_mutate",
    "propose_plan",
    "request_intervention",
    "skill_invoke",
    "mission_complete"
  ],
  "toolConfig": {
    "fhir_query": {
      "allowedResourceTypes": [
        "MedicationRequest",
        "CarePlan",
        "Observation",
        "Patient"
      ]
    },
    "fhir_mutate": {
      "allowedResourceTypes": ["CarePlan", "Bundle"]
    }
  },
  "roleGuardrails": {
    "allowPrescribing": false,
    "riskLevel": "HIGH",
    "allowDiagnosticClaims": false,
    "requiresClinicalReview": true,
    "disclaimerRequired": true,
    "patientFacingLanguage": false
  },
  "intendedUserRole": "MULTI_ROLE",
  "intendedChannels": ["ehr-widget", "api-only"],
  "skills": {
    "preSkillIds": [],
    "postSkillIds": [],
    "resolvedSkills": []
  },
  "params": [
    {
      "id": "minAge",
      "label": "Minimum Patient Age",
      "type": "integer",
      "required": false,
      "description": "Only include patients at or above this age in the care-gap cohort.",
      "default": 45,
      "min": 18,
      "max": 100
    },
    {
      "id": "lookbackMonths",
      "label": "HbA1c Lookback Window (months)",
      "type": "integer",
      "required": false,
      "description": "Number of months to look back when checking for a recent HbA1c observation.",
      "default": 6,
      "min": 1,
      "max": 24
    },
    {
      "id": "includePoorControl",
      "label": "Include patients with poor diabetes control",
      "type": "boolean",
      "required": false,
      "description": "Also include patients with a recent HbA1c above the poor-control threshold.",
      "default": false
    },
    {
      "id": "poorControlThreshold",
      "label": "Poor control HbA1c threshold (%)",
      "type": "number",
      "required": false,
      "description": "HbA1c above this value is considered poor control.",
      "default": 9.0,
      "min": 7.0,
      "max": 15.0,
      "dependsOn": {
        "param": "includePoorControl",
        "value": true
      }
    },
    {
      "id": "locationFilter",
      "label": "Restrict to patients in location",
      "type": "location_group",
      "required": false,
      "description": "Optional geographic filter applied to the patient panel."
    }
  ],
  "formatters": {
    "personaId": "diabetic-care-assessment-manager",
    "personaSpecificTypes": [],
    "defaultFallbackTypes": ["Observation"],
    "customizedTypes": [],
    "defaultOnlyTypes": ["Observation"],
    "note": "This persona uses default formatters for all resource types."
  }
}
```

**Key rendering notes:**

- `scope: "organization"` — no patient picker in the launch dialog; operates over the whole patient panel.
- `params` — render a launch form with 5 configurable fields:
  - `minAge` (integer slider or number input, default 45, range 18–100)
  - `lookbackMonths` (integer, default 6, range 1–24)
  - `includePoorControl` (toggle/checkbox, default false)
  - `poorControlThreshold` (number, default 9.0, range 7–15) — **show only when `includePoorControl` is true** (`dependsOn` field)
  - `locationFilter` (type `location_group`) — render as city/state/postal-code triple input; all sub-fields optional
- `tools` includes `skill_invoke` — this persona uses a companion phenotyping Skill; no special UI treatment needed.
- `roleGuardrails.disclaimerRequired: true` — show a "Drafts require clinical review" disclaimer on any output panel.
- `intendedChannels` includes `"api-only"` — suitable for scheduled/headless invocation; show an "API triggerable" badge.

---

### A.3 — `clinical-docs-harmonizer` (DATA_PIPELINE, domain scope)

```json
{
  "personaId": "clinical-docs-harmonizer",
  "version": "v1.0.0",
  "name": "Clinical Documents Harmonizer",
  "description": "Imports clinical documents from external sources (CDA, HL7v2, PDFs, text)\nand harmonizes to FHIR standard resources. Used by clinicians to integrate\nlegacy documentation into the EHR.\n",
  "scope": "domain",
  "personaType": "DATA_PIPELINE",
  "authoringSource": "platform",
  "lifecycleState": "PRODUCTION_APPROVED",
  "ownerUserId": "",
  "createdAt": "2026-10-05T14:57:08.889731Z",
  "updatedAt": "2026-10-05T14:57:08.889754Z",
  "trigger": {
    "type": "manual",
    "triggerEndpoint": "POST /api/persona/DataPipelinePersona/clinical-docs-harmonizer/$execute"
  },
  "inputSchema": {
    "documentTypes": [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/plain"
    ],
    "maxSize": "50MB",
    "fields": [
      {
        "name": "documentContent",
        "type": "string",
        "description": "Base64 encoded file or text content",
        "required": true
      },
      {
        "name": "documentType",
        "type": "string",
        "description": "pdf | image | text | cda | hl7v2",
        "required": true
      },
      {
        "name": "patientId",
        "type": "string",
        "description": "Target patient for imported data",
        "required": true
      },
      {
        "name": "encounterId",
        "type": "string",
        "description": "Optional encounter context",
        "required": false
      }
    ]
  },
  "pipelineSteps": [
    {
      "stepId": "bulk-query-patient-context",
      "sequence": 1,
      "type": "bulk-query",
      "description": "Fetch patient's existing conditions, medications, observations (10 most recent per type, sorted by date)",
      "outputVar": "patientContext",
      "config": {
        "patientId": "{{ input.patientId }}",
        "resourceTypes": [
          "Encounter",
          "Patient",
          "Condition",
          "MedicationRequest",
          "Observation"
        ],
        "limit": 50
      },
      "retryPolicy": { "maxRetries": 3, "backoffMs": 1000 },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "30d",
        "summaryFields": [
          "resource_count",
          "patient_conditions",
          "patient_medications",
          "patient_observations"
        ]
      }
    },
    {
      "stepId": "document-parse-clinical-note",
      "sequence": 2,
      "type": "document-parse",
      "description": "Parse document; extract text content using OCR or text extraction",
      "outputVar": "parseResult",
      "config": {
        "documentType": "{{ input.documentType }}",
        "maxCharacters": 10000000,
        "timeout": 600,
        "maxTokens": 8000,
        "vision-model-alias": "ocr-adv",
        "pdf": {
          "enabled": true,
          "library": "apache-pdfbox",
          "maxPages": 1000,
          "timeout": 60
        },
        "cda": {
          "enabled": true,
          "extractNarrative": true,
          "extractStructuredData": true
        },
        "hl7v2": {
          "enabled": true,
          "extractSegments": ["OBX", "DG1", "RXE", "PV1", "ORC"],
          "timeout": 30
        },
        "errorHandling": {
          "onOcrFallure": "continue",
          "onPdfFailure": "fail",
          "onStructuredParseFailure": "continue"
        }
      },
      "retryPolicy": {
        "maxRetries": 2,
        "backoffMs": 1000,
        "retryableErrors": ["VisionModelException", "DocumentParsingException"]
      },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "90d",
        "description": "Complete extracted text from source document"
      }
    },
    {
      "stepId": "llm-extract-clinical-entities",
      "sequence": 3,
      "type": "llm-analyze",
      "description": "Parse document; extract clinical entities using LLM",
      "outputVar": "extractedData",
      "config": {
        "modelAlias": "gpt55",
        "maxTokens": 32768,
        "timeout": 600,
        "promptPath": "classpath:/fhir-config/prompts/clinical-docs-harmonizer/llm-analyze.prompt.txt",
        "modelPromptPaths": {
          "gpt55": "classpath:/fhir-config/prompts/clinical-docs-harmonizer/llm-analyze-gpt55.prompt.txt"
        }
      },
      "retryPolicy": { "maxRetries": 2, "backoffMs": 2000 },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "30d",
        "summaryFields": [
          "diagnoses_count",
          "medications_count",
          "observations_count",
          "procedures_count",
          "care_plans_count",
          "llmModel",
          "llmTokens"
        ]
      }
    },
    {
      "stepId": "llm-fhir-mapping",
      "sequence": 4,
      "type": "llm-transform",
      "description": "Transform extracted entities to FHIR R5 resource format",
      "outputVar": "fhirBundle",
      "config": {
        "modelAlias": "gpt55",
        "maxTokens": 16384,
        "timeout": 600,
        "promptPath": "classpath:/fhir-config/prompts/clinical-docs-harmonizer/llm-fhir-mapping.prompt.txt"
      },
      "retryPolicy": { "maxRetries": 2, "backoffMs": 3000 },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "90d",
        "description": "Complete FHIR Bundle with mapped resources"
      }
    },
    {
      "stepId": "dedup-check",
      "sequence": 5,
      "type": "dedup-check",
      "description": "Detect duplicates of existing patient records and within the document",
      "outputVar": "dedupResults",
      "config": { "bundleVar": "fhirBundle", "maxExistingPerType": 100 },
      "retryPolicy": {},
      "persistence": { "mode": "FULL", "retentionPolicy": "90d" }
    },
    {
      "stepId": "review-gate",
      "sequence": 6,
      "type": "review-gate",
      "description": "Stage generated FHIR resources for clinical review; resume on approval",
      "outputVar": "reviewDecision",
      "config": { "bundleVar": "fhirBundle" },
      "retryPolicy": {},
      "persistence": { "mode": "FULL", "retentionPolicy": "90d" }
    },
    {
      "stepId": "fhir-write-resources",
      "sequence": 7,
      "type": "fhir-write",
      "description": "Write converted FHIR resources to repository",
      "outputVar": "writeResults",
      "config": {
        "resourceTypes": [
          "Encounter",
          "Condition",
          "Observation",
          "DiagnosticReport",
          "MedicationRequest",
          "CarePlan",
          "Procedure"
        ],
        "writeMode": "transaction",
        "stampProvenance": true,
        "errorHandling": {
          "onValidationError": "REJECT_RESOURCE",
          "onDuplicateCode": "SKIP_RESOURCE",
          "onConflict": "NOTIFY_CLINICIAN"
        }
      },
      "retryPolicy": { "maxRetries": 1, "backoffMs": 1000 },
      "persistence": {
        "mode": "FULL",
        "retentionPolicy": "30d",
        "summaryFields": [
          "resources_written",
          "resources_rejected",
          "validation_errors",
          "duplicate_count"
        ]
      }
    },
    {
      "stepId": "aggregate-import-summary",
      "sequence": 8,
      "type": "aggregate",
      "description": "Generate import summary and quality metrics",
      "outputVar": "importSummary",
      "config": { "metricsEnabled": true, "auditEnabled": true },
      "retryPolicy": {},
      "persistence": {
        "mode": "SUMMARY",
        "retentionPolicy": "30d",
        "summaryFields": [
          "importDate",
          "patientId",
          "documentType",
          "entitiesExtracted",
          "writeStats",
          "resourcesByType",
          "metrics",
          "riskFlags",
          "summaryText"
        ]
      }
    }
  ],
  "bindings": [
    {
      "resourceType": "Observation",
      "yamlContent": "resourceType: Observation\n\nbindings:\n  status:\n    FINAL: final\n    final: final\n    PRELIMINARY: preliminary\n    preliminary: preliminary\n    pending: registered\n    unknown: unknown\n  category:\n    pathology: laboratory\n    laboratory: laboratory\n    vital-signs: vital-signs\n    social-history: social-history\n    imaging: imaging\n    unknown: unknown\n\ntransforms:\n  - condition: \"status.empty()\"\n    script: \"status = 'final'\"\n    description: \"Default to final for clinical observations\"\n\n  - condition: \"category.empty()\"\n    script: \"category = [{\\\"coding\\\": [{\\\"system\\\": \\\"http://terminology.hl7.org/CodeSystem/observation-category\\\", \\\"code\\\": \\\"laboratory\\\", \\\"display\\\": \\\"Laboratory\\\"}]}]\"\n    description: \"Auto-populate laboratory category if missing\"\n"
    }
  ],
  "policies": {
    "review": {
      "enabled": true,
      "maxRevisions": 3,
      "lowConfidenceThreshold": 0.7,
      "expiresAfter": "7d"
    },
    "dedup": {
      "enabled": true,
      "possibleDuplicateWindowDays": 30
    },
    "authorization": {
      "preflight": true
    }
  },
  "completionCriteria": {
    "strategy": "ALL_STEPS_COMPLETE",
    "timeout": 600,
    "fallbackAction": "NOTIFY_ADMIN"
  },
  "budget": {
    "maxExecutionTime": 600,
    "maxLlmCalls": 5,
    "maxTokensPerCall": 8000,
    "totalMaxTokens": 40000
  },
  "safety": {
    "requiresClinicalReview": true,
    "riskFlags": [
      "diagnosis_codes_not_standardized",
      "medication_dosage_missing",
      "conflicting_observations",
      "write_errors_encountered"
    ],
    "notificationOnRiskFlags": true,
    "escalationChannel": "clinical_supervisor"
  }
}
```

**Key rendering notes:**

- `personaType: "DATA_PIPELINE"` — render the pipeline DAG view (step cards with sequence numbers and type badges) instead of the chat interface.
- Launch form driven by `inputSchema.fields`: `documentContent` (file upload / textarea), `documentType` (select: pdf/image/text/cda/hl7v2), `patientId` (required), `encounterId` (optional). Enforce `maxSize: "50MB"` on the file picker.
- Step 6 (`review-gate`) is the human-in-the-loop gate: after the pipeline reaches this step it pauses. Show a "Pending review" state on the mission card and link to `POST .../clinical-docs-harmonizer/$review`.
- `policies.review.expiresAfter: "7d"` — the review window expires in 7 days; surface this deadline in the review panel.
- `policies.dedup.possibleDuplicateWindowDays: 30` — deduplicated against records within the past 30 days; show in the step 5 (dedup-check) tooltip.
- `safety.riskFlags` — if the mission output contains any of these flags, display a risk-flag alert banner on the import summary card.
- `bindings[0].yamlContent` — parse the YAML client-side to display the Observation field-mapping table in the "Bindings" tab of the pipeline detail panel.
