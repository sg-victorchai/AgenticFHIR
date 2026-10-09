# AgentBuilder Portal — Frontend Integration Guide

**Date:** 2026-10-07 (updated 2026-10-07: Phase 0 step-through portal implementation — §6.3)  
**Scope:** Complete REST API reference for the Agent Builder and Lifecycle Management portal

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Tenant Headers](#2-authentication--tenant-headers)
3. [Activity 1 — Browse Platform Personas](#3-activity-1--browse-platform-personas)
4. [Activity 2 — Browse User-Created Personas](#4-activity-2--browse-user-created-personas)
5. [Activity 3 — Authoring Sessions (Stop & Resume)](#5-activity-3--authoring-sessions-stop--resume)
6. [Activity 4 — Author a New Persona](#6-activity-4--author-a-new-persona)
   - [6.1 Create an Authoring Session](#61-create-an-authoring-session)
   - [6.2 Send Message (SSE Stream)](#62-send-message-sse-stream)
   - [6.3 Phase 0 — Guided Authoring (FROM_SCRATCH sessions only)](#63-phase-0--guided-authoring-from_scratch-sessions-only)
7. [Activity 5 — Lifecycle Management, Experiment, Evaluate & Promote](#7-activity-5--lifecycle-management-experiment-evaluate--promote)
   - [7.1 Persona Lifecycle State Machine](#71-persona-lifecycle-state-machine)
   - [7.1.1 Session Review Endpoints ($approve / $quality-approve / $complete / $reject)](#711-session-review-endpoints)
   - [7.8–7.14 Experiment Controller Lifecycle Transitions](#78-promote-draft--quality_gate_pending)
8. [Reference Endpoints — Formatters, Skills & Models](#8-reference-endpoints--formatters-and-skills)
9. [Admin Operations](#9-admin-operations)
10. [Data Models](#10-data-models)
11. [Error Handling](#11-error-handling)
12. [Recommended UX Flows](#12-recommended-ux-flows)
13. [Annex: Database Tables](#13-annex-database-tables)

---

## 1. Overview

The AgentBuilder subsystem exposes four groups of REST endpoints:

| Group                   | Base Path                                      | Purpose                                                           |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Persona Browse          | `/api/agentbuilder/personas`                   | List platform personas and user-owned personas                    |
| Authoring Sessions      | `/api/agentbuilder/sessions`                   | Create, list, resume, and stop authoring sessions (SSE streaming) |
| Lifecycle & Experiments | `/api/agentbuilder/experiments`                | Fork, evaluate, compare, and promote persona versions             |
| Reference               | `/api/agentbuilder/{formatters,skills,models}` | Formatter definitions, skill library, active LLM model info       |
| Admin                   | `/api/agentbuilder/admin`                      | Skill sync, platform persona system-prompt update                 |

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

Access to all `/api/agentbuilder/**` endpoints is controlled by a **database-managed role**, not by the JWT itself. The server checks the `fhir.rbac_user_role` table for the calling user's `user_id` and a row with `role_code = 'agentbuilder'`.

Authenticated users who lack this DB row receive `403 Forbidden`, even if the JWT contains an `agentbuilder` Keycloak realm role.

> **Admin provisioning:** To grant a user access, insert a row:
>
> ```sql
> INSERT INTO fhir.rbac_user_role (tenant_id, user_id, role_code, granted_by)
> VALUES ('<tenant>', '<preferred_username_or_sub>', 'agentbuilder', 'admin');
> ```
>
> The `user_id` value must match what the server resolves from the JWT — `preferred_username` claim first, then `sub` as fallback (see User Identity below).

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
    "description": "Care coordinator agent for identifying diabetic patients with care gaps",
    "status": "IN_PROGRESS",
    "current_phase": 2,
    "selected_model_id": "global.anthropic.claude-opus-4-8",
    "created_at": "2026-10-01T09:00:00Z",
    "updated_at": "2026-10-01T14:30:00Z"
  }
]
```

Shows all non-ABANDONED sessions owned by the calling user, ordered by last updated. Use this for the "Resume Work" screen. `selected_model_id` is the model the session was created with — `null` means the session uses the server default. Look up `displayName` from `GET /api/agentbuilder/models` to show a model badge on each session card.

**Session `status` values:**

| Value                | Meaning                                                   |
| -------------------- | --------------------------------------------------------- |
| `IN_PROGRESS`        | Active authoring; can resume                              |
| `AWAITING_REVIEW`    | AI finished authoring; author needs to review the content |
| `QUALITY_REVIEW`     | Author approved; waiting for quality reviewer sign-off    |
| `SANDBOX_EXPERIMENT` | Quality gate passed; sandbox evaluation in progress       |
| `COMPLETE`           | Best version promoted to production; session closed       |
| `ABANDONED`          | Stopped by the user; excluded from this list              |

### Get Session Metadata

Returns session state without conversation history. Use for displaying a session summary card. To resume and load conversation history, use `POST /$resume` instead.

```
GET /api/agentbuilder/sessions/{sessionId}
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
```

**Response — 200 OK:** Session metadata object (no conversation history — use `$resume` or `GET /messages` for that).

**Response — 403 Forbidden:** If the calling user is not the session owner.

**Response — 404 Not Found:** If sessionId does not exist.

### Abandon a Session

```
POST /api/agentbuilder/sessions/{sessionId}/$abandon
Authorization: Bearer <jwt>
```

No request body required.

**Response — 204 No Content:** Session marked `ABANDONED`.

**Response — 403 Forbidden:** Caller is not the session owner.

**Response — 404 Not Found:** Session does not exist.

### Resume a Session

Call `$resume` to reload conversation history and re-activate the session. The response includes the full visible conversation history — render it in the chat window before the user sends the next message.

**Step 1 — Resume the session:**

```
POST /api/agentbuilder/sessions/{sessionId}/$resume
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "IN_PROGRESS",
  "current_phase": 2,
  "persona_name": "My New Agent",
  "selected_model_id": "global.anthropic.claude-opus-4-8",
  "conversation_turn_count": 4,
  "conversation": [
    {
      "role": "user",
      "content": "I want to build an agent that identifies diabetic patients..."
    },
    {
      "role": "assistant",
      "content": "Great! Let me ask a few questions to define the scope..."
    },
    {
      "role": "user",
      "content": "The users are care coordinators at a hospital..."
    },
    {
      "role": "assistant",
      "content": "Understood. Based on what you've told me, here is the persona so far..."
    }
  ]
}
```

**Field descriptions:**

| Field                     | Description                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation`            | Visible chat turns only — `user` and `assistant` messages. Tool calls and internal AI loop messages are stripped. Render these in order in the chat window. |
| `conversation_turn_count` | Number of visible turns (length of `conversation` array)                                                                                                    |
| `selected_model_id`       | Model ID active for this session; look up `displayName` from `GET /api/agentbuilder/models`                                                                 |

**Response — 403 Forbidden:** Caller is not the session owner.

**Response — 404 Not Found:** Session does not exist.

**Step 2 — Load conversation on demand (alternative):**

To fetch conversation history independently (e.g. for pagination or refresh):

```
GET /api/agentbuilder/sessions/{sessionId}/messages
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "count": 4,
  "messages": [
    { "role": "user", "content": "I want to build an agent..." },
    { "role": "assistant", "content": "Great! Let me ask..." },
    { "role": "user", "content": "The users are care coordinators..." },
    { "role": "assistant", "content": "Understood. Here is the persona..." }
  ]
}
```

**Step 3 — Continue sending messages:**

```
POST /api/agentbuilder/sessions/{sessionId}/messages
Authorization: Bearer <jwt>
Content-Type: application/json

{ "message": "Let's continue from where we left off" }
```

The agent picks up exactly where the session left off. See §6.2 for the full SSE streaming protocol.

> **UX guidance:** On resume, render the `conversation` array from the `$resume` response into the chat window before the user types. Do NOT display the `$resume` response JSON itself — it is session metadata, not a chat message. Use `selected_model_id` to look up the model `displayName` from `GET /api/agentbuilder/models` and show it in the chat header.

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
  "authoringMode": "FROM_SCRATCH",
  "description": "Care coordinator agent for identifying diabetic patients with care gaps"
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
  "sourcePersonaVersion": "v1",
  "description": "Adapted care-gap manager with stricter HbA1c thresholds for pediatric patients"
}
```

In `ADAPT_FROM` mode, the AI agent automatically loads the source persona's YAML as a starting point and asks the user to describe only what they want to change (Phase 0 adapt mode).

**Request fields:**

| Field                  | Type   | Required    | Values                                                                                                                        |
| ---------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `personaType`          | string | No          | `AGENT` (default), `DATA_PIPELINE`                                                                                            |
| `authoringMode`        | string | No          | `FROM_SCRATCH` (default), `ADAPT_FROM`                                                                                        |
| `sourcePersonaId`      | string | Conditional | Required when `authoringMode=ADAPT_FROM`                                                                                      |
| `sourcePersonaVersion` | string | Conditional | Required when `authoringMode=ADAPT_FROM`                                                                                      |
| `modelId`              | string | No          | Model ID from `GET /api/agentbuilder/models`; omit to use the server default                                                  |
| `description`          | string | No          | User-friendly description of what this persona is meant to do; displayed on session cards and preserved in the session record |

**Response — 200 OK:**

```json
{ "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

If `modelId` and/or `description` were supplied, they are echoed back:

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "selectedModelId": "global.anthropic.claude-opus-4-8",
  "description": "Care coordinator agent for identifying diabetic patients with care gaps"
}
```

**`FROM_SCRATCH` sessions also return `authoring_step`:**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "description": "Care coordinator agent for identifying diabetic patients with care gaps",
  "authoring_step": "P0_OUTCOME_INTAKE"
}
```

`authoring_step` is non-null only for `FROM_SCRATCH` sessions; it is absent (or `null`) for `ADAPT_FROM` sessions which skip Phase 0. Read this field immediately after session creation to initialise the Phase 0 guided-authoring UI (see §6.3).

Passing an unrecognised `modelId` returns **400 Bad Request**. Call `GET /api/agentbuilder/models` first to obtain the list of valid IDs.

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

| Event type | Data                                         | Meaning                                                                                                                                                                                                       |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`    | Partial text string                          | Incremental response token — append to display                                                                                                                                                                |
| `step`     | Next `authoring_step` value, or empty string | Emitted after the last `token` and before `done`; tells the portal which Phase 0 step is now active. Empty string means Phase 0 is complete (switch to normal chat input). Omitted for `ADAPT_FROM` sessions. |
| `done`     | (empty)                                      | End of AI turn — ready for next user message                                                                                                                                                                  |
| `error`    | Error message string                         | Processing error                                                                                                                                                                                              |

**Example stream — Phase 0 in progress:**

```
event: token
data: ══════════════════════════════════════════════════════
event: token
data:  Step 2 of 6 — Proxy Questions
event: token
data: ══════════════════════════════════════════════════════

event: token
data: Please answer these 7 questions ...

event: step
data: P0_PROXY_QUESTIONS

event: done
data:
```

**Example stream — Phase 0 complete (entering Phase 1):**

```
event: token
data: Great! All set. Now let's begin the formal authoring process.

event: step
data:

event: done
data:
```

**Frontend implementation:**

- Use Fetch API with `ReadableStream` (not `EventSource` — POST is required)
- Buffer `token` events and render incrementally
- On `step`: call `setAuthoringStep(e.data || null)` to switch the input widget (see §6.3)
- On `done`, enable input for the next turn
- On `error`, display the message and allow retry
- Session supports up to **200 turns** maximum

**TypeScript example (Phase 0-aware):**

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
let eventType = 'message';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (eventType === 'token') {
        appendToDisplay(data);
      } else if (eventType === 'step') {
        setAuthoringStep(data || null); // null → Phase 0 done, switch to normal chat
      }
      // 'done' and 'error' handled below
    } else if (line === '') {
      if (eventType === 'done') onTurnComplete();
      if (eventType === 'error') onStreamError(buffer);
      eventType = 'message';
    }
  }
}
```

---

### 6.3 Phase 0 — Guided Authoring (FROM_SCRATCH sessions only)

`FROM_SCRATCH` sessions begin in Phase 0 — a six-step guided intake that collects the information needed to author a persona without wasting an LLM turn on scripted questions. The backend (`Phase0Orchestrator`) drives the state machine; the portal renders the appropriate input widget for each step.

#### Overview

| Step | `authoring_step` value | What happens                                                                |
| ---- | ---------------------- | --------------------------------------------------------------------------- |
| 1    | `P0_OUTCOME_INTAKE`    | Collect the outcome statement                                               |
| 2    | `P0_PROXY_QUESTIONS`   | Present 7 proxy questions, collect answers                                  |
| 3    | `P0_TYPE_DECISION`     | Show type recommendation (AGENT / DATA_PIPELINE); user accepts or overrides |
| 4    | `P0_COHORT_CHECK`      | Ask whether the persona targets a patient cohort                            |
| 5    | `P0_COHORT_RECIPE`     | Collect plain-English cohort description (only if step 4 = Yes)             |
| 6    | `P0_AUTHORING_MODE`    | User picks authoring mode: fixed-workflow / parameterized / dynamic-agent   |
| done | `null` / `""`          | Phase 0 complete — switch to normal chat input for Phases 1-5               |

Phase 0 completes in **under 2 minutes** — steps 1, 2, 4, 5, and 6 return pre-scripted text instantly. Step 3 makes a single focused LLM call (~2-5 s) to infer the persona type from the proxy answers.

---

#### TypeScript State Model

```typescript
type AuthoringStep =
  | 'P0_OUTCOME_INTAKE'
  | 'P0_PROXY_QUESTIONS'
  | 'P0_TYPE_DECISION'
  | 'P0_COHORT_CHECK'
  | 'P0_COHORT_RECIPE'
  | 'P0_AUTHORING_MODE'
  | null; // null = Phases 1-5 (normal chat)

const STEP_INDEX: Record<NonNullable<AuthoringStep>, number> = {
  P0_OUTCOME_INTAKE: 1,
  P0_PROXY_QUESTIONS: 2,
  P0_TYPE_DECISION: 3,
  P0_COHORT_CHECK: 4,
  P0_COHORT_RECIPE: 5,
  P0_AUTHORING_MODE: 6,
};

const [authoringStep, setAuthoringStep] = useState<AuthoringStep>(
  initialAuthoringStep, // read from POST /sessions response
);
```

Initialize `authoringStep` from the `authoring_step` field in the session creation response (§6.1). On resume (`POST /$resume`), read `authoring_step` from `GET /api/agentbuilder/sessions/{sessionId}` and restore the state.

---

#### Progress Stepper

Show a horizontal step indicator at the top of the authoring panel whenever `authoringStep !== null`:

```
● Step 1   ○ Step 2   ○ Step 3   ○ Step 4   ○ Step 5   ○ Step 6
Outcome     Proxy Q    Type       Cohort?    Cohort     Mode
```

- Filled circle = completed or current step; empty circle = future step.
- Compute current index from `STEP_INDEX[authoringStep]`.
- Hide the stepper completely once `authoringStep` becomes `null` (Phase 1+ chat).

---

#### Per-Step Input Widgets

Replace the normal chat textarea with a step-specific widget while `authoringStep` is non-null.

**Step 1 — `P0_OUTCOME_INTAKE`**

Render a large textarea pre-filled with the session description (if provided at creation):

```tsx
<label>Describe what this persona should accomplish</label>
<textarea
  rows={5}
  defaultValue={sessionDescription}
  placeholder="e.g. Identify diabetic patients missing an HbA1c test in the last 6 months
  and draft a care-gap note for each."
/>
<button onClick={submitOutcome}>Next →</button>
```

On submit, send the textarea content as the `message` body.

---

**Step 2 — `P0_PROXY_QUESTIONS`**

The AI response contains 7 numbered questions (e.g. "1. Who are the primary users?"). Render seven labelled text inputs. The backend parses numbered answers, so format the submitted message automatically:

```tsx
// Extract questions from last assistant message using regex /^(\d+)\./m
const questions = parseQuestionsFromLastMessage(lastAssistantMessage);

return (
  <form onSubmit={submitProxyAnswers}>
    {questions.map((q, i) => (
      <div key={i}>
        <label>{q}</label>
        <input type="text" value={answers[i]} onChange={...} />
      </div>
    ))}
    <button type="submit">Submit Answers →</button>
  </form>
);

function submitProxyAnswers() {
  // Format as numbered list — backend's parseNumberedAnswers() parses this
  const message = answers.map((a, i) => `${i + 1}. ${a}`).join('\n');
  sendMessage(message);
}
```

---

**Step 3 — `P0_TYPE_DECISION`**

The AI response shows a type recommendation with scores (e.g. "Recommended: **AGENT** (agent score: 0.85)"). Render two action buttons:

```tsx
<div className="type-decision">
  <p>{lastAssistantMessage}</p>
  <button variant="primary" onClick={() => sendMessage('accept')}>
    ✓ Accept recommendation
  </button>
  <button variant="outline" onClick={() => setShowOverride(true)}>
    Override
  </button>
  {showOverride && (
    <div>
      <select value={altType} onChange={(e) => setAltType(e.target.value)}>
        <option value="AGENT">AGENT</option>
        <option value="DATA_PIPELINE">DATA_PIPELINE</option>
      </select>
      <button onClick={() => sendMessage(`override:${altType}`)}>
        Confirm Override
      </button>
    </div>
  )}
</div>
```

---

**Step 4 — `P0_COHORT_CHECK`**

Yes / No toggle buttons:

```tsx
<p>Does this persona target a specific patient cohort?</p>
<button variant="primary" onClick={() => sendMessage('yes')}>Yes</button>
<button variant="outline" onClick={() => sendMessage('no')}>No</button>
```

---

**Step 5 — `P0_COHORT_RECIPE`**

Only reached if step 4 was "Yes". Textarea to describe the cohort in plain English:

```tsx
<label>Describe the patient cohort in plain English</label>
<textarea
  rows={4}
  placeholder="e.g. Diabetic patients (type 1 or 2) aged 45 or older who have not had
  an HbA1c test in the past 6 months."
/>
<button onClick={submitCohort}>Continue →</button>
```

---

**Step 6 — `P0_AUTHORING_MODE`**

Three option cards (one selection required):

```tsx
const modes = [
  {
    value: 'fixed-workflow',
    label: 'Fixed Workflow',
    description:
      'Step-by-step pipeline; same execution path every time. Best for ETL or document processing.',
  },
  {
    value: 'parameterized',
    label: 'Parameterized',
    description:
      'Fixed workflow with configurable parameters (age thresholds, lookback windows, etc.).',
  },
  {
    value: 'dynamic-agent',
    label: 'Dynamic Agent',
    description:
      'AI reasons at runtime to plan and execute steps. Best for open-ended clinical queries.',
  },
];

return (
  <div className="mode-cards">
    {modes.map((m) => (
      <button
        key={m.value}
        className={selected === m.value ? 'selected' : ''}
        onClick={() => setSelected(m.value)}
      >
        <strong>{m.label}</strong>
        <p>{m.description}</p>
      </button>
    ))}
    <button disabled={!selected} onClick={() => sendMessage(selected!)}>
      Start Authoring →
    </button>
  </div>
);
```

---

#### Resuming a Phase 0 Session

When the user resumes a `FROM_SCRATCH` session that is still in Phase 0:

1. Call `GET /api/agentbuilder/sessions/{sessionId}` — the response includes `authoring_step`.
2. Set `authoringStep` to that value.
3. Call `POST /$resume` to load conversation history and render prior messages.
4. The last assistant message tells the user what to do next; the portal renders the widget for the current step.

```typescript
const meta = await fetch(`/api/agentbuilder/sessions/${sessionId}`, {
  headers,
}).then((r) => r.json());
setAuthoringStep(meta.authoring_step ?? null);

const resume = await fetch(`/api/agentbuilder/sessions/${sessionId}/$resume`, {
  method: 'POST',
  headers,
}).then((r) => r.json());
setChatMessages(resume.conversation);
```

---

## 7. Activity 5 — Lifecycle Management, Experiment, Evaluate & Promote

### 7.1 Persona Lifecycle State Machine

Two parallel state machines track every portal-authored persona:

- **Session status** (`workflow.platform_agent_onboarding.status`) — tracks the authoring session lifecycle, managed by `ConversationSessionController`.
- **Persona lifecycle state** (`workflow.agent_persona_definition.lifecycle_state`) — tracks the persona artifact lifecycle, managed by `PersonaLifecycleService`.

They advance together through correlated transitions. A session drives a persona to production; the persona can then continue advancing (MONITORING, IMPROVEMENT_CANDIDATE) independently of any session.

#### Persona Lifecycle State

```
DRAFT
  │ promote()
  ▼
QUALITY_GATE_PENDING
  │ approveQualityGate()
  ▼
QUALITY_GATE_APPROVED
  │ enterSandbox()
  ▼
UAT_TRAINING  ◄── (eval runs: seed → submit → compare)
  │ approve()
  ▼
PRODUCTION_APPROVED
  │ activateIfApproved()  [auto]
  ▼
MONITORING
  │ flagForImprovement()
  ▼
IMPROVEMENT_CANDIDATE
  │ fork() → new DRAFT version
  ▼
(new authoring cycle)

Any pre-production state ──rollbackToDraft()──► DRAFT
Any state               ──retire()──────────► is_active = false
```

| Persona State           | Meaning                                                  | Valid next transitions                                                    |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DRAFT`                 | Author authoring in progress                             | `promote` → QUALITY_GATE_PENDING, `retire`                                |
| `QUALITY_GATE_PENDING`  | Author approved; awaiting quality reviewer sign-off      | `approveQualityGate` → QUALITY_GATE_APPROVED, `rollbackToDraft`, `retire` |
| `QUALITY_GATE_APPROVED` | Quality gate passed; ready for sandbox                   | `enterSandbox` → UAT_TRAINING, `rollbackToDraft`, `retire`                |
| `UAT_TRAINING`          | Sandbox evaluation in progress                           | `approve` → PRODUCTION_APPROVED, `rollbackToDraft`, `retire`              |
| `PRODUCTION_APPROVED`   | Promoted from sandbox; activating in runtime registry    | auto-advances to MONITORING, `retire`                                     |
| `MONITORING`            | Live in production; telemetry being collected            | `flagForImprovement` → IMPROVEMENT_CANDIDATE, `retire`                    |
| `IMPROVEMENT_CANDIDATE` | Flagged; fork a new DRAFT to start a new authoring cycle | `fork` → new DRAFT version, `retire`                                      |
| _(retired)_             | `is_active = false`, excluded from browse results        | None                                                                      |

Only `MONITORING` (which was `PRODUCTION_APPROVED` + activated) versions are loaded into the live agent registry and serve real missions.

#### Correlated Session Status ↔ Persona Lifecycle State

| Step                              | Actor     | Session status       | Persona lifecycle_state | API call                                 |
| --------------------------------- | --------- | -------------------- | ----------------------- | ---------------------------------------- |
| AI finishes authoring             | Agent     | `AWAITING_REVIEW`    | `DRAFT`                 | _(auto — `write_persona_config` tool)_   |
| Author approves content           | Author    | `QUALITY_REVIEW`     | `QUALITY_GATE_PENDING`  | `POST /{sessionId}/$approve`             |
| Quality reviewer approves         | QA        | `SANDBOX_EXPERIMENT` | `UAT_TRAINING`          | `POST /{sessionId}/$quality-approve`     |
| Eval runs complete; best promoted | Author/QA | `COMPLETE`           | `MONITORING`            | `POST /experiments/$approve?sessionId=…` |
| Any reviewer rejects              | Author/QA | `IN_PROGRESS`        | `DRAFT`                 | `POST /{sessionId}/$reject`              |

---

### 7.1.1 Session Review Endpoints

These four endpoints control the session side of the lifecycle. All are on `ConversationSessionController` at `/api/agentbuilder/sessions/{sessionId}`. Only the session owner can call them.

#### `$approve` — Author approves persona content

Advances session `AWAITING_REVIEW → QUALITY_REVIEW` and persona `DRAFT → QUALITY_GATE_PENDING`.

```
POST /api/agentbuilder/sessions/{sessionId}/$approve
Authorization: Bearer <jwt>
```

No request body required.

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "QUALITY_REVIEW",
  "personaId": "diabetic-care-manager",
  "version": "v0.1.0",
  "lifecycleState": "QUALITY_GATE_PENDING",
  "message": "Persona content approved. Awaiting quality gate sign-off."
}
```

**Error — 409 Conflict:** Session is not in `AWAITING_REVIEW` state, or persona is not in `DRAFT` state.

---

#### `$quality-approve` — Quality reviewer approves the persona

Advances session `QUALITY_REVIEW → SANDBOX_EXPERIMENT` and persona `QUALITY_GATE_PENDING → QUALITY_GATE_APPROVED → UAT_TRAINING` (two persona transitions in one call).

```
POST /api/agentbuilder/sessions/{sessionId}/$quality-approve
Authorization: Bearer <jwt>
```

No request body required.

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "SANDBOX_EXPERIMENT",
  "personaId": "diabetic-care-manager",
  "version": "v0.1.0",
  "lifecycleState": "UAT_TRAINING",
  "message": "Quality gate passed. Persona is in sandbox — run evaluation via /experiments/eval/$seed then /eval/$submit.",
  "nextSteps": [
    "POST /api/agentbuilder/experiments/eval/$seed?scenarioId=<id>&tenantId=my-tenant",
    "POST /api/agentbuilder/experiments/eval/$submit?personaId=diabetic-care-manager&version=v0.1.0&tenantId=my-tenant&evalTenantId=<evalTenantId>",
    "GET  /api/agentbuilder/experiments/$compare?personaId=diabetic-care-manager&tenantId=my-tenant",
    "POST /api/agentbuilder/experiments/$approve?personaId=diabetic-care-manager&version=<bestVersion>&tenantId=my-tenant&sessionId=a1b2c3d4-..."
  ]
}
```

The `nextSteps` array provides ready-to-use URLs for the eval workflow. The portal should render these as action buttons in the sandbox panel.

**Error — 409 Conflict:** Session is not in `QUALITY_REVIEW`, or persona is not in `QUALITY_GATE_PENDING`.

---

#### `$complete` — Mark session complete after promotion

Advances session `SANDBOX_EXPERIMENT → COMPLETE`. Call this after `POST /experiments/$approve` succeeds (or pass `?sessionId=` to that endpoint to close them atomically — see §7.9).

```
POST /api/agentbuilder/sessions/{sessionId}/$complete
Authorization: Bearer <jwt>
```

No request body required.

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "COMPLETE",
  "message": "Authoring session closed. Persona is live and under monitoring."
}
```

**Error — 409 Conflict:** Session is not in `SANDBOX_EXPERIMENT` state.

---

#### `$reject` — Reject persona and return to authoring

Rolls back session to `IN_PROGRESS` and persona lifecycle to `DRAFT`. Callable from `AWAITING_REVIEW`, `QUALITY_REVIEW`, or `SANDBOX_EXPERIMENT`.

```
POST /api/agentbuilder/sessions/{sessionId}/$reject
Authorization: Bearer <jwt>
Content-Type: application/json

{ "reason": "System prompt scope is too broad — please narrow to HbA1c only." }
```

The request body is **optional** — omit it or send an empty body to reject without a reason.

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "IN_PROGRESS",
  "lifecycleState": "DRAFT",
  "message": "Persona returned to authoring. Resume the session to make revisions.",
  "reason": "System prompt scope is too broad — please narrow to HbA1c only."
}
```

The `reason` field is only present if a reason was supplied.

**Error — 409 Conflict:** Session is not in a rejectable state (`AWAITING_REVIEW`, `QUALITY_REVIEW`, or `SANDBOX_EXPERIMENT`).

> **UX guidance:** Show a reason text area in the reject dialog. After rejection, the session reappears in the "My Work" list with `IN_PROGRESS` status. The author can resume and continue editing from where they left off. The persona YAML is preserved — rejection does not delete it, only rolls the lifecycle state back to DRAFT.

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

### 7.3 Create an Evaluation Scenario

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
  "personaId": "diabetic-care-assessment",
  "tenantId": "my-tenant",
  "rubricGenerated": true,
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

**Response — 200 OK:**

```json
[
  {
    "scenarioId": "b3c4d5e6-...",
    "scenarioName": "Diabetic Care Gap — HbA1c Screening",
    "scenarioType": "AGENT",
    "personaId": "diabetic-care-assessment",
    "hasSeedSpec": true,
    "hasMissionParams": true,
    "hasConversation": false,
    "rubricGenerated": true,
    "createdAt": "2026-10-04T10:00:00Z",
    "updatedAt": "2026-10-04T10:00:00Z"
  }
]
```

**Get a single scenario (full detail):**

```
GET /api/agentbuilder/scenarios/{scenarioId}
Authorization: Bearer <jwt>
```

Returns the full scenario including `seedSpec`, `missionParams`, `conversationScript`, and `responseCriteria` (the generated rubric) as parsed objects.

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
GET /api/agentbuilder/experiments/$compare?personaId=care-gap-manager&tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{ "betterVersion": "v1-exp-1728032401234" }
```

Returns `{ "betterVersion": "none" }` if no completed runs exist.

---

### 7.8 Promote (DRAFT → QUALITY_GATE_PENDING)

Submits the persona for quality review. Use this when working outside an authoring session (e.g., after `fork`). For session-based authoring, use `POST /{sessionId}/$approve` (§7.1.1) which also advances the session status.

```
POST /api/agentbuilder/experiments/$promote
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

**Error — 409 Conflict:** Persona is not in `DRAFT` state.

---

### 7.9 Quality Approve (QUALITY_GATE_PENDING → QUALITY_GATE_APPROVED)

Quality reviewer sign-off. Records `qualityApprovedBy` and `qualityApprovedAt`. For session-based workflows, use `POST /{sessionId}/$quality-approve` instead — it chains this with `enterSandbox` in one call.

```
POST /api/agentbuilder/experiments/$quality-approve
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

**Error — 409 Conflict:** Persona is not in `QUALITY_GATE_PENDING` state.

---

### 7.10 Enter Sandbox (QUALITY_GATE_APPROVED → UAT_TRAINING)

Moves the persona into the sandbox environment. Once here, evaluation runs can be submitted via `/eval/$seed` and `/eval/$submit`. For session-based workflows, `POST /{sessionId}/$quality-approve` performs both quality-approve and enter-sandbox in one call.

```
POST /api/agentbuilder/experiments/$enter-sandbox
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

**Error — 409 Conflict:** Persona is not in `QUALITY_GATE_APPROVED` state.

---

### 7.11 Approve (UAT_TRAINING → PRODUCTION_APPROVED → MONITORING)

Promotes the best-evaluated version to production, loads it into the live agent registry, and advances to `MONITORING`. Optionally closes the authoring session in the same call via `?sessionId=`.

```
POST /api/agentbuilder/experiments/$approve
  ?personaId=care-gap-manager
  &version=v1-exp-1728032401234
  &tenantId=my-tenant
  &sessionId=a1b2c3d4-...          # optional — closes the authoring session
Authorization: Bearer <jwt>
```

**Response — 200 OK (fully activated):**

```json
{
  "personaId": "care-gap-manager",
  "version": "v1-exp-1728032401234",
  "lifecycleState": "MONITORING",
  "message": "Persona care-gap-manager vv1-exp-1728032401234 is now live.",
  "sessionStatus": "COMPLETE"
}
```

**Response — 200 OK (approved but registry load pending):**

When the stored persona YAML does not use the runtime `persona:` root-key format, the lifecycle state advances to `PRODUCTION_APPROVED` but the in-memory registry load is skipped. The persona will not serve missions until the YAML is corrected and the server is restarted or a re-activation is triggered.

```json
{
  "personaId": "care-gap-manager",
  "version": "v1-exp-1728032401234",
  "lifecycleState": "PRODUCTION_APPROVED",
  "message": "Persona approved but registry activation pending: YAML content is missing the required root 'persona' key",
  "warning": "YAML content is missing the required root 'persona' key",
  "sessionStatus": "COMPLETE"
}
```

**Frontend guidance:** Check for the `warning` field. If present, show an inline warning banner: _"Persona approved but not yet live — YAML format needs review before it can serve missions."_

`sessionStatus` is only present when `?sessionId=` was supplied and was in `SANDBOX_EXPERIMENT` state.

Records `qualityApprovedBy` and `qualityApprovedAt` for the production approval. When `lifecycleState` is `MONITORING`, the version is loaded into `AgentPersonaRegistry` and immediately available to serve missions.

**Error — 409 Conflict:** Persona is not in `UAT_TRAINING` state.

---

### 7.12 Flag for Improvement (MONITORING → IMPROVEMENT_CANDIDATE)

Flags a live persona for improvement. After this, fork a new `DRAFT` version via `/fork` to start a new authoring cycle.

```
POST /api/agentbuilder/experiments/$flag-for-improvement
  ?personaId=care-gap-manager
  &version=v1
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

**Error — 409 Conflict:** Persona is not in `MONITORING` state.

> **Typical follow-up:**
>
> ```
> POST /api/agentbuilder/experiments/fork?personaId=care-gap-manager&baseVersion=v1&tenantId=my-tenant
> → { "newVersion": "v1-exp-1728032401234" }
> ```
>
> Then start a new authoring session (`POST /api/agentbuilder/sessions`) with `authoringMode: ADAPT_FROM` pointing to the new forked version.

---

### 7.14 Retire (Any State → Inactive)

```
POST /api/agentbuilder/experiments/$retire
  ?personaId=care-gap-manager
  &version=v1
  &tenantId=my-tenant
Authorization: Bearer <jwt>
```

**Response:** `204 No Content`

Sets `is_active = false`. The version is soft-deleted and excluded from browse results. The `lifecycle_state` column is not changed — use it to see the state at retirement time if needed.

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

### 8.5 Get Available Conversation Models

Returns the LLM models available for selection in the AgentBuilder portal. Call once on portal load to populate the model picker in the "New Session" dialog and to display the active model in the chat window header.

```
GET /api/agentbuilder/models
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "provider": "bedrock",
  "defaultModelId": "global.anthropic.claude-sonnet-5",
  "models": [
    {
      "id": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      "displayName": "Claude Haiku 4.5",
      "description": "Fast responses — ideal for quick iterations and exploration",
      "default": false
    },
    {
      "id": "global.anthropic.claude-sonnet-5",
      "displayName": "Claude Sonnet 5",
      "description": "Balanced performance — recommended for most persona designs",
      "default": true
    },
    {
      "id": "global.anthropic.claude-opus-4-8",
      "displayName": "Claude Opus 4.8",
      "description": "Most capable — best for complex multi-step persona logic",
      "default": false
    }
  ]
}
```

**Field descriptions:**

| Field                  | Description                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `provider`             | LLM provider: `bedrock`, `ollama`, `openai`, `azure`                                           |
| `defaultModelId`       | The server-configured default model ID used when no `modelId` is specified at session creation |
| `models[].id`          | Model ID — pass as `modelId` in `POST /api/agentbuilder/sessions` to select this model         |
| `models[].displayName` | Human-readable name for display in the portal (e.g. `Claude Sonnet 5`)                         |
| `models[].description` | Short description of the model's characteristics and recommended use                           |
| `models[].default`     | `true` for the server-configured default model; at most one entry will have `true`             |

> **UX guidance:** Show a model selector dropdown in the "New Session" dialog pre-selected to the entry where `default: true`. After the session is created, show the selected model's `displayName` in the chat window header (e.g. _"Powered by Claude Opus 4.8"_). If `models` has only one entry, omit the selector and show the model name directly.

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

## 10. Data Models

### 10.1 Persona Summary (Browse response)

```typescript
type PersonaLifecycleState =
  | 'DRAFT'
  | 'QUALITY_GATE_PENDING'
  | 'QUALITY_GATE_APPROVED'
  | 'UAT_TRAINING'
  | 'PRODUCTION_APPROVED'
  | 'MONITORING'
  | 'IMPROVEMENT_CANDIDATE'
  | 'SUSPENDED'
  | 'SNAPSHOT_UNDER_REVIEW'
  | 'UAT_REVALIDATION'
  | 'NEW_BASELINE_PUBLISHED';

interface PersonaSummary {
  personaId: string; // e.g. "care-gap-manager"
  version: string; // e.g. "v1", "v1-exp-1728032401234"
  name: string;
  description: string;
  personaType: 'AGENT' | 'DATA_PIPELINE';
  authoringSource: 'platform' | 'portal' | 'cli';
  lifecycleState: PersonaLifecycleState;
  ownerUserId: string; // empty for platform personas
  updatedAt: string; // ISO-8601
}
```

### 10.2 Authoring Session

```typescript
type SessionStatus =
  | 'IN_PROGRESS'
  | 'AWAITING_REVIEW'
  | 'QUALITY_REVIEW'
  | 'SANDBOX_EXPERIMENT'
  | 'COMPLETE'
  | 'ABANDONED';

interface AuthoringSession {
  session_id: string; // UUID
  tenant_id: string;
  owner_user_id: string;
  authoring_mode: 'FROM_SCRATCH' | 'ADAPT_FROM';
  source_persona_id?: string;
  source_persona_version?: string;
  persona_type: 'AGENT' | 'DATA_PIPELINE';
  persona_name?: string; // set once Phase 0 collects it
  description?: string; // user-supplied description from session creation
  authoring_step?: string | null; // non-null = Phase 0 in progress; null/absent = Phases 1-5
  finalized_persona_id?: string; // set after write_persona_config runs
  finalized_persona_version?: string;
  status: SessionStatus;
  current_phase: number; // 0–6
  selected_model_id?: string; // model chosen at session creation; null = server default
  created_at: string;
  updated_at: string;
}

// Returned by POST /$resume (includes conversation history)
interface ResumeResponse extends Pick<
  AuthoringSession,
  | 'session_id'
  | 'status'
  | 'current_phase'
  | 'persona_name'
  | 'selected_model_id'
> {
  conversation_turn_count: number;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Returned by GET /{sessionId}/messages
interface ConversationHistory {
  sessionId: string;
  count: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}
```

### 10.3 Evaluation Run

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

### 10.4 Replay Trace Structure

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

## 11. Error Handling

### HTTP Status Codes

| Status                      | Cause                                                           | Frontend action                                            |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `200 OK`                    | Success with body                                               | Render response                                            |
| `202 Accepted`              | Async job submitted                                             | Store `runId`/`seedJobId`, begin polling                   |
| `204 No Content`            | Mutation succeeded                                              | Update UI state                                            |
| `400 Bad Request`           | Invalid params, unknown modelId, seed cohort over limit         | Show `message` from response body                          |
| `403 Forbidden`             | Not session owner, or missing `agentbuilder` role               | Show access-denied message                                 |
| `404 Not Found`             | Resource not found                                              | Show not-found state                                       |
| `409 Conflict`              | Lifecycle state violation — wrong source state for transition   | Show `error` from response body; display the current state |
| `422 Unprocessable Entity`  | Session has no `finalized_persona_id` (persona not yet written) | Inform user the session is incomplete                      |
| `500 Internal Server Error` | Unexpected error                                                | Show generic error, offer retry                            |

### Lifecycle State Violation Response (409)

Returned when a lifecycle transition is attempted from the wrong state:

```json
{
  "error": "Cannot transition persona care-gap-manager/v0.1.0: expected QUALITY_GATE_PENDING but found DRAFT"
}
```

Session-level state violations use the same shape:

```json
{
  "error": "Session must be AWAITING_REVIEW. Current: IN_PROGRESS"
}
```

> **Frontend pattern:** On `409`, read `error` and show it in the action button's error state. Refresh the persona/session data to show the current state — another actor may have already advanced it.

### SSE Error Event

```
event: error
data: Session reached max turns (200).
```

---

## 12. Recommended UX Flows

### Flow 1: Browse Platform Personas → Author a New Persona From One

```
1. Load platform personas:
   GET /api/agentbuilder/personas?source=platform

2. User selects "Adapt care-gap-manager v1", optionally types a description, and picks a model
3. POST /api/agentbuilder/sessions
   Body: { personaType:"AGENT", authoringMode:"ADAPT_FROM",
           sourcePersonaId:"care-gap-manager", sourcePersonaVersion:"v1",
           modelId:"global.anthropic.claude-opus-4-8",        // optional; omit for server default
           description:"Adapted care-gap manager for pediatric diabetic patients" }  // optional
   → { sessionId, selectedModelId?, description? }

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
3. POST /api/agentbuilder/sessions/{sessionId}/$resume
   →  { session_id, status, current_phase, persona_name,
        selected_model_id, conversation_turn_count, conversation[] }

4. Render conversation[] in the chat window (do NOT display the $resume
   JSON itself — it is session metadata, not a chat message)

5. Display selected model name in chat header:
   Look up selected_model_id in GET /api/agentbuilder/models → displayName

6. Open chat interface; user continues sending messages:
   POST /api/agentbuilder/sessions/{sessionId}/messages
   Body: { "message": "..." }
```

**TypeScript example (step 3–5):**

```typescript
// After user clicks Resume
const resume = await fetch(`/api/agentbuilder/sessions/${sessionId}/$resume`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
const data = await resume.json();

// Render prior conversation into chat window
setChatMessages(data.conversation); // [{ role, content }, ...]

// Show active model in chat header
const modelsRes = await fetch('/api/agentbuilder/models', {
  headers: { Authorization: `Bearer ${token}` },
});
const { models } = await modelsRes.json();
const model =
  models.find((m) => m.id === data.selected_model_id) ??
  models.find((m) => m.default);
setChatHeader(`Powered by ${model?.displayName ?? 'AI'}`);
```

### Flow 3: Stop Work

```
1. User clicks "Stop" on an active session
2. Confirmation: "This session will be abandoned."
3. POST /api/agentbuilder/sessions/{sessionId}/$abandon
   (no request body)
4. Session disappears from the "My Work" list
```

### Flow 4: Full Lifecycle — Author → Review → Sandbox → Production

The end-to-end flow when using the authoring session (AI-assisted path):

```
─── AUTHORING PHASE ──────────────────────────────────────────────────────────

1. Create session:
   POST /api/agentbuilder/sessions
     Body: { personaType:"AGENT", authoringMode:"FROM_SCRATCH",
             description:"<optional user-supplied description shown on session cards>" }
   → { sessionId, description? }

2. Author via AI chat (SSE):
   POST /api/agentbuilder/sessions/{sessionId}/messages
   ... (multi-turn conversation until AI calls write_persona_config)
   ← session status transitions to AWAITING_REVIEW automatically
   ← persona created with lifecycleState = DRAFT

─── AUTHOR REVIEW PHASE ──────────────────────────────────────────────────────

3. Author reviews the generated persona YAML:
   GET /api/agentbuilder/personas/{personaId}?version=v0.1.0
   ← inspect systemPrompt, tools, toolConfig, formatters, skills, params

4a. Author approves:
    POST /api/agentbuilder/sessions/{sessionId}/$approve
    → { status:"QUALITY_REVIEW", lifecycleState:"QUALITY_GATE_PENDING", ... }

4b. Author rejects (needs revision):
    POST /api/agentbuilder/sessions/{sessionId}/$reject
      Body: { "reason": "Tool scope too broad" }
    → { status:"IN_PROGRESS", lifecycleState:"DRAFT" }
    → Resume chat and iterate: POST /{sessionId}/messages

─── QUALITY REVIEW PHASE ─────────────────────────────────────────────────────

5. Quality reviewer inspects the persona (same GET as step 3)
   Verifies guardrails, tool scope, system prompt, risk level

5a. QA approves:
    POST /api/agentbuilder/sessions/{sessionId}/$quality-approve
    → { status:"SANDBOX_EXPERIMENT", lifecycleState:"UAT_TRAINING",
        nextSteps: [...eval API URLs...] }

5b. QA rejects:
    POST /api/agentbuilder/sessions/{sessionId}/$reject
      Body: { "reason": "riskLevel should be HIGH for this use case" }
    → { status:"IN_PROGRESS", lifecycleState:"DRAFT" }

─── SANDBOX EXPERIMENT PHASE ─────────────────────────────────────────────────

6. Create eval scenario (if not yet done):
   POST /api/agentbuilder/scenarios
     Body: { personaId, scenarioName, scenarioType:"AGENT",
             seedSpec: {
               cohortGroups: [
                 { label:"diabetic, controlled", count:8, conditionCodes:["73211009"],
                   observationConstraints:[{loincCode:"4548-4",daysBack:180,comparator:"le",value:8.0}] },
                 { label:"diabetic, poor control", count:2, conditionCodes:["73211009"],
                   observationConstraints:[{loincCode:"4548-4",daysBack:180,comparator:"gt",value:8.0}] },
                 { label:"diabetic, no recent HbA1c", count:10,
                   conditionCodes:["73211009"], noObservations:true }
               ]
             },
             missionParams:{ patientCohortFilter:"missing-hba1c-6mo", maxResults:50 } }
   → 201 { scenarioId }

7. Seed eval tenant (Step 1):
   POST /api/agentbuilder/experiments/eval/$seed?scenarioId=<uuid>
   Header: X-Tenant-ID: <owner-tenant-id>
   → 202 { seedJobId, evalTenantId:"eval-<uuid>" }

8. Poll until seeded:
   GET /api/agentbuilder/experiments/eval/seed/{seedJobId}  (every 2s)
   → { seedStatus:"COMPLETED", seededCounts:{ patients:20, conditions:20, observations:10 } }

9. Submit eval run (Step 2):
   POST /api/agentbuilder/experiments/eval/$submit
     Params: personaId, version, scenarioId, tenantId, evalTenantId=eval-abc
   → 202 { runId }

10. Poll eval run:
    GET /api/agentbuilder/experiments/eval/{runId}  (every 5s)
    → { runStatus:"COMPLETED", qualityScore:87.5, qualityDimensions:{...} }

11. (Optional) Fork and compare alternate version:
    POST /api/agentbuilder/experiments/fork?personaId=...&baseVersion=v0.1.0&tenantId=...
    → { newVersion:"v0.1.0-exp-1728032401234" }
    # Then seed + submit + poll for the new version
    GET /api/agentbuilder/experiments/$compare?personaId=...&tenantId=...
    → { betterVersion:"v0.1.0-exp-1728032401234" }

12. (Optional) Tear down eval tenant:
    POST /api/agentbuilder/experiments/eval/$teardown?evalTenantId=eval-abc  →  204

─── PROMOTION TO PRODUCTION ──────────────────────────────────────────────────

13. Promote best version (closes session atomically via ?sessionId=):
    POST /api/agentbuilder/experiments/$approve
      Params: personaId, version=<bestVersion>, tenantId, sessionId=<session-uuid>
    → { lifecycleState:"MONITORING", sessionStatus:"COMPLETE", message:"... is now live." }
    ← persona is loaded into AgentPersonaRegistry and serves real missions

─── POST-PRODUCTION ──────────────────────────────────────────────────────────

14. (Later) Flag for improvement after monitoring reveals issues:
    POST /api/agentbuilder/experiments/$flag-for-improvement?personaId=...&version=...&tenantId=...
    → 204

15. Fork new DRAFT and start a new authoring cycle:
    POST /api/agentbuilder/experiments/fork?personaId=...&baseVersion=v0.1.0&tenantId=...
    → { newVersion:"v0.1.0-exp-<ts>" }
    # Then POST /api/agentbuilder/sessions with authoringMode:ADAPT_FROM
```

### Flow 4b: Experiment and Evaluate Only (Post-Fork, No Session)

When working with a forked version outside of a session:

```
1. POST /api/agentbuilder/experiments/$promote?personaId=...&version=v0.1.0-exp-...&tenantId=...
   → 204  (DRAFT → QUALITY_GATE_PENDING)

2. POST /api/agentbuilder/experiments/$quality-approve?...
   → 204  (QUALITY_GATE_PENDING → QUALITY_GATE_APPROVED)

3. POST /api/agentbuilder/experiments/$enter-sandbox?...
   → 204  (QUALITY_GATE_APPROVED → UAT_TRAINING)

4. [seed → submit → poll → compare]

5. POST /api/agentbuilder/experiments/$approve?personaId=...&version=...&tenantId=...
   → 200 { lifecycleState:"MONITORING" }
```

### Flow 5: View My Personas

```
1. GET /api/agentbuilder/personas/mine  →  list of user's portal personas
2. User sees each persona with lifecycleState badge
3. Actions available per state:
   - DRAFT:                  "Fork", "Submit for Review" (promote), "Retire"
   - QUALITY_GATE_PENDING:   "Rollback to Draft" ($reject), "Quality Approve", "Retire"
   - QUALITY_GATE_APPROVED:  "Enter Sandbox", "Rollback to Draft", "Retire"
   - UAT_TRAINING:           "Run Eval", "Compare Versions", "Approve for Production", "Rollback to Draft", "Retire"
   - PRODUCTION_APPROVED:    (transient — auto-advances to MONITORING)
   - MONITORING:             "Fork", "Flag for Improvement", "Retire"
   - IMPROVEMENT_CANDIDATE:  "Fork New Version", "Retire"
```

### Flow 6: Portal Load Sequence (on app startup)

Call these three endpoints in parallel on portal load so the UI is ready before the user takes any action:

```typescript
const [personas, sessions, models] = await Promise.all([
  fetch('/api/agentbuilder/personas?source=platform', { headers }).then((r) =>
    r.json(),
  ), // platform persona list for Browse tab
  fetch('/api/agentbuilder/sessions', { headers }).then((r) => r.json()), // in-progress sessions for "My Work" badge
  fetch('/api/agentbuilder/models', { headers }).then((r) => r.json()), // model picker for "New Session" dialog
]);

// Pre-select default model
const defaultModel = models.models.find((m) => m.default) ?? models.models[0];
```

---

## 13. Annex: Database Tables

All tables live in the `workflow` schema of the PostgreSQL database.

| Table                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow.agent_persona_definition`        | **Central persona store.** One row per `(persona_id, version, tenant_id)`. Holds `definition_yaml` (raw YAML), `system_prompt` (resolved system prompt text), `lifecycle_state`, `authoring_source` (`platform` / `portal`), `owner_user_id`, and `is_active`. **Platform personas are seeded at server startup** by `PlatformPersonaSeedService` which reads classpath YAML files and upserts them with `authoring_source='platform'` and `lifecycle_state='PRODUCTION_APPROVED'`. Portal personas are written by the `write_persona_config` MCP tool with `authoring_source='portal'`. Only `PRODUCTION_APPROVED + active=true` versions are loaded into `AgentPersonaRegistry` for live mission execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow.platform_agent_onboarding`       | **Authoring session state.** One row per authoring session. Stores `session_id`, `owner_user_id`, `authoring_mode` (`FROM_SCRATCH` or `ADAPT_FROM`), `source_persona_id/version` for adapt mode, `status` (`IN_PROGRESS`, `AWAITING_REVIEW`, `COMPLETE`, `ABANDONED`), `current_phase`, `phase_status` JSONB (per-phase progress summary), `selected_model_id` (LLM chosen at session creation — null means server default), `description` (user-supplied human-readable description of what the persona should do — collected by the portal before authoring begins and displayed on session cards), `authoring_step` VARCHAR(50) (non-null = Phase 0 in progress; null = Phase 0 complete or session is ADAPT_FROM; possible values: `P0_OUTCOME_INTAKE`, `P0_PROXY_QUESTIONS`, `P0_TYPE_DECISION`, `P0_COHORT_CHECK`, `P0_COHORT_RECIPE`, `P0_AUTHORING_MODE`), `collected_data` JSONB (Phase 0 answers accumulated as keys: `outcome`, `q1`–`q7`, `typeRecommendation`, `typeDecision`, `hasCohort`, `cohortDescription`, `authoringMode`), the full `conversation` JSONB (turn history for resume; returned by `$resume` and `GET /messages` with tool internals stripped), and `spec_markdown` (the accumulated persona specification document). This is the portal-side equivalent of the CLI's `docs/personas/<Persona>.md` file. |
| `workflow.platform_agent_onboarding_phase` | **Per-phase artifacts** (child of `platform_agent_onboarding`). One row per `(session_id, phase_number)`. Stores phase-specific content (YAML, Markdown, JSON) produced by each authoring skill phase. Decoupled so the schema supports any number of phases without DDL changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `workflow.platform_authoring_memory`       | **Per-user authoring memory.** Analogous to Claude Code's file-based memory system. One row per `(tenant_id, user_id, memory_key)`. Types: `user` (role/preferences), `feedback` (what to avoid/repeat), `project` (ongoing work), `reference` (external pointers). Injected into the system prompt at session start so the AI agent has continuity across sessions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workflow.platform_persona_artifact`       | **Intermediate skill artifacts** scoped to a session. Keyed by `(session_id, path)`. Stores files generated during authoring: `system.md`, companion skill YAMLs, formatters, confirmed terminology codes, and generated BDD feature files. `write_artifact` / `read_artifact` MCP tools read and write this table. Materialized to the server's `fhir-config/` directory when a persona is promoted to `PRODUCTION_APPROVED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `workflow.persona_evaluation_run`          | **Evaluation run records.** One row per async eval run. Stores `run_status` (`PENDING` → `RUNNING` → `COMPLETED` / `FAILED`), `quality_score` (0–100), `quality_dimensions` JSONB (per-dimension breakdown), `simulated_question` + `persona_response` (for the portal's Q&A replay view), `replay_trace` JSONB (full step-by-step execution trace), and `human_rating` (1–5 optional reviewer score). Each run targets an isolated `eval_tenant_id` sandbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow.persona_eval_scenario`           | **Evaluation scenario definitions.** Scenarios are reusable — the same scenario can be run against multiple persona versions. Created via `POST /api/agentbuilder/scenarios`. Contains `seed_spec` (cohort descriptor for auto-generated FHIR test data; seeded in Step 1 before eval submit), `mission_params` (typed params for parameter-driven personas), `conversation_script` (free-text turns for chat personas), `hitl_script` (canned HITL responses), `response_criteria` (auto-generated rubric from `RubricGenerator` when `generateRubric=true`), and `score_weights`. Referenced by `persona_evaluation_run.scenario_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `workflow.eval_seed_job`                   | **Seeding job tracker.** One row per `POST /experiments/eval/$seed` call. Tracks `seed_status` (`PENDING` → `SEEDING` → `COMPLETED` / `FAILED` / `TORN_DOWN`), the isolated `eval_tenant_id` created for the job, `seeded_counts` JSONB (number of Patient / Condition / Observation resources generated), and `error_message` on failure. The portal polls until `COMPLETED` before submitting; `$teardown` transitions status to `TORN_DOWN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workflow.persona_plugin_skill`            | **SKILL.md version store** (renamed from `plugin_skill`). Indexed by `(plugin_id, skill_id, version)`. Stores the full SKILL.md content of each authoring skill. Synced from the filesystem via `POST /api/agentbuilder/admin/plugins/sync`. The view `workflow.persona_plugin_skill_latest` returns the active version per skill. `SkillLoader` reads from this view and pins a snapshot to each authoring session at session start.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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
GET    /api/agentbuilder/models                                Available LLM models for user selection; includes default flag (call on portal load)
GET    /api/agentbuilder/formatters                            List all formatter definitions across all personas
GET    /api/agentbuilder/formatters/{personaId}                Formatter coverage for a specific persona
GET    /api/agentbuilder/formatters/{personaId}/{resourceType} Single formatter definition (YAML)

# Authoring Sessions
POST   /api/agentbuilder/sessions                              Create session (FROM_SCRATCH or ADAPT_FROM)
GET    /api/agentbuilder/sessions                              List caller's non-abandoned sessions
GET    /api/agentbuilder/sessions/{sessionId}                  Get session metadata
GET    /api/agentbuilder/sessions/{sessionId}/messages         Get visible conversation history (user+assistant turns)
POST   /api/agentbuilder/sessions/{sessionId}/$abandon         Abandon (soft-delete) a session
POST   /api/agentbuilder/sessions/{sessionId}/$resume          Resume a session (returns metadata + conversation history)
POST   /api/agentbuilder/sessions/{sessionId}/messages         Send message, stream response (SSE)

# Session Lifecycle Review (ConversationSessionController)
POST   /api/agentbuilder/sessions/{sessionId}/$approve         AWAITING_REVIEW→QUALITY_REVIEW + persona DRAFT→QUALITY_GATE_PENDING
POST   /api/agentbuilder/sessions/{sessionId}/$quality-approve QUALITY_REVIEW→SANDBOX_EXPERIMENT + persona →UAT_TRAINING (two persona hops)
POST   /api/agentbuilder/sessions/{sessionId}/$complete        SANDBOX_EXPERIMENT→COMPLETE (call after /experiments/$approve)
POST   /api/agentbuilder/sessions/{sessionId}/$reject          Any review/sandbox state → IN_PROGRESS; persona → DRAFT

# Eval Scenarios (EvalScenarioController)
POST   /api/agentbuilder/scenarios                             Create a reusable eval scenario (cohort + mission input)
GET    /api/agentbuilder/scenarios?personaId=...               List scenarios for a persona
GET    /api/agentbuilder/scenarios/{scenarioId}                Get full scenario detail (seedSpec, missionParams, rubric)

# Experiments & Lifecycle (PersonaExperimentController)
POST   /api/agentbuilder/experiments/fork                      Fork version as new DRAFT experiment
POST   /api/agentbuilder/experiments/eval/$seed                Step 1: seed eval tenant with test data
GET    /api/agentbuilder/experiments/eval/seed/{seedJobId}     Poll seed job status (PENDING→COMPLETED)
POST   /api/agentbuilder/experiments/eval/$submit              Step 2: submit async evaluation run
POST   /api/agentbuilder/experiments/eval/$teardown            Step 3: delete eval tenant resources
GET    /api/agentbuilder/experiments/eval                      List eval runs for persona/version
GET    /api/agentbuilder/experiments/eval/{runId}              Get eval run detail + quality score + trace
GET    /api/agentbuilder/experiments/$compare                   Compare versions by quality score
POST   /api/agentbuilder/experiments/$promote                   DRAFT → QUALITY_GATE_PENDING
POST   /api/agentbuilder/experiments/$quality-approve           QUALITY_GATE_PENDING → QUALITY_GATE_APPROVED
POST   /api/agentbuilder/experiments/$enter-sandbox             QUALITY_GATE_APPROVED → UAT_TRAINING
POST   /api/agentbuilder/experiments/$approve                   UAT_TRAINING → PRODUCTION_APPROVED → MONITORING; optional ?sessionId= closes session
POST   /api/agentbuilder/experiments/$flag-for-improvement      MONITORING → IMPROVEMENT_CANDIDATE
POST   /api/agentbuilder/experiments/$retire                    Any → retired (is_active=false)

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
