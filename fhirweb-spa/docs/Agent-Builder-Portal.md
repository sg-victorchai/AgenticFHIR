# AgentBuilder Portal — Frontend Integration Guide

**Date:** 2026-10-08 (updated 2026-10-11: §7.A system prompt lifecycle; §7.B agent-created resources — live; §7.4.1a–b seed job examples; §7.5 poll response; eval score corrections §7.5.1; updated 2026-10-14: §8.5 Azure OpenAI model list; §11 rate-limit handling; model ID format note; §5.4 mid-session model switch; updated 2026-10-14: §6.1 ADAPT_FROM behaviour; §5.1 intendedUserRole values incl. CARE_MANAGER; §6.2 SSE normalizer behaviour; §7.2 fork copies name/description; updated 2026-10-15: §7.2 forked version active=true; updated 2026-10-15: §7.3 panel observations + HITL sim fields; §7.A.2a generate_system_prompt MCP tool; §7.C HITL comparison runs; §8.7 tenant terminology store; updated 2026-10-16: §7.A.2 clarify automated vs manual bootstrap paths; §7.3 + §7.C.1 scenarios are immutable — no update endpoint; updated 2026-10-16: §13.0 agentsandbox schema isolation safety requirement; updated 2026-10-16: §7.5 hitlSimConfig override at submit time; §7.5.1 per-criterion responseQuality breakdown; corrected queryCorrectness neutral explanation; corrected dataAccuracy HITL explanation; §10.3 QualityDimensions per-criterion fields; updated 2026-10-17: §3 persona detail — added roleValidation, completionCriteria, metadata fields; toolConfig.allowedResourceTypes is now a map with per-type defaultSearchParams; updated §10 field reference table and Annex A.1–A.2 examples; updated 2026-10-17: §7.3 scenarios now mutable — added PATCH endpoint and expectedWrites (gold bundle) field; §7.3.2 new Update Scenario section; §7.B.3 added direct resource-content endpoint; §7.5.1 scoring fixes — dataAccuracy neutral/weight redistribution; queryAndResponseOnly weights updated to 0.40/0.60; §7.C.1 removed immutable note)  
**Scope:** Complete REST API reference for the Agent Builder and Lifecycle Management portal

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Tenant Headers](#2-authentication--tenant-headers)
3. [Activity 1 — Browse Platform Personas](#3-activity-1--browse-platform-personas)
4. [Activity 2 — Browse User-Created Personas](#4-activity-2--browse-user-created-personas)
5. [Activity 3 — Authoring Sessions (Stop & Resume)](#5-activity-3--authoring-sessions-stop--resume)
   - [5.4 Switch Model Mid-Session](#switch-model-mid-session)
6. [Activity 4 — Author a New Persona](#6-activity-4--author-a-new-persona)
   - [6.1 Create an Authoring Session](#61-create-an-authoring-session)
   - [6.2 Send Message (SSE Stream)](#62-send-message-sse-stream)
   - [6.3 Phase 0 — Guided Authoring (FROM_SCRATCH sessions only)](#63-phase-0--guided-authoring-from_scratch-sessions-only)
7. [Activity 5 — Lifecycle Management, Experiment, Evaluate & Promote](#7-activity-5--lifecycle-management-experiment-evaluate--promote)
   - [7.1 Persona Lifecycle State Machine](#71-persona-lifecycle-state-machine)
   - [7.1.1 Session Review Endpoints ($approve / $quality-approve / $complete / $reject)](#711-session-review-endpoints)
   - [7.3 Create an Evaluation Scenario](#73-create-an-evaluation-scenario)
   - [7.3.1 Scoring Fields In Depth — responseCriteria, expectedQueryPatterns, generateRubric](#731-scoring-fields-in-depth--responsecriteria-expectedquerypatterns-generaterubric)
   - [7.4 Seed Eval Tenant (Step 1 of 2)](#74-seed-eval-tenant-step-1-of-2)
   - [7.4.1 Re-open Persona — Resume Seeded Data](#741-re-open-persona--resume-seeded-data)
   - [7.4.1a Complete Example — Reconstruct the Cohort View from the Most Recent Seed Job](#741a-complete-example--reconstruct-the-cohort-view-from-the-most-recent-seed-job)
   - [7.4.1b List Evaluation Runs for a Seed Job](#741b-list-evaluation-runs-for-a-seed-job)
   - [7.4.2 Browse Seeded Patients](#742-browse-seeded-patients)
   - [7.4.3 Get Patient Bundle](#743-get-patient-bundle)
   - [7.4.4 List Resource Types in Eval Sandbox](#744-list-resource-types-in-eval-sandbox)
   - [7.4.5 Get Resources by Type](#745-get-resources-by-type)
   - [7.5 Submit Evaluation Run (Step 2 of 2, Async)](#75-submit-evaluation-run-step-2-of-2-async)
   - [7.5.1 Understanding Evaluation Scores](#751-understanding-evaluation-scores)
   - [7.6 Tear Down Eval Tenant](#76-tear-down-eval-tenant-step-3--optional)
   - [7.8–7.14 Experiment Controller Lifecycle Transitions](#78-promote-draft--quality_gate_pending)
   - [7.A System Prompt Lifecycle — Initial Generation & Continuous Refinement](#7a-system-prompt-lifecycle--initial-generation--continuous-refinement)
   - [7.A.2a generate_system_prompt MCP Tool](#7a2a-generate_system_prompt-mcp-tool)
   - [7.B Agent-Created Resources — Viewing What the Persona Wrote](#7b-agent-created-resources--viewing-what-the-persona-wrote)
   - [7.C HITL Comparison Runs — Simulate Three Reviewer Strategies](#7c-hitl-comparison-runs--simulate-three-reviewer-strategies)
8. [Reference Endpoints — Formatters, Skills & Models](#8-reference-endpoints--formatters-and-skills)
   - [8.6 Assessment Tools (Clinical Scoring Catalog)](#86-assessment-tools-clinical-scoring-catalog)
   - [8.7 Tenant Terminology Store](#87-tenant-terminology-store)
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
| Assessment Tools        | `/api/agentbuilder/assessment-tools`           | Browse and import clinical scoring scale definitions              |
| Terminology             | `/api/agentbuilder/terminology`                | Manage tenant-specific clinical coding overrides (CRUD)           |
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
    "fhir_discover": {},
    "fhir_query": {
      "allowedResourceTypes": {
        "Patient": {},
        "Observation": {},
        "Condition": {},
        "DiagnosticReport": {},
        "MedicationRequest": {},
        "CarePlan": {},
        "Procedure": {},
        "AllergyIntolerance": {}
      }
    },
    "fhir_decomposer": {
      "allowedResourceTypes": {
        "Observation": {},
        "MedicationRequest": {},
        "Condition": {},
        "AllergyIntolerance": {},
        "Procedure": {},
        "Immunization": {}
      }
    },
    "fhir_mutate": {
      "allowedResourceTypes": {
        "Condition": {},
        "Observation": {},
        "DiagnosticReport": {},
        "MedicationRequest": {},
        "CarePlan": {},
        "ServiceRequest": {},
        "Bundle": {}
      }
    },
    "propose_plan": {},
    "request_intervention": {},
    "spawn_agent": {},
    "mission_complete": {}
  },

  "roleValidation": {
    "enforceAtActivation": true,
    "enforceAtMissionCreation": true,
    "enforceAtChannelBinding": true
  },

  "completionCriteria": [
    {
      "type": "agent-declared",
      "description": "Agent calls mission_complete after delivering the clinical assessment or after a write operation is committed, rejected, or cancelled."
    }
  ],

  "metadata": {
    "requiresDelegation": true,
    "preSkillIds": ["digital-twin-prefetch-patient-context"],
    "postSkillIds": [],
    "intended-user-role": "CLINICIAN"
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

| Field                 | Description                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `systemPrompt`        | Fully resolved system prompt text (loaded from `system-prompt-ref` at startup)                                                                                                                                                                           |
| `model`               | LLM provider (`bedrock`, `openai`, etc.), model alias, and fallback                                                                                                                                                                                      |
| `reasoningStrategy`   | `COT` (chain-of-thought) or `DIRECT`                                                                                                                                                                                                                     |
| `budget`              | Max iterations, tool calls per iteration, and timeout                                                                                                                                                                                                    |
| `memory`              | Episodic/semantic memory toggle and token budget                                                                                                                                                                                                         |
| `tools`               | Flat list of tool names enabled for the persona                                                                                                                                                                                                          |
| `toolConfig`          | Per-tool scope: `{toolName: {allowedResourceTypes: {Type: {defaultSearchParams: {...}}                                                                                                                                                                   | {}}, allowedOperations?, riskClass?, maxResults?}}`. `allowedResourceTypes`is a **map** (not a list) — keys are resource type names, values contain`defaultSearchParams`if the tool has default query constraints for that type, otherwise`{}`. Tools with no scope appear as `{}`. |
| `roleValidation`      | When persona role constraints are enforced: `enforceAtActivation` (true/false), `enforceAtMissionCreation` (true/false), `enforceAtChannelBinding` (true/false)                                                                                          |
| `completionCriteria`  | List of completion conditions the agent must satisfy. Each entry: `{type, expression?, description?}`. Common `type` value: `"agent-declared"` (agent calls `mission_complete`). Present only when the persona has explicit completion criteria defined. |
| `metadata`            | Full metadata map from the persona YAML: `requiresDelegation`, `preSkillIds`, `postSkillIds`, and any other persona-specific keys (e.g. `intended-user-role`). Pre/post skill IDs are also surfaced in the `skills` block with resolved definitions.     |
| `formatters`          | Formatter coverage: which resource types use persona-specific vs. default formatters (see §8.2)                                                                                                                                                          |
| `skills`              | Pre/post skill hooks with resolved definitions (see §8.3)                                                                                                                                                                                                |
| `params`              | Configurable mission parameters the user fills at launch (see §8.4)                                                                                                                                                                                      |
| `roleGuardrails`      | Inline safety rules block (present when `role-guardrails:` is defined directly in the YAML)                                                                                                                                                              |
| `guardrailProfileRef` | ID of the referenced guardrail profile file (present when `guardrail-profile-ref:` is set)                                                                                                                                                               |
| `guardrailProfile`    | Resolved guardrail profile: `{id, description, channel, evaluators[]}` — only present when `guardrailProfileRef` is set and the profile YAML exists                                                                                                      |
| `intendedUserRole`    | The clinical role this persona is designed for. Valid values: `PATIENT`, `CLINICIAN`, `CARE_COORDINATOR`, `CARE_MANAGER`, `RESEARCHER`, `ADMINISTRATOR`, `OPERATIONAL_STAFF`, `ANALYST`, `DEVELOPER`, `PLATFORM_OPERATOR`, `MULTI_ROLE`                  |

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

### Switch Model Mid-Session

Authoring can take a long time. Users may save their work-in-progress (WIP) and resume on a different day — possibly wanting to use a different model. Use this endpoint to switch the LLM model for any `IN_PROGRESS` or `AWAITING_REVIEW` session. Conversation history is preserved; the new model takes effect on the very next message.

```
PATCH /api/agentbuilder/sessions/{sessionId}/model
Authorization: Bearer <jwt>
Content-Type: application/json

{ "modelId": "gpt-6-luna" }
```

**Response — 200 OK:**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "selectedModelId": "gpt-6-luna",
  "message": "Model updated. Takes effect on the next message."
}
```

**Error responses:**

| Status          | Condition                                                                   |
| --------------- | --------------------------------------------------------------------------- |
| 400 Bad Request | `modelId` missing, blank, or not in the configured model list               |
| 403 Forbidden   | Caller is not the session owner                                             |
| 404 Not Found   | Session does not exist                                                      |
| 409 Conflict    | Session is not `IN_PROGRESS` or `AWAITING_REVIEW` (e.g. already `COMPLETE`) |

> **UX guidance:** Show a model selector dropdown in the chat header. After a successful PATCH, update the displayed model badge immediately. The very next SSE stream will use the new model — no session restart required. Valid model IDs come from `GET /api/agentbuilder/models`.

---

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

> **UX guidance:** On resume, render the `conversation` array from the `$resume` response into the chat window before the user types. Do NOT display the `$resume` response JSON itself — it is session metadata, not a chat message. Use `selected_model_id` to initialise the model selector dropdown in the chat header. If the user picks a different model, call `PATCH /{sessionId}/model` before (or instead of) sending the next message — see §5.4 Switch Model Mid-Session.

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

In `ADAPT_FROM` mode, Phase 0 is skipped entirely — the session jumps straight to Phase 1 (persona intent). The AI agent reads the source persona's existing YAML, presents a summary of its current configuration, and guides the user through the five authoring phases to make targeted changes. The portal should render `ADAPT_FROM` sessions the same as a Phase 0-complete `FROM_SCRATCH` session: no guided-intake UI, just a chat input ready to accept the user's first instruction.

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
  "selectedModelId": "gpt-6-astra",
  "description": "Care coordinator agent for identifying diabetic patients with care gaps"
}
```

> **Model ID format:** The value depends on the active provider. On Azure OpenAI (staging/production) model IDs are short deployment names such as `gpt-5.5`, `gpt-6-astra`, `gpt-6-luna`. On AWS Bedrock they are ARN-style strings such as `global.anthropic.claude-opus-4-8`. Always obtain valid IDs from `GET /api/agentbuilder/models` rather than hard-coding them.

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
| `token`    | Partial text string                          | Incremental response token — append to display. Text is backend-normalized (see below).                                                                                                                       |
| `step`     | Next `authoring_step` value, or empty string | Emitted after the last `token` and before `done`; tells the portal which Phase 0 step is now active. Empty string means Phase 0 is complete (switch to normal chat input). Omitted for `ADAPT_FROM` sessions. |
| `done`     | (empty)                                      | End of AI turn — ready for next user message                                                                                                                                                                  |
| `error`    | Error message string                         | Processing error                                                                                                                                                                                              |

> **Backend normalization:** The server applies `AgentResponseNormalizer` to every AI turn before streaming tokens and before persisting to conversation history. The following are stripped or rewritten before the first `token` event arrives:
>
> - Separator lines (`═══…`, `───`, `---`, `***`, `___`, box-drawing characters)
> - `Reply with one of: …` option blocks
> - Bare code-fence lines (` ``` ` or `~~~` without code content)
> - Empty blockquote markers (bare `>` lines used as fill-in placeholders)
> - Two-line `suggested: X` continuations are merged into the preceding label line
> - Consecutive blank lines collapsed to one
>
> The frontend does **not** need to strip these patterns. Render `token` data as Markdown directly.

**Example stream — Phase 0 in progress:**

```
event: token
data: **Step 2 of 6 — Proxy Questions**

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
- Buffer `token` events and render incrementally as Markdown; no client-side separator stripping needed
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
- `active`: `true`
- `authoringSource`: `portal`
- `ownerUserId`: resolved from bearer token
- `name`: copied from the source version
- `description`: copied from the source version

The `patchYaml` is applied on top of the source `definitionYaml` using a deep merge. It does not affect the `name` or `description` columns — to change those after forking, use `PATCH /api/agentbuilder/personas/{personaId}/versions/{version}` (§8.x).

---

### 7.3 Create an Evaluation Scenario

Before running an evaluation you must create a scenario that specifies the test data cohort and the mission input (parameters or conversation). Seeding happens in a separate step so the portal can show progress before the long-running eval begins.

> **Scenarios are mutable.** Use `PATCH /api/agentbuilder/scenarios/{scenarioId}` (§7.3.2) to update any field after creation — including adding an `expectedWrites` gold bundle or tuning `hitlSimConfig`.

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
    "description": "20 diabetic patients: 10 with recent HbA1c, 10 without; 2 exceed 8%. Groups include medications, allergies, procedures, and encounters.",
    "cohortGroups": [
      {
        "label": "diabetic, controlled HbA1c (le 8%)",
        "count": 8,
        "conditionCodes": ["73211009"],
        "observationConstraints": [
          { "loincCode": "4548-4", "daysBack": 180, "comparator": "le", "value": 8.0 }
        ],
        "medicationRequests": [
          { "medicationCode": "372567009", "status": "active", "daysBack": 90 }
        ],
        "allergyIntoleranceCodes": ["372687004"],
        "procedureCodes": ["313191000119107"],
        "serviceRequests": [],
        "createEncounter": true,
        "createCarePlan": false
      },
      {
        "label": "diabetic, poor HbA1c control (gt 8%)",
        "count": 2,
        "conditionCodes": ["73211009"],
        "observationConstraints": [
          { "loincCode": "4548-4", "daysBack": 180, "comparator": "gt", "value": 8.0 }
        ],
        "medicationRequests": [
          { "medicationCode": "372567009", "status": "active", "daysBack": 30 }
        ],
        "allergyIntoleranceCodes": ["372687004"],
        "procedureCodes": [],
        "serviceRequests": [
          { "serviceCode": "103735009", "status": "active" }
        ],
        "createEncounter": true,
        "createCarePlan": true
      },
      {
        "label": "diabetic, no recent HbA1c",
        "count": 10,
        "conditionCodes": ["73211009"],
        "noObservations": true,
        "medicationRequests": [],
        "allergyIntoleranceCodes": [],
        "procedureCodes": [],
        "serviceRequests": [],
        "createEncounter": false,
        "createCarePlan": false
      }
    ],
    "expectedCohortSize": 20
  },

  "missionParams": {
    "patientCohortFilter": "missing-hba1c-6mo",
    "maxResults": 50
  },

  "responseCriteria": [
    "Correctly identifies patients with missing HbA1c in the last 6 months",
    "Recommends a specific follow-up action for each identified patient",
    "Summarises the cohort size accurately"
  ],

  "expectedQueryPatterns": [
    { "resourceType": "Patient", "expectedParams": {} },
    { "resourceType": "Observation", "expectedParams": { "code": "4548-4" } }
  ],

  "generateRubric": false
}
```

**Note on `responseCriteria` vs `generateRubric`:** You can either write `responseCriteria` yourself (set `generateRubric: false`) or let the LLM auto-derive them from the persona definition (`generateRubric: true`, the default). Providing your own criteria produces more precise evaluation — auto-generated criteria are a good starting point but tend to be generic. If you supply `responseCriteria` in the request body, `generateRubric` is automatically set to `false`.

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

> **UX guidance:** Present this as a 4-step wizard:
>
> 1. **Name and type** — `scenarioName`, `scenarioType`, `personaId`
> 2. **Mission input** — `missionParams` (parameter-driven) or `conversationScript` (chat)
> 3. **Test data cohort** — describe in plain English and map to `CohortGroup` entries in `seedSpec`
> 4. **Scoring configuration** — `responseCriteria` (or `generateRubric: true` for auto), `expectedQueryPatterns`, and `expectedWrites` (gold bundle)
>
> **Step 4 defaults:** `generateRubric: true` is pre-selected. `expectedQueryPatterns` and `expectedWrites` are optional and skippable — most users should skip `expectedWrites` on the first scenario creation and set it later via the **"Set as Gold Bundle"** shortcut on the run result panel (see §7.B.4). Show `expectedWrites` only when the persona's `toolConfig` includes `fhir_mutate`; hide it for query-only personas.
>
> Store the returned `scenarioId` — it is required for the seeding step (§7.4).

**Field descriptions:**

| Field                   | Required            | Description                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personaId`             | Yes                 | Persona this scenario tests                                                                                                                                                                                                                                                                                                                                                                              |
| `scenarioName`          | Yes                 | Human-readable name                                                                                                                                                                                                                                                                                                                                                                                      |
| `scenarioType`          | Yes                 | `AGENT`, `DATA_PIPELINE`, or `DATA_PIPELINE_ETL`                                                                                                                                                                                                                                                                                                                                                         |
| `seedSpec`              | Recommended         | Cohort descriptor for auto-generated FHIR test data; seeded in Step 1 before eval submit                                                                                                                                                                                                                                                                                                                 |
| `missionParams`         | Conditional         | Typed params for parameter-driven personas (mutually exclusive with `conversationScript`)                                                                                                                                                                                                                                                                                                                |
| `conversationScript`    | Conditional         | Free-text turns for chat personas (mutually exclusive with `missionParams`)                                                                                                                                                                                                                                                                                                                              |
| `responseCriteria`      | No                  | List of strings the LLM judge scores the persona response against. When provided, `generateRubric` is automatically `false`.                                                                                                                                                                                                                                                                             |
| `expectedQueryPatterns` | No                  | List of `{resourceType, expectedParams}` objects the query checker uses. Each pattern is checked for coverage against the queries the persona actually issued.                                                                                                                                                                                                                                           |
| `expectedWrites`        | No                  | **Gold bundle** — a FHIR collection Bundle listing the resourceTypes the agent is expected to create. Used for `dataAccuracy` scoring. If omitted, `dataAccuracy` is neutral (0.5) and its weight is redistributed across the other scoring dimensions. See §7.3.1 and §7.5.1 for scoring details. Can be added or changed after creation via `PATCH /api/agentbuilder/scenarios/{scenarioId}` (§7.3.2). |
| `generateRubric`        | No (default `true`) | Auto-generate `responseCriteria` from persona definition via LLM. Ignored when `responseCriteria` is supplied directly.                                                                                                                                                                                                                                                                                  |
| `hitlSimConfig`         | No                  | Declarative HITL simulation config. When present, `$submit-hitl-comparison` uses this to synthesize reviewer responses instead of a hand-written `hitlScript`. See §7.C.                                                                                                                                                                                                                                 |
| `hitlStrategyGoldSets`  | No                  | Per-strategy expected write bundles for HITL comparison scoring. Keys: `"approve"`, `"reject"`, `"refine"`. When a key is present, the corresponding run uses that bundle for `dataAccuracy` scoring; missing keys fall back to the scenario's base `expectedWrites`.                                                                                                                                    |

**`CohortGroup` field reference:**

| Field                     | Type     | Description                                                                                                                            |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                   | string   | Human-readable label for the group (used in logs and UI)                                                                               |
| `count`                   | int      | Number of patients to generate for this group                                                                                          |
| `patientProfile`          | object?  | Optional demographic constraints for generated `Patient` resources — age range, gender, address. See `PatientProfile` reference below. |
| `conditionCodes`          | string[] | SNOMED CT codes — one `Condition` resource generated per code per patient                                                              |
| `observationConstraints`  | object[] | LOINC-coded lab values; each entry: `{ loincCode, daysBack, comparator, value, unit?, components? }`                                   |
| `noObservations`          | boolean  | When `true`, no `Observation` resources are created for this group                                                                     |
| `medicationRequests`      | object[] | Active/completed drug orders; each entry: `{ medicationCode, status, daysBack }`                                                       |
| `allergyIntoleranceCodes` | string[] | SNOMED CT codes — one `AllergyIntolerance` resource per code per patient                                                               |
| `procedureCodes`          | string[] | SNOMED CT codes — one `Procedure` resource (status `completed`) per code per patient                                                   |
| `serviceRequests`         | object[] | Pending/active orders; each entry: `{ serviceCode, status }`                                                                           |
| `createEncounter`         | boolean  | When `true`, one `Encounter` resource (status `finished`) is created per patient                                                       |
| `createCarePlan`          | boolean  | When `true`, one `CarePlan` resource (status `draft`) is created per patient                                                           |

**`ObservationConstraint` extended fields:**

| Field        | Type      | Description                                                                                                                                                                                                                                                 |
| ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loincCode`  | string    | Panel or single-value LOINC code                                                                                                                                                                                                                            |
| `daysBack`   | int       | How far in the past to date the observation                                                                                                                                                                                                                 |
| `comparator` | string    | `gt` / `lt` / `ge` / `le` / `eq` — seeded value satisfies this (e.g. `gt 8.0` → value 8.5)                                                                                                                                                                  |
| `value`      | number    | Threshold value                                                                                                                                                                                                                                             |
| `unit`       | string?   | Optional UCUM unit for single-value observations (e.g. `"%"`, `"mmHg"`)                                                                                                                                                                                     |
| `components` | object[]? | When present, generates a **panel** Observation with `Observation.component[]` instead of `valueQuantity`. Each component: `{ loincCode, display, comparator, value, unit }`. When `components` is non-null the top-level `comparator`/`value` are ignored. |

**Panel observation example** — blood pressure with systolic and diastolic components:

```json
{
  "loincCode": "85354-9",
  "daysBack": 30,
  "comparator": "gt",
  "value": 0.0,
  "components": [
    {
      "loincCode": "8480-6",
      "display": "Systolic BP",
      "comparator": "gt",
      "value": 140.0,
      "unit": "mmHg"
    },
    {
      "loincCode": "8462-4",
      "display": "Diastolic BP",
      "comparator": "gt",
      "value": 90.0,
      "unit": "mmHg"
    }
  ]
}
```

The seeder generates one `Observation` with `code.coding[0].code = "85354-9"` and `component[]` containing both systolic and diastolic entries. No top-level `valueQuantity` is included (FHIR BP panel convention).

**`PatientProfile` field reference** (optional — omit the entire object to use defaults):

Use `patientProfile` inside a `CohortGroup` when the persona under test filters patients by demographic attributes (age, sex, location). Without it the seeder generates patients born in 1970 with alternating male/female gender and no address, which means demographic-based search params will produce unpredictable results during evaluation.

| Field     | Type    | Description                                                                                                                                                                             |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minAge`  | int?    | Minimum age in years (inclusive). The seeder distributes ages evenly across [`minAge`, `maxAge`].                                                                                       |
| `maxAge`  | int?    | Maximum age in years (inclusive). Defaults to `minAge + 10` when only `minAge` is set.                                                                                                  |
| `gender`  | string? | FHIR `Patient.gender` value: `"male"`, `"female"`, `"other"`, or `"unknown"`. When `null`, patients alternate male/female.                                                              |
| `address` | object? | Optional address written to `Patient.address[0]`. Sub-fields: `city`, `state`, `postalCode`, `country` — all optional strings. Include only the fields the persona actually filters on. |

All fields are optional. Fields that are `null` or omitted are not written to the generated `Patient` resource, so queries against those fields will not match — use only the fields your persona actually searches on.

**PatientProfile example** — elderly female patients in Singapore for a geriatric-care persona:

```json
{
  "label": "elderly female, diabetic, Singapore",
  "count": 10,
  "patientProfile": {
    "minAge": 65,
    "maxAge": 85,
    "gender": "female",
    "address": { "city": "Singapore", "country": "SG" }
  },
  "conditionCodes": ["73211009"],
  "observationConstraints": [
    { "loincCode": "4548-4", "daysBack": 180, "comparator": "gt", "value": 7.0 }
  ],
  "createEncounter": true,
  "createCarePlan": false
}
```

The seeder will generate 10 `Patient` resources with `gender = "female"`, birth dates distributed across ages 65–85 (e.g. patient 0 → age 65, patient 9 → age 85), and `address[0]` with `city = "Singapore"` and `country = "SG"`.

> **UX guidance:** Surface `patientProfile` in the cohort builder as an expandable "Patient Demographics" panel. Mark it as optional but add a hint: _"Required if the persona filters patients by age, sex, or address."_ Show the `minAge`/`maxAge` as a range slider and `gender` as a radio group (`Any / Male / Female / Other`). The `address` object (city, state, postal code, country) can be a collapsible sub-section — most scenarios leave it blank.

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

Returns the full scenario including `seedSpec`, `missionParams`, `conversationScript`, `responseCriteria`, `expectedQueryPatterns`, `expectedWrites` (gold bundle), and `scoreWeights` as parsed objects.

---

### 7.3.1 Scoring Fields In Depth — `responseCriteria`, `expectedQueryPatterns`, `expectedWrites`, `generateRubric`

These three fields determine how meaningful the eval scores are. Understanding them is key to getting useful evaluation results.

#### `generateRubric` — Auto-Generated Baseline

When `generateRubric: true` (the default and the quickest option), the server takes the first ~800 characters of the persona's definition YAML and sends it to the LLM with the prompt: _"Generate 3–5 evaluation criteria for this agent."_

For **hypertension-ccm**, the LLM might return something like:

```json
[
  "The response correctly addresses the user's question.",
  "The response does not hallucinate patient data not present in the context.",
  "The response follows the persona's stated guardrails."
]
```

These are a reasonable starting point but **generic by nature** — the LLM only sees the persona header, not the full clinical rules. Vague criteria ("correctly addresses the question") are hard for the LLM judge to score objectively, which leads to uncertain, mid-range scores.

**Use `generateRubric: true` to bootstrap a new persona quickly. Replace the criteria with hand-written ones once you know what the persona should do.**

---

#### `responseCriteria` — What Makes a Good Response

These are the specific, measurable statements the LLM judge checks the persona's response against. Each criterion is scored **0.0–1.0** independently, then averaged to produce the **Response Quality %**.

**How the LLM judge uses them:**

```
System: You are an evaluator. For each criterion, assign a score 0.0–1.0.
        Respond ONLY with {"scores": [score1, score2, ...]}

User:   Criteria:
        1. Retrieves and correctly states the patient's most recent blood pressure reading
        2. Lists all current antihypertensive medications by name
        3. Identifies whether blood pressure exceeds the treatment target (130/80 mmHg)
        4. Recommends a specific next action: medication adjustment, lifestyle change, or referral
        5. Does not include clinical data not present in the patient's FHIR record

        Agent response:
        "Patient Jane Doe (DOB 1965-03-12) has a most recent BP of 145/92 mmHg recorded
         2026-09-28. She is currently on amlodipine 5mg daily. Her BP exceeds the 130/80
         target. Recommendation: titrate amlodipine to 10mg and schedule a follow-up in
         4 weeks."

Response: {"scores": [1.0, 1.0, 1.0, 1.0, 1.0]}
→ Response Quality = 100%
```

**Sample `responseCriteria` for hypertension-ccm:**

```json
"responseCriteria": [
  "Retrieves and correctly states the patient's most recent blood pressure reading",
  "Lists all current antihypertensive medications by name",
  "Identifies whether blood pressure exceeds the treatment target (130/80 mmHg)",
  "Recommends a specific next action: medication adjustment, lifestyle change, or specialist referral",
  "Does not include clinical data not present in the patient's FHIR record"
]
```

**Writing good criteria — rules of thumb:**

| Do                                                         | Don't                                 |
| ---------------------------------------------------------- | ------------------------------------- |
| "States the systolic value numerically"                    | "Provides blood pressure information" |
| "Recommends titrating amlodipine when systolic > 140"      | "Gives appropriate medication advice" |
| "Does not fabricate lab values"                            | "Is accurate"                         |
| "Identifies the primary hypertension SNOMED code 38341003" | "Uses correct codes"                  |

The more specific the criterion, the more deterministic the LLM judge's score — and the more useful the percentage becomes for comparing persona versions.

---

#### `expectedQueryPatterns` — Did the Persona Query the Right Data?

These define the FHIR queries the persona **must issue** to answer the question correctly. The **Query Correctness %** is the fraction of defined patterns that were actually covered.

**How the query checker uses them:**

Each pattern has a `resourceType` and a map of `expectedParams`. A pattern is _covered_ when the persona issued at least one query to that resource type containing all the expected parameter key-value pairs (substring match on values).

**Without patterns defined** → Query Correctness = **50% (neutral)** regardless of what the persona queried.
**With patterns defined** → Query Correctness = `covered patterns / total patterns × 100%`.

**Sample `expectedQueryPatterns` for hypertension-ccm:**

```json
"expectedQueryPatterns": [
  {
    "resourceType": "Patient",
    "expectedParams": {}
  },
  {
    "resourceType": "Observation",
    "expectedParams": { "code": "85354-9" }
  },
  {
    "resourceType": "Condition",
    "expectedParams": { "code": "38341003" }
  },
  {
    "resourceType": "MedicationRequest",
    "expectedParams": {}
  }
]
```

**Scoring example:** The persona queries Patient ✓, Observation with BP code ✓, MedicationRequest ✓, but never queries Condition.
→ 3 of 4 patterns covered → Query Correctness = **75%**

The patterns catch regressions: if a new persona version stops querying blood pressure observations (e.g. because the system prompt changed), the score drops from 75% to 50% automatically.

---

#### `expectedWrites` — Gold Bundle for Data Accuracy Scoring

The gold bundle specifies the FHIR resource types the agent is **expected to create** during the evaluation run. The scorer compares the agent's actual write operations against this bundle using **ID-agnostic, count-based recall**.

**Format:** a FHIR `collection` Bundle with one entry per expected resource type. Only `resourceType` matters — IDs and other fields are ignored by the matcher.

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [{ "resource": { "resourceType": "CarePlan" } }]
}
```

This gold bundle says: "the agent must create at least one `CarePlan`."

**Scoring formula:**

```
recall = min(goldCount, agentCreatedCount) / goldCount
```

| Gold bundle                           | Agent created                | dataAccuracy                        |
| ------------------------------------- | ---------------------------- | ----------------------------------- |
| 1 CarePlan                            | 0 CarePlans                  | 0.0 (wrote nothing)                 |
| 1 CarePlan                            | 1 CarePlan                   | 1.0 ✓                               |
| 1 CarePlan                            | 2 CarePlans                  | 1.0 ✓ (extra writes don't penalise) |
| 2 entries (CarePlan + ServiceRequest) | 1 CarePlan, 0 ServiceRequest | 0.5                                 |

**When `expectedWrites` is absent:**

- `dataAccuracy` is set to a **neutral 0.5**
- Its weight is **redistributed** proportionally across `queryCorrectness` and `responseQuality`
- For the default `agentWithWrites` preset `{da:0.5, qc:0.2, rq:0.3}`, redistribution produces effective weights `{da:0, qc:0.4, rq:0.6}` — identical to the `queryAndResponseOnly` preset

**Setting the gold bundle after creation:**

Use the PATCH endpoint (§7.3.2) — you do not need to recreate the scenario:

```
PATCH /api/agentbuilder/scenarios/{scenarioId}
{
  "expectedWrites": {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [
      { "resource": { "resourceType": "CarePlan" } }
    ]
  }
}
```

> **UX flow — skip → discover → lock in:**
>
> The recommended path has three stages:
>
> **Stage 1 — Skip (first scenario creation):** In wizard Step 4, `expectedWrites` is optional. Most users don't yet know what the agent will write. Leave it blank and submit. `dataAccuracy` will score as neutral (0.5) on the first run, which is harmless.
>
> **Stage 2 — Discover (after first run):** When the run completes, `createdResources` lists exactly what the agent wrote. The run result panel shows a **"Set as Gold Bundle"** prompt:
>
> ```
> Agent created: CarePlan ×2
> [ Set CarePlan as expected output → ]
> ```
>
> Clicking it calls `PATCH /api/agentbuilder/scenarios/{scenarioId}` with the `expectedWrites` bundle derived from the unique resource types in `createdResources`. From this point all subsequent runs score `dataAccuracy` against the gold bundle.
>
> **Stage 3 — Lock in (ongoing):** The scenario detail view shows the current gold bundle with an **Edit** button. Use it to add or remove resource types as the persona evolves (e.g. adding a ServiceRequest entry when the persona gains a new capability).
>
> **Wizard Step 4 field:** Show a FHIR resourceType multi-select. Each selected type maps to one `entry`. Display a summary line — "Agent must create: CarePlan × 1" — so users understand the requirement at a glance. Show this field only when the persona's `toolConfig` includes `fhir_mutate`; hide it for query-only personas.

---

#### Complete Scenario Creation for hypertension-ccm

Putting it all together — the recommended scenario for hypertension-ccm with hand-written criteria:

```json
POST /api/agentbuilder/scenarios
{
  "personaId": "hypertension-ccm",
  "scenarioName": "Hypertension CCM — BP Management Review",
  "scenarioType": "AGENT",

  "seedSpec": {
    "description": "15 hypertensive patients: 8 with controlled BP (le 130/80), 5 uncontrolled (gt 140/90), 2 newly diagnosed with no medication.",
    "cohortGroups": [
      {
        "label": "controlled hypertension",
        "count": 8,
        "conditionCodes": ["38341003"],
        "observationConstraints": [
          { "loincCode": "85354-9", "daysBack": 90, "comparator": "le", "value": 130 }
        ],
        "medicationRequests": [
          { "medicationCode": "386864001", "status": "active", "daysBack": 180 }
        ],
        "createEncounter": true,
        "createCarePlan": false
      },
      {
        "label": "uncontrolled hypertension",
        "count": 5,
        "conditionCodes": ["38341003"],
        "observationConstraints": [
          { "loincCode": "85354-9", "daysBack": 90, "comparator": "gt", "value": 140 }
        ],
        "medicationRequests": [
          { "medicationCode": "386864001", "status": "active", "daysBack": 60 }
        ],
        "createEncounter": true,
        "createCarePlan": true
      },
      {
        "label": "newly diagnosed, no medication",
        "count": 2,
        "conditionCodes": ["38341003"],
        "observationConstraints": [
          { "loincCode": "85354-9", "daysBack": 30, "comparator": "gt", "value": 140 }
        ],
        "medicationRequests": [],
        "createEncounter": true,
        "createCarePlan": false
      }
    ],
    "expectedCohortSize": 15
  },

  "missionParams": {
    "reviewScope": "all-active-patients",
    "bpTarget": "130/80"
  },

  "responseCriteria": [
    "Retrieves and correctly states the patient's most recent blood pressure reading",
    "Lists all current antihypertensive medications by name",
    "Identifies whether blood pressure exceeds the treatment target (130/80 mmHg)",
    "Recommends a specific next action: medication adjustment, lifestyle change, or specialist referral",
    "Does not include clinical data not present in the patient's FHIR record"
  ],

  "expectedQueryPatterns": [
    { "resourceType": "Patient",           "expectedParams": {} },
    { "resourceType": "Observation",       "expectedParams": { "code": "85354-9" } },
    { "resourceType": "Condition",         "expectedParams": { "code": "38341003" } },
    { "resourceType": "MedicationRequest", "expectedParams": {} }
  ],

  "generateRubric": false
}
```

> **When to use `generateRubric: true`:** First run with a brand-new persona — it gives you a quick baseline score with zero effort. Then call `GET /scenarios/{id}` to see what criteria were generated, refine them, and use `PATCH /scenarios/{id}` (§7.3.2) to update the criteria in place with `generateRubric: false` and your improved `responseCriteria`.

#### Score Interpretation for hypertension-ccm

| Score                   | What it means for hypertension-ccm                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Response Quality < 60%  | Persona is missing key clinical data (BP reading, medications, or target threshold) or hallucinating                                      |
| Response Quality 60–80% | Persona provides the data but recommendation is vague or missing                                                                          |
| Response Quality > 80%  | Persona correctly reads data, assesses target, and gives a specific action                                                                |
| Query Correctness < 75% | Persona is not querying BP observations or medication records — a likely regression                                                       |
| Query Correctness = 50% | No `expectedQueryPatterns` defined — score is neutral, add patterns to get a real signal                                                  |
| Overall score           | `queryCorrectness × 0.40 + responseQuality × 0.60` (using `queryAndResponseOnly` preset — no writes expected; weights updated 2026-10-17) |

---

### 7.3.2 Update an Existing Scenario (PATCH)

Scenarios can be updated at any time using a partial PATCH. Only the fields present in the request body are changed — omitted fields are left unchanged.

```
PATCH /api/agentbuilder/scenarios/{scenarioId}
Authorization: Bearer <jwt>
Content-Type: application/json
```

**Updatable fields:**

| Field                   | Notes                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `scenarioName`          | Rename without recreating the scenario                                                                        |
| `seedSpec`              | Update the cohort definition before the next seed run                                                         |
| `missionParams`         | Change parameter values for parameter-driven personas                                                         |
| `conversationScript`    | Update the chat turns for chat personas                                                                       |
| `responseCriteria`      | Replace auto-generated criteria with hand-written ones (set `generateRubric` to `false` separately if needed) |
| `expectedQueryPatterns` | Add or change FHIR query coverage checks                                                                      |
| `expectedWrites`        | **Add or replace the gold bundle** for `dataAccuracy` scoring                                                 |
| `scoreWeights`          | Override the default scoring weight distribution                                                              |

**Example — add a gold bundle to an existing scenario:**

```json
PATCH /api/agentbuilder/scenarios/b4740296-e701-4554-90d7-e681355d1a7e

{
  "expectedWrites": {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [
      { "resource": { "resourceType": "CarePlan" } }
    ]
  }
}
```

**Example — replace auto-generated criteria with hand-written ones:**

```json
PATCH /api/agentbuilder/scenarios/b4740296-e701-4554-90d7-e681355d1a7e

{
  "responseCriteria": [
    "Identifies diabetic patients with care gaps (missing recent HbA1c test or poor glycemic control despite testing)",
    "Creates or proposes a care plan for the identified at-risk diabetic patients"
  ]
}
```

**Example — override score weights:**

```json
PATCH /api/agentbuilder/scenarios/b4740296-e701-4554-90d7-e681355d1a7e

{
  "scoreWeights": {
    "dataAccuracy": 0.5,
    "queryCorrectness": 0.2,
    "responseQuality": 0.3,
    "fileAccuracy": 0.0
  }
}
```

**Response — 200 OK:** returns the full updated scenario detail (same shape as `GET /scenarios/{id}`).

**Response — 404 Not Found:** scenario not found.

**Response — 400 Bad Request:** malformed JSON in a patch field.

> **UX guidance:** Add an "Edit" button to the scenario detail view that opens an inline panel. Show only the fields the user is likely to change: Scenario Name, Response Criteria, Expected Writes (gold bundle), and Score Weights. Use a JSON editor for `seedSpec`/`missionParams` if advanced editing is needed. After a successful PATCH, refresh the scenario detail in the portal to show the updated values.

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
  "seededCounts": {
    "Patient": 20,
    "Condition": 20,
    "Observation": 10,
    "MedicationRequest": 10,
    "AllergyIntolerance": 10,
    "Procedure": 8,
    "ServiceRequest": 2,
    "Encounter": 10,
    "CarePlan": 2
  },
  "errorMessage": null
}
```

> **Note on `seededCounts` keys:** Keys use the FHIR resource type name exactly as returned by the server (e.g. `"Patient"`, `"MedicationRequest"`). Keys absent from the map means zero resources of that type were seeded for this scenario.

Possible `seedStatus` values: `PENDING` → `SEEDING` → `COMPLETED` | `FAILED` | `TORN_DOWN`.

**Hard limit:** Total patients across all cohort groups is capped at **1000** by default (configurable via `fhir4java.eval.seed.max-patients` in `application.yml`). The limit is enforced synchronously before the job is created — a request over the limit gets a 400 immediately.

> **UX guidance:** Store `seedJobId` in local state after `$seed`. When the user returns to the Evaluation tab, call `GET /eval/seed/{seedJobId}` to restore status. Show a progress indicator while `PENDING` or `SEEDING`; display `seededCounts` as a resource-type breakdown once `COMPLETED`. Only enable the "Submit Eval Run" button and "Browse Patients" button after `COMPLETED`.

---

### 7.4.1 Re-open Persona — Resume Seeded Data

When a user closes and later re-opens a persona in the portal, seed jobs are **not lost**. All completed seed jobs are persisted in the database and can be retrieved at any time using the scenario ID.

**Resume flow after re-opening a persona:**

1. `GET /api/agentbuilder/scenarios?personaId=<id>` — find the existing scenario
2. `GET /api/agentbuilder/experiments/eval/seed?scenarioId=<id>` — list prior seed jobs
3. Find the most recent `COMPLETED` job and use its `evalTenantId` for eval submission
4. Optionally click a patient ID to inspect the seeded data before submitting

```
GET /api/agentbuilder/experiments/eval/seed?scenarioId=b3c4d5e6-...
Authorization: Bearer <jwt>
```

**Response — 200 OK (list of seed jobs, newest first):**

```json
[
  {
    "seedJobId": "c4d5e6f7-...",
    "evalTenantId": "eval-a1b2c3d4-...",
    "seedStatus": "COMPLETED",
    "seededCounts": {
      "Patient": 20,
      "Condition": 20,
      "Observation": 10,
      "MedicationRequest": 10,
      "AllergyIntolerance": 10,
      "Procedure": 8,
      "ServiceRequest": 2,
      "Encounter": 10,
      "CarePlan": 2
    },
    "patientCount": 20,
    "errorMessage": null,
    "createdAt": "2026-10-04T10:00:00Z",
    "updatedAt": "2026-10-04T10:01:30Z"
  }
]
```

| Field          | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `seedJobId`    | Unique ID for the seed job; pass to patient browse endpoints |
| `evalTenantId` | Isolated tenant for this seeding run; pass to `$submit`      |
| `seedStatus`   | `PENDING` / `SEEDING` / `COMPLETED` / `FAILED` / `TORN_DOWN` |
| `seededCounts` | Per-resource-type breakdown of created resources             |
| `patientCount` | Convenience count derived from the seeded patient ID list    |
| `createdAt`    | When the seed job was created (ISO-8601)                     |
| `updatedAt`    | When the seed job was last updated (ISO-8601)                |

> **UX guidance:** On persona re-open, call this endpoint to show a "Previous Eval Data" card. If a `COMPLETED` job exists, show the `seededCounts` summary, the `patientCount`, and enable "Browse Patients" and "Submit Eval" actions directly — no re-seeding needed.

---

### 7.4.1a Complete Example — Reconstruct the Cohort View from the Most Recent Seed Job

This walkthrough shows the exact three API calls the portal makes to display a cohort summary panel from the most recent seed job, using `hypertension-ccm` as the concrete example.

#### Step 1 — Find the most recent seed job for the scenario

```
GET /api/agentbuilder/experiments/eval/seed?scenarioId=8dfd4130-0552-4e37-94b6-327f0e6e23ad
Authorization: Bearer <jwt>
```

**Response — 200 OK (newest first):**

```json
[
  {
    "seedJobId": "e3a91c02-7f44-4b1d-b8d3-9c0f1e2a3b4c",
    "scenarioId": "8dfd4130-0552-4e37-94b6-327f0e6e23ad",
    "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
    "seedStatus": "COMPLETED",
    "seededCounts": {
      "Patient": 33,
      "Condition": 33,
      "Observation": 86,
      "MedicationRequest": 20
    },
    "patientCount": 33,
    "errorMessage": null,
    "createdAt": "2026-10-11T09:30:00Z",
    "updatedAt": "2026-10-11T09:31:45Z"
  },
  {
    "seedJobId": "d2b80b01-6e33-4a0c-a7c2-8b9e0d1f2a3b",
    "scenarioId": "8dfd4130-0552-4e37-94b6-327f0e6e23ad",
    "evalTenantId": "eval-aabbcc11-...",
    "seedStatus": "TORN_DOWN",
    "seededCounts": {
      "Patient": 33,
      "Condition": 33,
      "Observation": 86,
      "MedicationRequest": 20
    },
    "patientCount": 33,
    "createdAt": "2026-10-10T14:00:00Z",
    "updatedAt": "2026-10-10T16:00:00Z"
  }
]
```

Take the **first** item (index 0) — it is the most recent. Pick it only if `seedStatus = "COMPLETED"`. Record:

- `seedJobId` = `e3a91c02-...` — used for patient browse and resource inspect calls
- `scenarioId` = `8dfd4130-...` — used in the next step
- `evalTenantId` = `eval-ddcd635b-...` — passed to `$submit`

#### Step 2 — Load the scenario to get cohort group definitions

```
GET /api/agentbuilder/scenarios/8dfd4130-0552-4e37-94b6-327f0e6e23ad
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "scenarioId": "8dfd4130-0552-4e37-94b6-327f0e6e23ad",
  "scenarioName": "Hypertension CCM – Uncontrolled vs Borderline",
  "scenarioType": "AGENT_MISSION",
  "personaId": "hypertension-ccm",
  "hasSeedSpec": true,
  "hasMissionParams": false,
  "hasConversation": true,
  "rubricGenerated": true,
  "createdAt": "2026-10-08T08:00:00Z",
  "updatedAt": "2026-10-08T08:00:00Z",
  "seedSpec": {
    "description": "33 hypertension patients: 5 uncontrolled (BP≥140, no medication), 8 borderline (BP 130–139, no medication), 20 already managed (active MedicationRequest).",
    "expectedCohortSize": 13,
    "cohortGroups": [
      {
        "label": "Group A — uncontrolled, no medication",
        "count": 5,
        "conditionCodes": ["38341003"],
        "observationConstraints": [
          {
            "loincCode": "8480-6",
            "daysBack": 30,
            "comparator": "ge",
            "value": 140.0
          }
        ],
        "medicationRequests": [],
        "noObservations": false
      },
      {
        "label": "Group B — borderline, no medication",
        "count": 8,
        "conditionCodes": ["38341003"],
        "observationConstraints": [
          {
            "loincCode": "8480-6",
            "daysBack": 30,
            "comparator": "ge",
            "value": 130.0
          }
        ],
        "medicationRequests": [],
        "noObservations": false
      },
      {
        "label": "Already managed",
        "count": 20,
        "conditionCodes": ["38341003"],
        "observationConstraints": [],
        "medicationRequests": [
          { "medicationCode": "17767", "status": "active", "daysBack": 90 }
        ],
        "noObservations": false
      }
    ]
  },
  "missionParams": null,
  "conversationScript": [
    {
      "role": "user",
      "content": "Review all hypertension patients and create care interventions for those without active medication."
    }
  ],
  "responseCriteria": [
    "Correctly identifies patients without active MedicationRequest",
    "Creates MedicationRequest (Amlodipine) for Group A patients with BP ≥ 140",
    "Creates CarePlan (Hypertension Lifestyle Management) for Group B patients with BP 130–139",
    "Does not modify the 20 already-managed patients"
  ],
  "expectedQueryPatterns": [
    {
      "resourceType": "Condition",
      "params": { "code": "http://snomed.info/sct|38341003" }
    },
    { "resourceType": "MedicationRequest", "params": { "status": "active" } },
    {
      "resourceType": "Observation",
      "params": { "code": "http://loinc.org|8480-6" }
    }
  ]
}
```

#### Step 3 — Verify resource counts in the sandbox

Cross-check the seeded counts against expected cohort sizes before submitting the eval:

```
GET /api/agentbuilder/experiments/eval/seed/e3a91c02-7f44-4b1d-b8d3-9c0f1e2a3b4c/resources
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
  "seedStatus": "COMPLETED",
  "totalResources": 152,
  "resourceTypes": [
    { "resourceType": "Patient", "count": 33 },
    { "resourceType": "Condition", "count": 33 },
    { "resourceType": "Observation", "count": 86 },
    { "resourceType": "MedicationRequest", "count": 20 }
  ]
}
```

#### How to render the cohort summary panel

Combine `seedSpec.cohortGroups` (from step 2) with `seededCounts` (from step 1) to build the table:

| Group                                 | Expected | Seeded                 | Conditions      | Observations                               | Medications                      |
| ------------------------------------- | -------- | ---------------------- | --------------- | ------------------------------------------ | -------------------------------- |
| Group A — uncontrolled, no medication | 5        | 5 (from Patient count) | SNOMED 38341003 | Systolic BP (8480-6) ≥ 140 in past 30 days | None                             |
| Group B — borderline, no medication   | 8        | 8                      | SNOMED 38341003 | Systolic BP (8480-6) ≥ 130 in past 30 days | None                             |
| Already managed                       | 20       | 20                     | SNOMED 38341003 | —                                          | Active RxNorm 17767 (Amlodipine) |
| **Total**                             | **33**   | **33**                 |                 |                                            |                                  |

> **Expected agent output:** `seedSpec.expectedCohortSize = 13` — the persona should create 13 resources (5 MedicationRequests + 8 CarePlans). Surface this as a "Expected interventions: 13" badge next to the cohort table.

> **Patient ordering:** The `patientIds` array from `GET .../seed/{seedJobId}/patients` is ordered cohort-by-cohort matching the `cohortGroups` array. Patients 0–4 are Group A, 5–12 are Group B, 13–32 are already managed — so the portal can label each patient row without any additional lookups.

---

### 7.4.1b List Evaluation Runs for a Seed Job

Returns all evaluation runs that were submitted against a specific seed job's sandbox, newest first. Because each seed job has a unique `evalTenantId`, this only returns runs that used data from that seeding — not runs from other seed jobs for the same scenario.

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/runs
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
[
  {
    "runId": "0db0a562-0d7e-4d2d-be88-9ec6eed79ed7",
    "personaId": "hypertension-ccm",
    "personaVersion": "1.0.0",
    "tenantId": "default",
    "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
    "scenarioId": "8dfd4130-0552-4e37-94b6-327f0e6e23ad",
    "runStatus": "COMPLETED",
    "qualityScore": 1.0,
    "qualityDimensions": "{\"dataAccuracy\":1.0,\"dataAccuracyExplanation\":\"All expected FHIR resources were written successfully.\",\"queryCorrectness\":1.0,\"queryCorrectnessExplanation\":\"All FHIR queries matched expected patterns.\",\"responseQuality\":1.0,\"responseQualityExplanation\":\"Response met quality criteria.\"}",
    "simulatedQuestion": "Execute mission with parameters: ...",
    "personaResponse": "Created 5 MedicationRequests for Group A and 8 CarePlans for Group B.",
    "startedAt": "2026-10-11T09:45:59Z",
    "completedAt": "2026-10-11T09:46:44Z",
    "errorMessage": null,
    "createdBy": "victorchai"
  },
  {
    "runId": "1a6d3efa-b5e2-4c53-8a0b-355df84fccc5",
    "runStatus": "COMPLETED",
    "qualityScore": 0.4,
    "startedAt": "2026-10-11T09:44:40Z",
    "completedAt": "2026-10-11T09:45:09Z"
  }
]
```

**Response — 404 Not Found** if the `seedJobId` does not exist.

| Field               | Description                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runId`             | Pass to `GET /eval/{runId}` for the full run detail                                                                                                                                                                                                                                  |
| `qualityScore`      | Overall score 0–1; multiply by 100 for display percentage                                                                                                                                                                                                                            |
| `qualityDimensions` | JSON string — parse to `QualityDimensions`. Contains `dataAccuracy`, `queryCorrectness`, `responseQuality` (0–1 scores) plus `dataAccuracyExplanation`, `queryCorrectnessExplanation`, `responseQualityExplanation` (human-readable strings explaining why each score is what it is) |
| `runStatus`         | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED`                                                                                                                                                                                                                                       |

> **UX guidance:** Show this list as a "Run History" table inside the seed job panel. Each row displays the run date, score (as a coloured badge — green ≥ 90%, amber 60–89%, red < 60%), and a "View" link to the run detail. The list is ordered newest first so the most recent result is always at the top.

> **Relationship to the existing list endpoint:** `GET /eval?personaId=...` returns all runs across all seed jobs for a persona. `GET /eval/seed/{seedJobId}/runs` scopes the list to one specific sandbox — useful when a scenario has been re-seeded multiple times and you want to compare runs within the same data set.

---

### 7.4.2 Browse Seeded Patients

Returns the ordered list of patient IDs generated by a seed job. Use this to populate a patient-picker UI before or after eval submission.

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/patients
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "seedJobId": "c4d5e6f7-...",
  "evalTenantId": "eval-a1b2c3d4-...",
  "seedStatus": "COMPLETED",
  "patientIds": [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "b2c3d4e5-f6a7-8901-bcde-f01234567891",
    "..."
  ],
  "patientCount": 20
}
```

| Field          | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `patientIds`   | Ordered list of patient UUIDs in the order they were seeded              |
| `patientCount` | Total number of patients (convenience field, equals `patientIds.length`) |

**Response — 404 Not Found** if the `seedJobId` does not exist.

> **UX guidance:** Display `patientIds` as a clickable list. Each row can show a truncated UUID (e.g. first 8 chars) with a "View" button. Clicking loads the patient bundle (§7.4.3). Consider grouping by cohort label using the order of IDs — they are generated cohort-by-cohort in the same order as `cohortGroups` in the seed spec.

---

### 7.4.3 Get Patient Bundle

Returns all FHIR resources created for a single patient as a FHIR `collection` Bundle. Use this to let users inspect the synthetic data before submitting the eval run.

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/patients/{patientId}
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "total": 7,
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "gender": "unknown",
        "birthDate": "1970-03-01"
      }
    },
    {
      "resource": {
        "resourceType": "Condition",
        "id": "f0e9d8c7-...",
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "code": {
          "coding": [{ "system": "http://snomed.info/sct", "code": "73211009" }]
        },
        "clinicalStatus": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
              "code": "active"
            }
          ]
        }
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "id": "e1d2c3b4-...",
        "status": "final",
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "effectiveDateTime": "2026-07-09",
        "code": {
          "coding": [{ "system": "http://loinc.org", "code": "4548-4" }]
        },
        "valueQuantity": { "value": 7.5 }
      }
    },
    {
      "resource": {
        "resourceType": "MedicationRequest",
        "id": "d3c4b5a6-...",
        "status": "active",
        "intent": "order",
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "authoredOn": "2026-07-11",
        "medicationCodeableConcept": {
          "coding": [
            { "system": "http://snomed.info/sct", "code": "372567009" }
          ]
        }
      }
    },
    {
      "resource": {
        "resourceType": "AllergyIntolerance",
        "id": "c5b6a7d8-...",
        "clinicalStatus": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
              "code": "active"
            }
          ]
        },
        "patient": { "reference": "Patient/a1b2c3d4-..." },
        "code": {
          "coding": [
            { "system": "http://snomed.info/sct", "code": "372687004" }
          ]
        }
      }
    },
    {
      "resource": {
        "resourceType": "Procedure",
        "id": "b7a8c9d0-...",
        "status": "completed",
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "performedDateTime": "2026-09-09",
        "code": {
          "coding": [
            { "system": "http://snomed.info/sct", "code": "313191000119107" }
          ]
        }
      }
    },
    {
      "resource": {
        "resourceType": "Encounter",
        "id": "a9b0c1d2-...",
        "status": "finished",
        "class": {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          "code": "IMP"
        },
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "period": { "start": "2026-10-02", "end": "2026-10-04" }
      }
    }
  ]
}
```

**Resource types included** (when present for this patient):
`Patient`, `Condition`, `Observation`, `MedicationRequest`, `AllergyIntolerance`, `Procedure`, `ServiceRequest`, `Encounter`, `CarePlan`, `DiagnosticReport`

**Response — 404 Not Found** if the `seedJobId` does not exist.

> **UX guidance:** Render the bundle entries as an expandable resource list grouped by `resourceType`. This lets the data engineer verify the synthetic data looks correct before committing the eval run. Provide a "Close" or "Back to Patient List" button.

---

### 7.4.4 List Resource Types in Eval Sandbox

Returns the set of FHIR resource types that have data in the eval sandbox along with per-type counts. Use this as a table-of-contents before loading individual resource-type views.

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "evalTenantId": "eval-a1b2c3d4-261b-4776-8bc4-31c7f47f91f3",
  "seedStatus": "COMPLETED",
  "totalResources": 310,
  "resourceTypes": [
    { "resourceType": "AllergyIntolerance", "count": 20 },
    { "resourceType": "CarePlan", "count": 10 },
    { "resourceType": "Condition", "count": 30 },
    { "resourceType": "Encounter", "count": 10 },
    { "resourceType": "MedicationRequest", "count": 30 },
    { "resourceType": "Observation", "count": 100 },
    { "resourceType": "Patient", "count": 10 },
    { "resourceType": "Procedure", "count": 50 },
    { "resourceType": "ServiceRequest", "count": 50 }
  ]
}
```

| Field            | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `evalTenantId`   | Isolated sandbox tenant                                              |
| `seedStatus`     | Current seed job status (`PENDING`, `COMPLETED`, `TORN_DOWN`)        |
| `totalResources` | Sum of all per-type counts                                           |
| `resourceTypes`  | Array sorted alphabetically by `resourceType`, each with its `count` |

**Response — 404 Not Found** if the `seedJobId` does not exist.

> **UX guidance:** Display this as a sidebar or tab strip so users can click into any resource type. Show the count as a badge next to each resource type name. If `seedStatus` is not `COMPLETED`, show a spinner and poll until it is.

---

### 7.4.5 Get Resources by Type

Returns a paginated FHIR `collection` Bundle of all resources of a specific type for the eval sandbox. Use this to let users browse the synthetic cohort at the resource level without being anchored to a single patient.

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources/{resourceType}?page=0&size=50
Authorization: Bearer <jwt>
```

**Path parameters:**

| Parameter      | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `seedJobId`    | UUID returned by `$seed`                                        |
| `resourceType` | FHIR resource type (e.g. `Patient`, `Condition`, `Observation`) |

**Query parameters:**

| Parameter | Default | Max   | Description                  |
| --------- | ------- | ----- | ---------------------------- |
| `page`    | `0`     | —     | 0-based page index           |
| `size`    | `50`    | `500` | Number of resources per page |

**Response — 200 OK:**

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "total": 100,
  "entry": [
    {
      "resource": {
        "resourceType": "Observation",
        "id": "e1d2c3b4-...",
        "status": "final",
        "subject": { "reference": "Patient/a1b2c3d4-..." },
        "effectiveDateTime": "2026-07-09",
        "code": {
          "coding": [{ "system": "http://loinc.org", "code": "4548-4" }]
        },
        "valueQuantity": { "value": 7.5 }
      }
    }
  ],
  "_meta": {
    "evalTenantId": "eval-a1b2c3d4-261b-4776-8bc4-31c7f47f91f3",
    "resourceType": "Observation",
    "page": 0,
    "pageSize": 50,
    "totalPages": 2,
    "hasNextPage": true
  }
}
```

| Field               | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `total`             | Total number of resources of this type across all pages  |
| `entry`             | Array of `{ "resource": { ... } }` objects for this page |
| `_meta.page`        | Current 0-based page index                               |
| `_meta.pageSize`    | Effective page size (may be clamped to 500)              |
| `_meta.totalPages`  | Total number of pages                                    |
| `_meta.hasNextPage` | `true` if there are more pages                           |

**Response — 404 Not Found** if the `seedJobId` does not exist.

> **UX guidance:** Render as a paginated table with "Previous" / "Next" controls. Each row can show the resource ID and a summary of key fields (e.g. for `Observation`: LOINC code + value; for `Patient`: birth date). Provide a link back to the resource-type summary (§7.4.4).

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

#### Re-running with a HITL strategy override

When a previous run was suspended at HITL (see §7.5.1 troubleshooting), you can re-run with an explicit `hitlSimConfig` override **without editing the stored scenario**. Pass an optional JSON body:

```
POST /api/agentbuilder/experiments/eval/$submit
  ?personaId=diabetic-care-assessment
  &version=v1-exp-1728032401234
  &scenarioId=b3c4d5e6-...
  &tenantId=my-tenant
  &evalTenantId=eval-a1b2c3d4-...
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "hitlSimConfig": {
    "strategy": "APPROVE",
    "applyToCount": 10
  }
}
```

| Body field                        | Required                    | Description                                                                                                 |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `hitlSimConfig.strategy`          | Yes (if body present)       | `APPROVE` — auto-approve all plan reviews; `REJECT` — auto-reject; `REFINE` — send a refinement instruction |
| `hitlSimConfig.refineInstruction` | Only when `strategy=REFINE` | The refinement text sent back to the persona                                                                |
| `hitlSimConfig.applyToCount`      | No (default `10`)           | Maximum number of HITL prompts to auto-respond to in this run                                               |

When the body is omitted, the run uses the `hitlSimConfig` already stored on the scenario (or no HITL simulation if the scenario has none).

> **UX guidance:** After a run shows `dataAccuracy = 0%` with "execution suspended at HITL plan-review step" in `dataAccuracyExplanation`, surface a **"Re-run with HITL Approval"** button that posts the same params with `{"hitlSimConfig": {"strategy": "APPROVE"}}`. This lets the author see write accuracy in one click without touching the scenario.

**Error — 400 Bad Request** if `hitlSimConfig.strategy` is not one of `APPROVE`, `REJECT`, `REFINE`.

---

### 7.5 Poll Evaluation Run Status

```
GET /api/agentbuilder/experiments/eval/{runId}
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "runId": "0db0a562-0d7e-4d2d-be88-9ec6eed79ed7",
  "personaId": "hypertension-ccm",
  "personaVersion": "1.0.0",
  "tenantId": "default",
  "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
  "scenarioId": "8dfd4130-0552-4e37-94b6-327f0e6e23ad",
  "runStatus": "COMPLETED",
  "testInput": "{\"question\":\"Review all hypertension patients and create care interventions for those without active medication.\"}",
  "simulatedQuestion": "Execute mission with parameters: ...",
  "personaResponse": "Created 5 MedicationRequests for Group A (BP≥140) and 8 CarePlans for Group B (BP 130–139).",
  "qualityScore": 1.0,
  "qualityDimensions": "{\"dataAccuracy\":1.0,\"dataAccuracyExplanation\":\"All expected FHIR resources were written successfully.\",\"queryCorrectness\":1.0,\"queryCorrectnessExplanation\":\"All FHIR queries matched expected patterns.\",\"responseQuality\":1.0,\"responseQualityExplanation\":\"Response met quality criteria.\"}",
  "createdResources": "[{\"resourceType\":\"MedicationRequest\",\"resourceId\":\"a1b2c3d4-...\",\"operation\":\"CREATE\"},{\"resourceType\":\"CarePlan\",\"resourceId\":\"f6a7b8c9-...\",\"operation\":\"CREATE\"}]",
  "replayTrace": "[{\"stepNumber\":1,\"stepType\":\"FHIR_QUERY\",\"toolName\":\"fhir_query\",\"input\":{\"resourceType\":\"Patient\",\"params\":{\"_has:Condition:patient:code\":\"44054006\"}},\"output\":null,\"durationMs\":0},{\"stepNumber\":2,\"stepType\":\"FHIR_QUERY\",\"toolName\":\"fhir_query\",\"input\":{\"resourceType\":\"Patient\",\"params\":{\"_has:Observation:patient:code\":\"4548-4\",\"date\":\"ge2026-04-16\"}},\"output\":null,\"durationMs\":0}]",
  "startedAt": "2026-10-11T09:45:59Z",
  "completedAt": "2026-10-11T09:46:44Z",
  "errorMessage": null,
  "createdBy": "victorchai"
}
```

| `runStatus` | Meaning                           |
| ----------- | --------------------------------- |
| `PENDING`   | Job queued, not yet started       |
| `RUNNING`   | Evaluation in progress            |
| `COMPLETED` | Quality score and trace available |
| `FAILED`    | See `errorMessage`                |

> **Polling strategy:** Poll every 5 s while `runStatus = PENDING | RUNNING`. Stop on `COMPLETED` or `FAILED`.

> **`testInput` vs `simulatedQuestion`:**
>
> - `testInput` (JSONB) — the raw input provided when creating the scenario: either `missionParams` object (for parameter-driven runs) or `{"question":"<first user turn>"}` (for chat-style runs). Set before the run starts.
> - `simulatedQuestion` (string) — the full goal text actually sent to the persona. For parameter-driven runs this equals `"Execute mission with parameters: <json>"`. Set after the run completes.
>
> **Display guidance:** Show `testInput` (pretty-printed) at the **top** of the conversation view before the persona response, so reviewers see the test input that drove the run.

---

### 7.5.1 Understanding Evaluation Scores

Each evaluation run produces three **independent dimension scores** plus an **overall score**.

#### Dimension Scores (0–100%)

| Dimension             | How it is scored                                                                                                                                                           | Returns 0%                                     | Returns neutral (50%)                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Data Accuracy**     | GoldMatcher recall: compares resources actually written by the persona (tracked via `fhir_mutate` tool calls) against `expectedWrites` in the scenario                     | Writes issued but none matched the gold bundle | No `expectedWrites` defined in scenario — `dataAccuracyExplanation` says "Not evaluated (neutral)" |
| **Response Quality**  | LLM judge scores each item in `responseCriteria` (0–1) independently, then averages. Per-criterion scores are stored in `responseQualityCriteria`/`responseQualityScores`. | All criteria scored 0                          | No `responseCriteria` defined in scenario → 0.5 neutral                                            |
| **Query Correctness** | Fraction of `expectedQueryPatterns` covered by the queries the persona actually issued                                                                                     | All patterns uncovered                         | No `expectedQueryPatterns` defined → 0.5 neutral                                                   |

> **When `dataAccuracy = 0%` and the persona was suspended at HITL:** This is expected — the persona never reached the write phase so the GoldMatcher returns 0. The `dataAccuracyExplanation` will read: _"Score is 0% because execution was suspended at the HITL plan-review step before any FHIR resources were written. To evaluate write accuracy, re-run with hitlSimConfig.strategy=APPROVE."_ Use the **Re-run with HITL Approval** button (see §7.5) to get a meaningful `dataAccuracy` score.

> **When `queryCorrectness = 50%` and no `expectedQueryPatterns` are defined:** This is the neutral sentinel value, not a real score. The `queryCorrectnessExplanation` will read: _"Not evaluated (neutral 50%) — no expectedQueryPatterns defined in this scenario. N FHIR queries were issued (patterns not checked)."_ Use `PATCH /scenarios/{id}` (§7.3.2) to add patterns and get a real signal — no need to recreate the scenario.

**Why do the three percentages not add up to 100%?** They are independent dimensions, not slices of a pie. Each measures a different aspect and can range 0–100% on its own.

#### Overall Score Calculation

```
overall = dataAccuracy × w1 + queryCorrectness × w2 + responseQuality × w3
```

The weights are auto-selected based on the scenario:

| Scenario type                                     | Preset                 | Weights (data / query / response) |
| ------------------------------------------------- | ---------------------- | --------------------------------- |
| No `expectedWrites` (query + chat personas)       | `queryAndResponseOnly` | `0.00 / 0.40 / 0.60`              |
| `expectedWrites` present (write-capable personas) | `agentWithWrites`      | `0.50 / 0.20 / 0.30`              |
| Explicit `scoreWeights` in scenario               | Custom                 | As configured                     |

The active weights are stored in `qualityDimensions.scoreWeights` so the portal can reconstruct the formula.

**Example calculation** (hypertension-ccm, no writes):

- `dataAccuracy = 0.0`, `queryCorrectness = 0.5`, `responseQuality = 0.72`
- Weights: `(0.00, 0.40, 0.60)` → `queryAndResponseOnly`
- `overall = 0.0×0.00 + 0.5×0.40 + 0.72×0.60 = 0.200 + 0.432 = 0.632`
- Displayed as **63.2 / 100**

> **Note:** `qualityScore` is stored as a 0–1 decimal. Multiply by 100 for the display percentage.

#### Improving Eval Results

| Issue observed                                                          | Root cause                                                                | Fix                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataAccuracy = 0%`, `dataAccuracyExplanation` says "suspended at HITL" | Persona called `propose_plan` and was suspended before the write phase    | **Expected** — the persona completed its analysis but is waiting for human plan approval. Click **Re-run with HITL Approval** (see §7.5) to automatically approve the plan and continue. Read `personaResponse` and `replayTrace` for the full analysis the persona produced. |
| `dataAccuracy = 0%` on a write persona (no HITL suspension)             | Persona did not call `fhir_mutate` or called it with wrong parameters     | Check the system prompt: `fhir_mutate` requires `body` (not `resource`) and must be called one resource at a time, not as a bundle. See §7.A.                                                                                                                                 |
| `dataAccuracy` explanation says "Not evaluated (neutral)"               | No `expectedWrites` defined in the scenario                               | The scenario uses `queryAndResponseOnly` weights. If this is a write persona, use `PATCH /scenarios/{id}` (§7.3.2) to add `expectedWrites` (gold bundle), then re-submit the eval run.                                                                                        |
| `queryCorrectness = 50%`, explanation says "Not evaluated (neutral)"    | No `expectedQueryPatterns` defined in the scenario                        | Use `PATCH /scenarios/{id}` (§7.3.2) to add `expectedQueryPatterns` and get a real signal instead of the neutral sentinel.                                                                                                                                                    |
| `queryCorrectness = 0%` or partial                                      | Persona did not issue the expected patterns                               | Verify the scenario's `expectedQueryPatterns`. Confirm the system prompt instructs the persona to query the correct resource types and parameters.                                                                                                                            |
| `responseQuality` low; explanation shows per-criterion breakdown        | One or more `responseCriteria` scored low                                 | Read `responseQualityCriteria` and `responseQualityScores` from `qualityDimensions`. The lowest-scored criterion is the gap to fix. Update the system prompt to address that specific criterion, then re-run.                                                                 |
| `responseQuality = 50%`, explanation says "Not evaluated (neutral)"     | No `responseCriteria` defined in the scenario (`generateRubric` was used) | Review the auto-generated criteria via `GET /scenarios/{id}`, refine them, then use `PATCH /scenarios/{id}` (§7.3.2) to set `responseCriteria` with your hand-written criteria.                                                                                               |
| Overall score misleading                                                | Wrong weight preset applied                                               | Check `qualityDimensions.scoreWeights` — for write personas the weights are `(0.50, 0.20, 0.30)`. Ensure `expectedWrites` is populated in the scenario to activate the write-capable preset.                                                                                  |
| Persona makes 0 tool calls                                              | Missing or incorrect system prompt                                        | The system prompt must instruct the persona to output a bare JSON tool call on each turn starting with `{`. See §7.A for the initial prompt generation workflow.                                                                                                              |

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

### 7.A System Prompt Lifecycle — Initial Generation & Continuous Refinement

A persona's **system prompt** is the most critical lever for eval performance. It tells the agent which tools to call, in what order, with what parameters, and when to stop. This section covers the full lifecycle: initial creation, iterative refinement through eval runs, and application.

#### 7.A.1 Why the System Prompt Matters

The agent runtime (`ToolCallParser`) detects a tool call only when the LLM response **starts with `{`**. If the system prompt does not instruct the agent to output bare JSON first, the agent produces prose and no tools are called, resulting in a 0% score across all dimensions.

Key rules a good system prompt must enforce:

| Rule                                                | Why                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Response **must begin with `{`** — no preamble text | `ToolCallParser.tryParseBareJsonObject` only triggers when the response starts with `{`    |
| Use `fhir_query` with `action=search/read`          | `fhir_search` is not a registered tool; using it causes HITL suspension                    |
| `fhir_mutate` requires `body` (not `resource`)      | `FhirMutateTool` parameter is named `body`; using `resource` causes a runtime error        |
| Create resources **one at a time** (not a Bundle)   | LLMs produce invalid JSON for deep nested Bundle structures with many entries              |
| End with `mission_complete` tool call               | The `agent-declared` completion criteria only terminates when `mission_complete` is called |

#### 7.A.2 Bootstrapping the Initial System Prompt

**Two paths — use §7.A.2a (automated) by default; fall back to the manual template below only when an authoring session is unavailable.**

| Path                        | When to use                                                          | How                                                                                   |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Automated** (recommended) | An authoring agent session exists (Phase 0 complete)                 | Use the `generate_system_prompt` MCP tool — see §7.A.2a                               |
| **Manual** (fallback)       | No authoring session available, or bulk bootstrap outside the portal | Fill in the template below and call `PUT /experiments/persona-system-prompt` directly |

---

**Manual fallback — Step 1:** After the persona YAML is authored (Phase 0 authoring complete), fill in the template below and apply it:

```
PUT /api/agentbuilder/experiments/persona-system-prompt
  ?personaId=<personaId>
  &version=<version>
  &tenantId=<tenantId>
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "systemPrompt": "<initial system prompt text>"
}
```

**Response:** `204 No Content`

**System prompt template for write-capable agentic personas:**

```
You are a <clinical-role> agent. Your responses MUST begin with a JSON tool call object (no preamble text). Output EXACTLY ONE tool call JSON per turn.

CLINICAL DECISION RULES:
- <Group A condition>: → CREATE <ResourceType>
- <Group B condition>: → CREATE <ResourceType>

WORKFLOW (follow in order):

STEP 1 - Query <primary-resource>:
{"tool": "fhir_query", "parameters": {"action": "search", "resourceType": "<Type>", "searchParams": {"<param>": "<value>", "_count": "100"}}}

STEP 2 - Query <secondary-resource>:
{"tool": "fhir_query", "parameters": {"action": "search", "resourceType": "<Type>", "searchParams": {"<param>": "<value>", "_count": "100"}}}

STEP N - Create one <ResourceType> per qualifying patient:
{"tool": "fhir_mutate", "parameters": {"action": "create", "resourceType": "<ResourceType>", "body": {<minimal-valid-fhir-resource>}}}

STEP FINAL - Signal completion:
{"tool": "mission_complete", "parameters": {"summary": "Created X resources for Y patients."}}

RULES:
- ALWAYS start with STEP 1
- Replace PATIENT_ID with actual IDs from query results
- Call fhir_mutate ONCE per patient
- NEVER use fhir_search — always use fhir_query with action=search
- Call mission_complete after ALL patients are processed
```

> **UX guidance:** Surface a "System Prompt" tab in the persona editor panel alongside the YAML tab. Show the current prompt with a character count and last-updated timestamp. Include a "Copy template" button that prefills the textarea with the above template.

#### 7.A.2a generate_system_prompt MCP Tool

> **This is the recommended way to create the initial system prompt.** It replaces the manual template in §7.A.2 for any persona that was authored through an AgentBuilder session.

The AgentBuilder MCP server exposes a `generate_system_prompt` tool. The authoring agent calls it automatically at the end of Phase 5, or the portal can trigger it directly by posting a message to the active session (`POST /api/agentbuilder/sessions/{sessionId}/messages`). It is registered as a standard AgentBuilder tool and is available alongside `search_terminology` and `write_artifact`.

**Input schema:**

```json
{
  "personaId": "diabetic-care-assessment",
  "tenantId": "my-tenant",
  "archetype": "CARE_GAP_ASSESSMENT", // optional — auto-detected from persona if omitted
  "personaName": "Diabetic Care Manager", // optional — read from persona if omitted
  "focusAreas": ["HbA1c screening", "foot exam"] // optional — narrows the template to specific topics
}
```

| Field         | Required | Description                                                                                                                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personaId`   | Yes      | The persona to generate a prompt for. Used to load the persona's `scope`, `description`, and `focusAreas` if those optional fields are omitted.                                                       |
| `tenantId`    | Yes      | Used to look up the persona via the tenant-scoped persona repository.                                                                                                                                 |
| `archetype`   | No       | `CLINICIAN_DIGITAL_TWIN` or `CARE_GAP_ASSESSMENT`. Auto-detected from `scope` and `description` if omitted: `scope=patient` → `CLINICIAN_DIGITAL_TWIN`, `scope=organization` → `CARE_GAP_ASSESSMENT`. |
| `personaName` | No       | Overrides the display name used inside the generated prompt. Defaults to the persona's stored `name`.                                                                                                 |
| `focusAreas`  | No       | Specific clinical topics to emphasise (e.g. `["HbA1c", "foot exam"]`). Injected into the archetype template prompt as focus-area context before the LLM call.                                         |

**Output:**

```json
{
  "systemPrompt": "You are Diabetic Care Manager, an organization-scoped...",
  "archetype": "CARE_GAP_ASSESSMENT",
  "personaId": "diabetic-care-assessment"
}
```

| Field          | Description                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `systemPrompt` | Generated system prompt text (~800–1500 words). Ready to apply via `PUT /experiments/persona-system-prompt`. |
| `archetype`    | The archetype that was used (confirmed or auto-detected).                                                    |
| `personaId`    | Echo of the input persona ID.                                                                                |

**Archetype templates:**

The tool loads one of two classpath templates, then calls the LLM to fill in persona-specific details:

| Archetype                | Template file                                                      | Persona type                                                                    |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `CLINICIAN_DIGITAL_TWIN` | `fhir-config/prompts/templates/clinician-digital-twin-template.md` | Patient-scoped, single-patient decision support with `propose_plan` safety gate |
| `CARE_GAP_ASSESSMENT`    | `fhir-config/prompts/templates/care-gap-assessment-template.md`    | Organization-scoped, cohort workflow with two-query set-difference pattern      |

> **UX guidance:** After the authoring agent finishes Phase 5, surface a "Generate System Prompt" action button. Clicking it calls the tool via the chat interface (send the message: `"Generate the system prompt for this persona"`). Once the tool returns `systemPrompt`, display the text in a side-by-side diff panel alongside the current prompt (empty if this is a first run). Provide "Apply" and "Discard" buttons. "Apply" calls `PUT /experiments/persona-system-prompt` and triggers an eval run if one already exists.

---

#### 7.A.3 View the Current System Prompt

Retrieve a persona's current system prompt as part of the persona definition:

```
GET /fhir/r5/AgentPersonaDefinition?identifier=<personaId>
Authorization: Bearer <jwt>
```

The `extension` array in the returned FHIR resource contains `system_prompt` under the extension URL `http://fhirframework.org/fhir/StructureDefinition/system-prompt`.

Alternatively, read it directly from the DB:

```sql
SELECT system_prompt FROM workflow.agent_persona_definition
WHERE persona_id = '<personaId>' AND version = '<version>';
```

#### 7.A.4 Refine the System Prompt After an Eval Run

Once the first eval run completes (even with a low score), call the refinement endpoint to get an LLM-generated improved prompt:

```
POST /api/agentbuilder/experiments/eval/$refine-prompt
  ?personaId=<personaId>
  &version=<version>
  &tenantId=<tenantId>
  [&runId=<specific-run-uuid>]   ← optional; defaults to latest completed run
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "guidance": "The agent is not querying Conditions first. Ensure Step 1 is the Condition query with SNOMED code."
}
```

The `guidance` body field is optional free-text that steers the LLM. Omit the body entirely if no guidance is needed.

**Response — 200 OK:**

```json
{
  "suggestedSystemPrompt": "You are a hypertension care management agent...",
  "reasoning": "The current prompt caused the agent to skip querying Conditions because Step 1 was ambiguously worded. The improved prompt explicitly labels Step 1 as the Condition query and uses SNOMED code 38341003.",
  "sourceRunId": "1a6d3efa-b5e2-4c53-8a0b-355df84fccc5",
  "scores": {
    "overall": "0.40",
    "dataAccuracy": 0.0,
    "queryCorrectness": 0.5,
    "responseQuality": 0.8
  }
}
```

| Field                   | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `suggestedSystemPrompt` | Full replacement prompt text — data-driven, no hardcoded IDs |
| `reasoning`             | LLM's explanation of what was wrong and what changed         |
| `sourceRunId`           | The eval run that was analysed                               |
| `scores`                | The dimension scores from that run                           |

#### 7.A.5 Apply and Re-evaluate (Refinement Loop)

After reviewing the suggestion, apply it:

```
PUT /api/agentbuilder/experiments/persona-system-prompt
  ?personaId=<personaId>
  &version=<version>
  &tenantId=<tenantId>
Authorization: Bearer <jwt>
Content-Type: application/json

{ "systemPrompt": "<suggested-prompt-from-7.A.4>" }
```

Then re-submit the eval (`POST /eval/$submit`) to verify improvement. Repeat until `qualityScore ≥ 0.90`.

**Recommended refinement loop UX:**

```
Eval run completed (score < 90%)
    ↓
[Refine Prompt] button → POST /eval/$refine-prompt
    ↓
Diff panel: current prompt vs. suggested (side-by-side)
    ↓
[Apply Suggestion] → PUT /persona-system-prompt
    ↓
[Re-run Eval] → POST /eval/$submit
    ↓
Poll until COMPLETED
    ↓
Score ≥ 90%? → proceed to promote
Score < 90%? → repeat loop with optional guidance
```

> **Score threshold guidance:** The portal should visually indicate the 90% threshold. Show a green checkmark when `qualityScore ≥ 0.90` and a "Needs improvement" warning with the refine button when below.

#### 7.A.6 System Prompt Dimension Score Mapping

Use this mapping to show which dimension a given score problem most likely maps to, so the portal can surface targeted guidance:

| Score issue             | Likely cause                                                    | Suggested guidance for `$refine-prompt`                                                    |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `queryCorrectness = 0`  | Agent did not query expected resource types                     | "Enforce Step 1 as a Condition query with code X"                                          |
| `dataAccuracy = 0`      | Agent did not call `fhir_mutate` or used wrong param            | "Use `body` not `resource` in `fhir_mutate`; create one resource per patient not a Bundle" |
| `responseQuality < 0.5` | Agent called `mission_complete` too early or with wrong summary | "Add clinical classification logic and include patient counts in the summary"              |
| All 0.0                 | Agent made no tool calls                                        | "System prompt must start response with `{` and instruct agent to call `fhir_query` first" |

---

### 7.B Agent-Created Resources — Viewing What the Persona Wrote

When an eval run uses a write-capable persona, the agent creates FHIR resources in the eval sandbox during execution (e.g., MedicationRequests for Group A patients, CarePlans for Group B). The portal should let users inspect these created resources to verify clinical correctness.

#### 7.B.1 How Created Resources Are Tracked

The `AgentPersonaConversationExecutor` extracts every `fhir_mutate` call from the mission outputs and records them as `IssuedWrite(resourceType, resourceId, operation)`. These are used to compute `dataAccuracy` via `GoldMatcher` and are available on the eval run object.

#### 7.B.2 Verifying Agent Writes via Sandbox Resource Counts

Since resources created by the agent land in the eval sandbox (`evalTenantId`), they can also be retrieved via the existing resource-type endpoint. The count before vs. after the eval run provides an independent verification of what the agent added.

**List resource types (with counts) in sandbox:**

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources
Authorization: Bearer <jwt>
```

**Response:**

```json
{
  "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
  "seedStatus": "COMPLETED",
  "totalResources": 166,
  "resourceTypes": [
    { "resourceType": "Patient", "count": 33 },
    { "resourceType": "Condition", "count": 33 },
    { "resourceType": "Observation", "count": 86 },
    { "resourceType": "MedicationRequest", "count": 25 },
    { "resourceType": "CarePlan", "count": 8 }
  ]
}
```

In the hypertension-ccm example: 20 MedicationRequests were seeded; if the count is 25 after the eval run, the agent created 5 new ones (Group A). CarePlan count = 8 = agent-created Group B care plans.

**Retrieve all resources of a type from the sandbox:**

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources/MedicationRequest?page=0&size=50
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources/CarePlan?page=0&size=50
Authorization: Bearer <jwt>
```

**Response:** FHIR collection Bundle with pagination metadata in `_meta`.

#### 7.B.3 Per-Run Created Resources Endpoint

The `createdResources` field is stored on every completed eval run. It is also included in the full run response from `GET /eval/{runId}` under the `createdResources` key.

A dedicated endpoint returns just the write list plus the `evalTenantId` needed to fetch full resource content:

```
GET /api/agentbuilder/experiments/eval/{runId}/created-resources
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
{
  "runId": "0db0a562-0d7e-4d2d-be88-9ec6eed79ed7",
  "evalTenantId": "eval-ddcd635b-ae09-4d7c-a9d1-9d8f4c0614c6",
  "personaId": "hypertension-ccm",
  "personaVersion": "1.0.0",
  "createdResources": [
    {
      "resourceType": "MedicationRequest",
      "resourceId": "a1b2c3d4-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "MedicationRequest",
      "resourceId": "b2c3d4e5-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "MedicationRequest",
      "resourceId": "c3d4e5f6-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "MedicationRequest",
      "resourceId": "d4e5f6a7-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "MedicationRequest",
      "resourceId": "e5f6a7b8-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "CarePlan",
      "resourceId": "f6a7b8c9-...",
      "operation": "CREATE"
    },
    {
      "resourceType": "CarePlan",
      "resourceId": "a7b8c9d0-...",
      "operation": "CREATE"
    }
  ]
}
```

**Response — 204 No Content** if the run completed but the persona made no `fhir_mutate` calls.

**Response — 404 Not Found** if the `runId` does not exist.

To fetch the full FHIR content of a specific created resource, use the **direct resource-content endpoint** introduced in 2026-10-17. It resolves the `evalTenantId` from the run automatically — no `seedJobId` or sandbox browse needed:

```
GET /api/agentbuilder/experiments/eval/{runId}/created-resources/{resourceType}/{resourceId}
Authorization: Bearer <jwt>
```

**Example** — fetch the CarePlan written by run `7a886b32-d4af-4e68-87cb-ac8db415d6cf`:

```
GET /api/agentbuilder/experiments/eval/7a886b32-d4af-4e68-87cb-ac8db415d6cf/created-resources/CarePlan/fe10ffc1-3e94-4a11-848f-2c0ca0d0a4e5
Authorization: Bearer <jwt>
```

**Response — 200 OK:** the raw FHIR resource JSON (parsed, not a Bundle wrapper).

**Response — 404 Not Found:** run not found, or resource does not exist in the eval sandbox.

> **Note:** This endpoint only reaches resources stored in the `agentsandbox` schema under the run's `evalTenantId`. It cannot access resources from the default `internal-db` provider — the 404 you see when querying `/fhir/r5/CarePlan/{id}` directly is expected behaviour for agent-created eval resources.

If you need to browse all resources of a type (e.g. for bulk review), the sandbox browse endpoint is still available:

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/resources/{resourceType}?page=0&size=50
Authorization: Bearer <jwt>
```

Filter the returned Bundle entries by matching `resource.id` against the `resourceId` values from `createdResources`.

#### 7.B.4 Portal UX for Created Resources

**Recommended layout for the Eval Run detail panel:**

```
┌─────────────────────────────────────────────────────────────┐
│  Eval Run  0db0a562  ●COMPLETED  Score: 100%                │
├──────────────────────┬──────────────────────────────────────┤
│  Score Breakdown     │  Agent-Created Resources             │
│  ──────────────────  │  ─────────────────────────────────   │
│  Data Accuracy  100% │  MedicationRequest ×5                │
│  Query Correct  100% │    Patient/uuid-1   [View]           │
│  Response Qual  100% │    Patient/uuid-2   [View]           │
│                      │    ...                               │
│                      │  CarePlan ×8                         │
│                      │    Patient/uuid-6   [View]           │
│                      │    ...                               │
├──────────────────────┴──────────────────────────────────────┤
│  Persona Response                                           │
│  "Created 5 MedicationRequests for Group A (BP≥140)..."    │
└─────────────────────────────────────────────────────────────┘
```

- **[View]** links open the raw FHIR resource JSON in a side drawer for clinical review.
- Fetch the resource using the direct endpoint: `GET /api/agentbuilder/experiments/eval/{runId}/created-resources/{resourceType}/{resourceId}` (§7.B.3). This requires only the `runId` (already available in context) plus `resourceType` and `resourceId` from the `createdResources` list — no `seedJobId` or extra headers needed.
- To cross-check totals, compute the delta: seed counts (from `seededCounts` on the seed job) vs. post-run resource type counts from the sandbox endpoint — this should match `createdResources`.

**"Set as Gold Bundle" shortcut (shown when `expectedWrites` is not yet set):**

When the run completes and the scenario has no `expectedWrites`, show a prompt below the created-resources list:

```
┌─────────────────────────────────────────────────────────────┐
│  Agent-Created Resources                                    │
│  MedicationRequest ×5   CarePlan ×2                        │
│                                                             │
│  ⓘ No gold bundle set for this scenario.                   │
│     [ Set CarePlan as expected output → ]                   │
└─────────────────────────────────────────────────────────────┘
```

The button derives the `expectedWrites` bundle from the **unique resource types** in `createdResources` (one entry per type) and calls:

```
PATCH /api/agentbuilder/scenarios/{scenarioId}
{
  "expectedWrites": {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [
      { "resource": { "resourceType": "CarePlan" } }
    ]
  }
}
```

After a successful PATCH, replace the prompt with a confirmation banner: _"Gold bundle set — future runs will score data accuracy against CarePlan × 1."_ Hide the prompt on all subsequent runs for this scenario (i.e. when `GET /scenarios/{id}` returns a non-null `expectedWrites`).

> **Why only unique types (not counts)?** The gold bundle uses count-based recall with `min(gold, actual) / gold`. One entry per type means the agent needs to write **at least one** of that type to score 1.0 — it does not penalise writing more. If the scenario requires the agent to write a specific minimum count (e.g. one CarePlan per patient), set `count` entries manually via the Edit button.

---

### 7.C HITL Comparison Runs — Simulate Three Reviewer Strategies

The HITL (Human-In-The-Loop) comparison feature runs three evaluation versions of the same scenario in parallel — one where the simulated reviewer **approves** every `propose_plan` gate, one where they **reject** every gate, and one where they ask the agent to **refine** its plan before continuing. By comparing the resulting quality scores you learn which reviewer interaction pattern produces the best persona outcome.

#### 7.C.1 HITL Sim Config on a Scenario

Before submitting a comparison, the scenario must carry a `hitlSimConfig` that describes the base simulation behaviour.

`hitlSimConfig` and `hitlStrategyGoldSets` can be set when creating the scenario or added/changed later via `PATCH /api/agentbuilder/scenarios/{scenarioId}` (§7.3.2).

Include these fields in the `POST /api/agentbuilder/scenarios` body (§7.3), or patch an existing scenario:

```json
{
  "hitlSimConfig": {
    "strategy": "APPROVE", // base strategy; overridden per-run by $submit-hitl-comparison
    "refineInstruction": "Add a follow-up appointment for the patient.", // used only when strategy=REFINE
    "applyToCount": 10 // number of HITL gates to synthesize responses for (default 10)
  },
  "hitlStrategyGoldSets": {
    "approve": { "entries": ["...expected bundle when agent is approved..."] },
    "reject": { "entries": ["...expected bundle when agent is rejected..."] },
    "refine": { "entries": ["...expected bundle after refine instruction..."] }
  }
}
```

| Field                  | Description                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strategy`             | `APPROVE` / `REJECT` / `REFINE` — base strategy used for normal `$submit` runs on this scenario                                                                                                                             |
| `refineInstruction`    | Text sent back to the agent when strategy is `REFINE` (e.g. "Add a follow-up appointment"). Required when `strategy=REFINE`.                                                                                                |
| `applyToCount`         | How many HITL gates to synthesize (default `10`). Set this to match the expected number of `propose_plan` calls in the persona's workflow.                                                                                  |
| `hitlStrategyGoldSets` | Optional per-strategy expected write bundles. When a key (`"approve"`, `"reject"`, `"refine"`) is present, the corresponding run scores `dataAccuracy` against that bundle instead of the scenario's base `expectedWrites`. |

#### 7.C.2 Submit a Comparison Run

```
POST /api/agentbuilder/experiments/eval/$submit-hitl-comparison
  ?personaId=diabetic-care-assessment
  &version=v1-exp-1728032401234
  &scenarioId=b3c4d5e6-...
  &tenantId=my-tenant
  &evalTenantId=eval-a1b2c3d4-...
Authorization: Bearer <jwt>
```

**Response — 202 Accepted:**

```json
{
  "comparisonGroup": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "runIds": [
    "11111111-0000-0000-0000-000000000001",
    "22222222-0000-0000-0000-000000000002",
    "33333333-0000-0000-0000-000000000003"
  ]
}
```

| Field             | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `comparisonGroup` | UUID shared across all three runs — use this to group and fetch them together.                |
| `runIds`          | Ordered array: `runIds[0]` = APPROVE run, `runIds[1]` = REJECT run, `runIds[2]` = REFINE run. |

The three runs execute asynchronously. Each is a standard `PersonaEvaluationRun` and can be polled individually via `GET /eval/{runId}`. They also carry two new fields:

| Field                 | Description                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `hitlSimStrategy`     | The strategy used for this specific run: `APPROVE`, `REJECT`, or `REFINE`.            |
| `hitlComparisonGroup` | The shared comparison group UUID — matches `comparisonGroup` from the response above. |

**Parameters:**

| Parameter      | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `personaId`    | Persona to evaluate                                                          |
| `version`      | Version to evaluate                                                          |
| `scenarioId`   | Scenario — must have `hitlSimConfig` set                                     |
| `tenantId`     | Production tenant owning the persona                                         |
| `evalTenantId` | Eval sandbox — must be `COMPLETED` (same sandbox is used for all three runs) |

> **Note:** The same `evalTenantId` (and therefore the same seeded patient cohort) is used for all three runs. This isolates the variable to reviewer behaviour only — all three persona executions see identical data.

#### 7.C.3 Retrieve Comparison Runs

Poll each run individually:

```
GET /api/agentbuilder/experiments/eval/{runId}
```

Or list all runs for a seed job and filter by `hitlComparisonGroup`:

```
GET /api/agentbuilder/experiments/eval/seed/{seedJobId}/runs
```

Filter the response: `runs.filter(r => r.hitlComparisonGroup === comparisonGroup)`.

#### 7.C.4 Portal UX for Comparison Results

Once all three runs complete, display them as a grouped comparison panel:

```
┌─────────────────────────────────────────────────────────────────┐
│  HITL Strategy Comparison   Comparison Group: f47ac10b          │
├─────────────────┬───────────────────────┬───────────────────────┤
│  Strategy       │  Quality Score        │  Status               │
├─────────────────┼───────────────────────┼───────────────────────┤
│  APPROVE ✓      │  ██████████  92%      │  COMPLETED            │
│  REJECT ✗       │  ████░░░░░░  44%      │  COMPLETED            │
│  REFINE ↺       │  ████████░░  81%      │  COMPLETED            │
└─────────────────┴───────────────────────┴───────────────────────┘
  💡 Best strategy: APPROVE (92% vs baseline 87%)
  [View APPROVE Run]  [View REJECT Run]  [View REFINE Run]
```

**UX guidance:**

- Poll all three runs simultaneously (one `GET /eval/{runId}` per run every 5 s).
- Show a spinner on each row until `runStatus = COMPLETED`.
- Once all three complete, highlight the highest-scoring strategy with a badge.
- Add a "Compare with Baseline" note if a standard `$submit` run exists for the same scenario — baseline is the run without `hitlSimStrategy` set.
- Clicking "[View]" on any row navigates to the full eval run detail panel (score breakdown + persona response + created resources).

**TypeScript example — fetch and group comparison runs:**

```typescript
async function fetchComparisonRuns(runIds: string[], comparisonGroup: string) {
  const runs = await Promise.all(
    runIds.map((id) =>
      fetch(`/api/agentbuilder/experiments/eval/${id}`, { headers }).then((r) =>
        r.json(),
      ),
    ),
  );
  // Order: index 0 = APPROVE, 1 = REJECT, 2 = REFINE
  return runs.map((r) => ({
    strategy: r.hitlSimStrategy as 'APPROVE' | 'REJECT' | 'REFINE',
    runId: r.runId,
    status: r.runStatus,
    score: r.qualityScore != null ? Math.round(r.qualityScore * 100) : null,
    comparisonGroup: r.hitlComparisonGroup,
  }));
}
```

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

The shape is the same regardless of provider; the `provider` field tells you which backend is active. The model `id` values differ by provider — use them opaquely (pass back to `POST /api/agentbuilder/sessions` as `modelId`).

**Example — Azure OpenAI provider (staging / production):**

```json
{
  "provider": "azure-openai",
  "defaultModelId": "gpt-5.5",
  "models": [
    {
      "id": "gpt-5.5",
      "displayName": "GPT-5.5",
      "description": "Balanced and fast — recommended for most persona designs",
      "default": true
    },
    {
      "id": "gpt-6-astra",
      "displayName": "GPT-6 Astra",
      "description": "High capability GPT-6 — ideal for complex multi-step persona logic",
      "default": false
    },
    {
      "id": "gpt-6-luna",
      "displayName": "GPT-6 Luna",
      "description": "Most capable GPT-6 — best for the most demanding persona designs",
      "default": false
    }
  ]
}
```

**Example — AWS Bedrock provider (alternative deployment):**

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

| Field                  | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `provider`             | Active LLM backend: `azure-openai`, `bedrock`, `ollama`, `openai`                      |
| `defaultModelId`       | Model ID used when no `modelId` is supplied at session creation                        |
| `models[].id`          | Model ID — pass as `modelId` in `POST /api/agentbuilder/sessions` to select this model |
| `models[].displayName` | Human-readable label for display in the portal                                         |
| `models[].description` | Short description of the model's characteristics and recommended use                   |
| `models[].default`     | `true` for the server-configured default; exactly one entry will have `true`           |

> **UX guidance:** Show a model selector dropdown in the "New Session" dialog pre-selected to the entry where `default: true`. After the session is created, show the selected model's `displayName` in the chat window header (e.g. _"Powered by GPT-5.5"_ or _"Powered by Claude Opus 4.8"_). If `models` has only one entry, omit the selector and show the model name directly. Treat model `id` values as opaque strings — do not hard-code provider-specific IDs in the frontend; always derive them from this endpoint's response.

> **Azure OpenAI note (reasoning models):** GPT-6 Astra and GPT-6 Luna are reasoning models. They do not support function tool calls on the `/chat/completions` endpoint; the server automatically strips tool definitions before forwarding the request. Persona authoring with a GPT-6 model works correctly, but tool-call steps are handled by the server's fallback path. Recommend GPT-5.5 for most persona authoring sessions; GPT-6 models are best for complex, multi-step persona designs where deeper reasoning is needed.

---

### 8.6 Assessment Tools (Clinical Scoring Catalog)

The assessment tools catalog lists and manages clinical scoring scale definitions used by the `compute_score` MCP tool. Platform-bundled scales (NEWS2, PHQ-9, GCS, qSOFA, CURB-65, Braden, and seven interRAI summary scales) are seeded automatically at server startup. User-imported tools can be added, browsed, and deactivated through these endpoints.

#### 8.6.1 List Active Assessment Tools

Returns all active tool definitions in summary form. Call once on portal load to populate a scoring-tool picker or tool-scope configuration panel.

```
GET /api/agentbuilder/assessment-tools
Authorization: Bearer <jwt>
```

**Response — 200 OK:**

```json
[
  {
    "toolId": "news2",
    "displayName": "NEWS2 — National Early Warning Score 2",
    "description": "Royal College of Physicians 2017. Seven-parameter score...",
    "source": "platform",
    "updatedAt": "2026-10-08T09:00:00Z"
  },
  {
    "toolId": "phq9",
    "displayName": "PHQ-9 Depression Scale",
    "description": "Kroenke & Spitzer 2002. Nine-item patient-reported depression screen...",
    "source": "platform",
    "updatedAt": "2026-10-08T09:00:00Z"
  },
  {
    "toolId": "custom-frailty-v1",
    "displayName": "Custom Frailty Index v1",
    "description": "Site-specific 7-item frailty assessment",
    "source": "user",
    "updatedAt": "2026-10-07T15:42:00Z"
  }
]
```

**Field descriptions:**

| Field         | Description                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `toolId`      | Unique identifier — pass as `scoreId` parameter when calling `compute_score`                              |
| `displayName` | Human-readable scale name                                                                                 |
| `description` | First sentence of the scale description (truncated for list view)                                         |
| `source`      | `platform` = bundled at startup; `user` = imported via portal; `imported` = imported from an external URL |
| `updatedAt`   | ISO-8601 timestamp of last definition update                                                              |

**Platform-bundled tool IDs:**

| `toolId`       | Scale                                    |
| -------------- | ---------------------------------------- |
| `news2`        | NEWS2 Scale 1 (SpO₂ ≥ 95 %)              |
| `news2-scale2` | NEWS2 Scale 2 — COPD/target SpO₂ 88–92 % |
| `phq9`         | PHQ-9 Depression Screen                  |
| `qsofa`        | qSOFA Sepsis Screen                      |
| `curb65`       | CURB-65 Pneumonia Severity               |
| `gcs`          | Glasgow Coma Scale                       |
| `braden`       | Braden Pressure Injury Risk              |
| `rai-chess`    | interRAI CHESS Health Instability        |
| `rai-drs`      | interRAI Depression Rating Scale         |
| `rai-abs`      | interRAI Aggressive Behaviour Scale      |
| `rai-ise`      | interRAI Index of Social Engagement      |
| `rai-pain`     | interRAI MDS Pain Scale                  |
| `rai-cps`      | interRAI Cognitive Performance Scale     |
| `rai-adl-hier` | interRAI ADL Hierarchy Scale             |

#### 8.6.2 Get Assessment Tool Definition

Returns the full JSON definition of a single tool, including all scoring parameters and risk bands.

```
GET /api/agentbuilder/assessment-tools/{toolId}
Authorization: Bearer <jwt>
```

**Response — 200 OK:** Raw definition JSON string.

```json
{
  "scoreId": "news2",
  "displayName": "NEWS2 — National Early Warning Score 2",
  "description": "...",
  "totalMethod": "sum",
  "parameters": [ ... ],
  "riskClassification": [ ... ]
}
```

Returns `404 Not Found` if the tool is not active or does not exist.

#### 8.6.3 Import (Create or Update) an Assessment Tool

Import a new clinical scoring definition or update an existing one. The definition is stored in `workflow.clinical_assessment_tool` with `source = 'user'` (or `'imported'` if a `sourceUrl` query parameter is supplied).

```
POST /api/agentbuilder/assessment-tools?source=user&sourceUrl=https://example.org/scale.json
Authorization: Bearer <jwt>
Content-Type: application/json

{ <full ScoreDefinition JSON — same schema as YAML files in fhir-config/assessmenttools/> }
```

**Query parameters:**

| Parameter   | Required | Description                                                          |
| ----------- | -------- | -------------------------------------------------------------------- |
| `source`    | No       | `user` (default) or `imported`                                       |
| `sourceUrl` | No       | URL of the authoritative definition source (for provenance tracking) |

**Response — 201 Created** (new tool) or **200 OK** (updated tool):

```json
{
  "toolId": "custom-frailty-v1",
  "displayName": "Custom Frailty Index v1",
  "source": "user",
  "createdAt": "2026-10-08T10:00:00Z",
  "updatedAt": "2026-10-08T10:00:00Z"
}
```

The registry is hot-reloaded after import, making the tool immediately available to the `compute_score` MCP tool without server restart.

Returns `400 Bad Request` with a validation error if `scoreId` or `displayName` is missing from the body.

#### 8.6.4 Deactivate an Assessment Tool

Soft-deletes a tool (sets `is_active = false`). Platform-seeded tools are not permanently deleted; they will be re-activated if the server restarts and the YAML file still exists. User-imported tools are effectively removed from the active catalog.

```
DELETE /api/agentbuilder/assessment-tools/{toolId}
Authorization: Bearer <jwt>
```

**Response — 204 No Content** on success.  
**Response — 404 Not Found** if the tool does not exist or is already inactive.

#### 8.6.5 UX Guidance

**Tool picker in persona editor:** When a user adds a `compute_score` call to a persona's tool scope, display a searchable dropdown populated from `GET /api/agentbuilder/assessment-tools`. Show `displayName` as the label and `toolId` as the value stored in the persona configuration.

**Source badge:** Colour-code the `source` field: `platform` = blue chip, `user` = green chip, `imported` = grey chip. This helps users distinguish bundled platform tools from custom or externally sourced definitions.

**Hierarchy warning:** For tools with `rai-cps` or `rai-adl-hier` (both use `totalMethod: hierarchy`), display a tooltip: _"This scale uses a decision-tree algorithm. The compute_score tool collects component values; the persona agent applies the algorithm to derive the final score."_

**Inverted-sum note:** For `gcs`, `braden`, and `rai-ise` (inverted-sum scales), display a tooltip: _"The 'total' returned by compute_score is a risk score — higher = worse. This is the inverse of the traditional clinical scale direction."_

---

### 8.7 Tenant Terminology Store

The terminology store allows each tenant to register proprietary clinical coding concepts that override the platform defaults (SNOMED CT / LOINC / RxNorm) when the `search_terminology` MCP tool is invoked. This is useful when a hospital uses internal coding systems or non-standard code values.

Concepts are stored in `workflow.terminology_concept` (Flyway V166). The `search_terminology` MCP tool queries this table first for the caller's tenant; classpath YAML fallback is used only when no tenant entries match.

#### 8.7.1 List / Search Terminology Concepts

Returns all concepts for the tenant, optionally filtered by resource type or free-text search.

```
GET /api/agentbuilder/terminology
  ?resourceType=Condition    // optional — filter by FHIR resource type
  &q=hypertension            // optional — case-insensitive text search on name, displayName, code, display
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>    // or ?tenantId= query param
```

**Response — 200 OK:**

```json
[
  {
    "id": 1,
    "tenantId": "my-tenant",
    "resourceType": "Condition",
    "name": "hypertension",
    "displayName": "High Blood Pressure (local)",
    "system": "http://my-hospital.org/codes",
    "code": "HTN-001",
    "display": "Hypertension (proprietary)",
    "createdBy": "alice",
    "createdAt": "2026-10-15T09:00:00Z"
  }
]
```

**Response — 400 Bad Request** if `X-Tenant-ID` header and `tenantId` param are both absent.

**Filter behaviour:**

- No filters → returns all concepts for the tenant
- `resourceType` only → filters by resource type
- `q` only → searches across `name`, `displayName`, `code`, and `display` (case-insensitive)
- Both → applies both filters

**Field descriptions:**

| Field          | Description                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| `id`           | Numeric primary key — use in `DELETE /terminology/{id}`                                   |
| `tenantId`     | Tenant this concept belongs to                                                            |
| `resourceType` | FHIR resource type this code applies to (`Condition`, `Observation`, `MedicationRequest`) |
| `name`         | Lookup key used by `search_terminology` (e.g. `"hypertension"`, `"diabetes"`)             |
| `displayName`  | Human-readable label shown in the portal terminology picker                               |
| `system`       | Coding system URI (e.g. `"http://my-hospital.org/codes"`)                                 |
| `code`         | Code value within the system                                                              |
| `display`      | Code display text returned by `search_terminology`                                        |
| `createdBy`    | Username of the portal user who created this entry                                        |
| `createdAt`    | ISO-8601 creation timestamp                                                               |

#### 8.7.2 Create a Terminology Concept

```
POST /api/agentbuilder/terminology
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-guid>
Content-Type: application/json

{
  "resourceType": "Condition",
  "name":         "hypertension",
  "displayName":  "High Blood Pressure (local)",
  "system":       "http://my-hospital.org/codes",
  "code":         "HTN-001",
  "display":      "Hypertension (proprietary)"
}
```

**Required fields:** `resourceType`, `name`, `system`, `code`

**Optional fields:** `displayName`, `display`

The `tenantId` is resolved from the `X-Tenant-ID` header (or `?tenantId=` param). The `createdBy` field is set from the JWT.

**Response — 201 Created:**

```json
{
  "id": 42,
  "tenantId": "my-tenant",
  "resourceType": "Condition",
  "name": "hypertension",
  "displayName": "High Blood Pressure (local)",
  "system": "http://my-hospital.org/codes",
  "code": "HTN-001",
  "display": "Hypertension (proprietary)",
  "createdBy": "alice",
  "createdAt": "2026-10-15T09:00:00Z"
}
```

**Response — 400 Bad Request** if any required field is missing.

**Uniqueness constraint:** The combination `(tenantId, resourceType, name, system)` must be unique. Attempting to create a duplicate returns `409 Conflict`.

#### 8.7.3 Delete a Terminology Concept

```
DELETE /api/agentbuilder/terminology/{id}
Authorization: Bearer <jwt>
```

**Response — 204 No Content** on success.

> **Note:** There is no access-control check against `tenantId` on the delete path — the `id` is globally unique so only an actor with the `agentbuilder` role who knows the numeric ID can delete it. For safety, display a confirmation dialog before calling this endpoint.

#### 8.7.4 Portal UX for Terminology Management

**Recommended placement:** A "Terminology" tab in the tenant settings panel or within the persona authoring sidebar under "Coding Systems".

**Terminology management screen layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  Tenant Terminology                              [+ Add Code] │
│                                                               │
│  Filter: [All Types ▼]  Search: [________________]           │
│                                                               │
│  NAME             TYPE        SYSTEM               CODE  [del]│
│  ─────────────────────────────────────────────────────────── │
│  hypertension     Condition   my-hospital.org       HTN-001  ×│
│  diabetes-type2   Condition   my-hospital.org       DM2-001  ×│
│  hba1c-custom     Observation my-hospital.org       LBHBA    ×│
└──────────────────────────────────────────────────────────────┘
```

**Add Code dialog:**

```
Resource Type: [Condition ▼]
Name (lookup key): [ hypertension     ]    ← used by search_terminology
Display Name:      [ High Blood Pressure (local) ]
System URI:        [ http://my-hospital.org/codes ]
Code:              [ HTN-001           ]
Display:           [ Hypertension (proprietary) ]
                                              [Cancel]  [Save]
```

**How tenant concepts appear in authoring:** When the authoring agent calls `search_terminology` with a concept like `"hypertension"`, it will return the tenant-specific code (`HTN-001` from `http://my-hospital.org/codes`) instead of SNOMED `38341003`. This means the generated scenario `conditionCodes` and `expectedQueryPatterns` will use the tenant's proprietary code. Make sure seeded FHIR data uses the same code when tenant terminology is active.

> **UX guidance:** If a tenant has registered terminology concepts for a resource type, show a "Custom codes active" badge next to that resource type in the cohort group editor. This signals to the scenario author that the agent will use tenant codes, not SNOMED/LOINC defaults.

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
interface ScoreWeights {
  dataAccuracy: number; // 0.0–1.0
  queryCorrectness: number; // 0.0–1.0
  responseQuality: number; // 0.0–1.0
}

interface QualityDimensions {
  dataAccuracy: number; // 0.0–1.0 (0.5 = neutral when no expectedWrites defined)
  queryCorrectness: number; // 0.0–1.0 (0.5 = neutral when no expectedQueryPatterns)
  responseQuality: number; // 0.0–1.0 (0.5 = neutral when no responseCriteria)
  scoreWeights: ScoreWeights; // weights actually used in outcomeScore calculation
  /** Human-readable explanation for each dimension score. Always present. Display
   *  alongside the numeric bar so reviewers understand WHY a dimension scored low.
   *
   *  Key phrases to watch for:
   *  - dataAccuracyExplanation contains "suspended at the HITL plan-review step"
   *    → execution stopped before write phase; use Re-run with HITL Approval (§7.5)
   *  - dataAccuracyExplanation contains "Not evaluated (neutral)"
   *    → no expectedWrites in scenario; neutral 50% not a real signal
   *  - queryCorrectnessExplanation contains "Not evaluated (neutral 50%)"
   *    → no expectedQueryPatterns; add patterns to get a real signal
   *  - responseQualityExplanation contains "Not evaluated (neutral 50%)"
   *    → no responseCriteria; add criteria to get a real signal
   */
  dataAccuracyExplanation: string;
  queryCorrectnessExplanation: string;
  /** Includes a per-criterion bullet breakdown when responseCriteria were defined.
   *  Example: "Response partially met quality criteria (65% average). See per-criterion
   *  breakdown below.\n  • [70%] Correctly identifies patients...\n  • [60%] ..." */
  responseQualityExplanation: string;
  /** Present only when responseCriteria were defined (not empty).
   *  The criteria text used for scoring, in the same order as responseQualityScores. */
  responseQualityCriteria?: string[];
  /** Present only when responseCriteria were defined (not empty).
   *  Per-criterion LLM judge scores (0.0–1.0), same order as responseQualityCriteria.
   *  Multiply by 100 for display percentages. Use alongside the text in
   *  responseQualityExplanation to render a breakdown table or progress bars. */
  responseQualityScores?: number[];
}

interface EvalRun {
  runId: string; // UUID
  personaId: string;
  personaVersion: string;
  tenantId: string;
  evalTenantId: string;
  runStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  /** Raw scenario input before the run starts.
   *  For mission-param runs: the missionParams object.
   *  For chat runs: {"question": "<first user turn>"}.
   *  Display this at the TOP of the conversation view before personaResponse. */
  testInput?: string; // JSONB string
  /** Full goal text sent to the persona. Set after run completes. */
  simulatedQuestion?: string;
  /** Persona's textual response.
   *  On HITL suspension the backend synthesizes a structured summary starting with
   *  "⚠️ Human Review Required" followed by cohort metrics, the proposed plan, and
   *  the action required — display as pre-formatted text so line breaks are preserved.
   *  Never blank on a COMPLETED run; may be null on FAILED before the run started. */
  personaResponse?: string;
  /** 0–1 decimal. Multiply by 100 for the display percentage. */
  qualityScore?: number;
  /** JSON string — parse to QualityDimensions for dimension breakdown, weights, and
   *  human-readable explanations. Always includes *Explanation fields alongside scores. */
  qualityDimensions?: string;
  /** JSON string — parse to ReplayStep[] (flat array). Populated from FHIR queries
   *  issued during the run plus a HITL_SUSPENSION terminal step when applicable.
   *  Null only on very old runs or runs that ended before any tool calls. */
  replayTrace?: string;
  humanRating?: number; // 1–5
  humanNotes?: string;
  evaluatedBy?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  // HITL comparison fields (present when run was part of $submit-hitl-comparison)
  hitlSimStrategy?: 'APPROVE' | 'REJECT' | 'REFINE';
  hitlComparisonGroup?: string; // UUID shared across the three runs in a comparison batch
}
```

> **Rendering the conversation view:** Always render `testInput` at the top of the conversation timeline before `personaResponse`. Parse `testInput` as JSON and display as a labelled block: "Test Input" (for parameter-driven runs) or "Test Question" (when `testInput.question` exists). Then show `simulatedQuestion` as the user turn, and `personaResponse` as the persona turn.

### 10.4 Replay Trace Structure

`replayTrace` is a **flat JSON array** of `ReplayStep` records (not a wrapped object).
Each entry corresponds to one agent action in execution order.

```typescript
type ReplayTrace = ReplayStep[];

interface ReplayStep {
  stepNumber: number;
  /** Step category:
   *  - "FHIR_QUERY"      — a fhir_query tool call issued during the run
   *  - "HITL_SUSPENSION" — execution suspended for human plan review (terminal step) */
  stepType: 'FHIR_QUERY' | 'HITL_SUSPENSION';
  toolName: string; // "fhir_query" | "propose_plan"
  input: unknown; // FHIR_QUERY: { resourceType, params }; HITL_SUSPENSION: proposedPlan map
  output: unknown; // FHIR_QUERY: null (result not captured); HITL_SUSPENSION: failure reason string
  durationMs: number; // always 0 (not yet instrumented)
}
```

**Rendering guidance:**

- Render each step as a timeline row: icon + `stepType` label + tool name + collapsible `input` detail.
- For `HITL_SUSPENSION` steps, surface the `input` (proposed plan) prominently — this is the plan the persona is asking the reviewer to approve.
- `personaResponse` already contains a pre-formatted human-readable summary of HITL suspension; the trace provides the raw structured data for reviewers who need to inspect the full plan.

### 10.5 Seed Spec Types

```typescript
interface PatientProfile {
  minAge?: number; // inclusive; distributes ages evenly across [minAge, maxAge]
  maxAge?: number; // inclusive; defaults to minAge + 10 when only minAge is set
  gender?: 'male' | 'female' | 'other' | 'unknown'; // null → alternates male/female
  address?: {
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

interface ObservationConstraint {
  loincCode: string;
  daysBack: number;
  comparator?: 'gt' | 'lt' | 'ge' | 'le' | 'eq';
  value: number;
  unit?: string;
  components?: ComponentConstraint[]; // non-null → panel Observation
}

interface ComponentConstraint {
  loincCode: string;
  display?: string;
  comparator?: 'gt' | 'lt' | 'ge' | 'le' | 'eq';
  value: number;
  unit?: string;
}

interface MedicationConstraint {
  medicationCode: string;
  status?: string; // default "active"
  daysBack?: number; // default 90
}

interface ServiceConstraint {
  serviceCode: string;
  status?: string; // default "active"
}

interface CohortGroup {
  label: string;
  count: number;
  patientProfile?: PatientProfile; // optional demographic constraints
  conditionCodes?: string[];
  observationConstraints?: ObservationConstraint[];
  noObservations?: boolean;
  medicationRequests?: MedicationConstraint[];
  allergyIntoleranceCodes?: string[];
  procedureCodes?: string[];
  serviceRequests?: ServiceConstraint[];
  createEncounter?: boolean;
  createCarePlan?: boolean;
  patientIds?: string[]; // deterministic UUIDs (overrides random generation)
}

interface SeedSpec {
  description?: string;
  cohortGroups: CohortGroup[];
  expectedCohortSize?: number;
}
```

---

## 11. Error Handling

### HTTP Status Codes

| Status                      | Cause                                                            | Frontend action                                                                             |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `200 OK`                    | Success with body                                                | Render response                                                                             |
| `202 Accepted`              | Async job submitted                                              | Store `runId`/`seedJobId`, begin polling                                                    |
| `204 No Content`            | Mutation succeeded                                               | Update UI state                                                                             |
| `400 Bad Request`           | Invalid params, unknown modelId, seed cohort over limit          | Show `message` from response body                                                           |
| `403 Forbidden`             | Not session owner, or missing `agentbuilder` role                | Show access-denied message                                                                  |
| `404 Not Found`             | Resource not found                                               | Show not-found state                                                                        |
| `409 Conflict`              | Lifecycle state violation — wrong source state for transition    | Show `error` from response body; display the current state                                  |
| `422 Unprocessable Entity`  | Session has no `finalized_persona_id` (persona not yet written)  | Inform user the session is incomplete                                                       |
| `429 Too Many Requests`     | LLM provider token rate limit exceeded after server-side retries | Show "AI service temporarily busy" toast; offer retry button; do not auto-retry immediately |
| `500 Internal Server Error` | Unexpected error                                                 | Show generic error, offer retry                                                             |

### Rate Limiting (429)

The server automatically retries LLM requests on 429 with exponential back-off (up to 3 attempts: 5 s → 10 s → 20 s). A 429 propagated to the frontend means all server-side retries were exhausted. This can happen when a GPT-6 reasoning model deployment is under heavy load; the long reasoning token budget makes each request more expensive against the token-per-minute quota.

**Recommended frontend pattern:**

```typescript
async function sendMessage(sessionId: string, message: string) {
  const res = await fetch(`/api/agentbuilder/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (res.status === 429) {
    showToast(
      'The AI service is temporarily busy. Please wait a moment and try again.',
      'warning',
    );
    return; // let the user decide when to retry
  }
  if (!res.ok) {
    showToast('Something went wrong. Please try again.', 'error');
    return;
  }
  // handle SSE stream ...
}
```

> **Model guidance:** If users regularly hit 429 with GPT-6 Astra or GPT-6 Luna, suggest switching to GPT-5.5 for the authoring session — it has the same 100K TPM quota but smaller per-request token cost. GPT-6 models are recommended for complex persona designs only.

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
           modelId:"gpt-6-astra",          // optional; from GET /api/agentbuilder/models; omit for server default (gpt-5.5 on Azure)
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

### 13.0 Eval Sandbox Schema Isolation (Safety Requirement)

> **Non-negotiable architectural decision.** All agent persona evaluation seed data lives in the dedicated `agentsandbox` PostgreSQL schema, not in any production schema.

The FHIR server uses three production schemas for real patient data:

| Schema        | Contents                                          |
| ------------- | ------------------------------------------------- |
| `fhir`        | Default FHIR resources                            |
| `masterdata`  | Patient demographics                              |
| `patientdata` | Clinical resources (Condition, Observation, etc.) |

Eval tenant IDs follow the pattern `eval-<uuid>`. **Any resource created by `SeedDataGenerator` for an eval tenant goes to `agentsandbox.fhir_resource`**, regardless of resource type. The routing layer (`DefaultPostgresJsonbProvider.resolveSchema()`) enforces this: when `tenantId.startsWith("eval-")` the schema is always `"agentsandbox"`.

`_has` reverse-chaining subqueries (e.g. `Patient?_has:Condition:patient:code=...`) also resolve linked resources within `agentsandbox` when the outer query is for an eval tenant — synthetic data never cross-references production tables.

Teardown (`POST /experiments/eval/$teardown`) deletes rows from `agentsandbox.fhir_resource` only. Production schemas are never touched.

**Why this matters for the portal:** Eval evaluation results are meaningful only when the agent queries the same schema the data was seeded into. If routing is ever changed so eval tenants query a production schema, evaluations will return 0 results and scores will be 0. The `agentsandbox` isolation is the single most important invariant of the eval pipeline.

---

All business-logic tables live in the `workflow` schema of the PostgreSQL database.

| Table                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow.agent_persona_definition`        | **Central persona store.** One row per `(persona_id, version, tenant_id)`. Holds `definition_yaml` (raw YAML), `system_prompt` (resolved system prompt text), `lifecycle_state`, `authoring_source` (`platform` / `portal`), `owner_user_id`, and `is_active`. **Platform personas are seeded at server startup** by `PlatformPersonaSeedService` which reads classpath YAML files and upserts them with `authoring_source='platform'` and `lifecycle_state='PRODUCTION_APPROVED'`. Portal personas are written by the `write_persona_config` MCP tool with `authoring_source='portal'`. Only `PRODUCTION_APPROVED + active=true` versions are loaded into `AgentPersonaRegistry` for live mission execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow.platform_agent_onboarding`       | **Authoring session state.** One row per authoring session. Stores `session_id`, `owner_user_id`, `authoring_mode` (`FROM_SCRATCH` or `ADAPT_FROM`), `source_persona_id/version` for adapt mode, `status` (`IN_PROGRESS`, `AWAITING_REVIEW`, `COMPLETE`, `ABANDONED`), `current_phase`, `phase_status` JSONB (per-phase progress summary), `selected_model_id` (LLM chosen at session creation — null means server default), `description` (user-supplied human-readable description of what the persona should do — collected by the portal before authoring begins and displayed on session cards), `authoring_step` VARCHAR(50) (non-null = Phase 0 in progress; null = Phase 0 complete or session is ADAPT_FROM; possible values: `P0_OUTCOME_INTAKE`, `P0_PROXY_QUESTIONS`, `P0_TYPE_DECISION`, `P0_COHORT_CHECK`, `P0_COHORT_RECIPE`, `P0_AUTHORING_MODE`), `collected_data` JSONB (Phase 0 answers accumulated as keys: `outcome`, `q1`–`q7`, `typeRecommendation`, `typeDecision`, `hasCohort`, `cohortDescription`, `authoringMode`), the full `conversation` JSONB (turn history for resume; returned by `$resume` and `GET /messages` with tool internals stripped), and `spec_markdown` (the accumulated persona specification document). This is the portal-side equivalent of the CLI's `docs/personas/<Persona>.md` file. |
| `workflow.platform_agent_onboarding_phase` | **Per-phase artifacts** (child of `platform_agent_onboarding`). One row per `(session_id, phase_number)`. Stores phase-specific content (YAML, Markdown, JSON) produced by each authoring skill phase. Decoupled so the schema supports any number of phases without DDL changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `workflow.platform_authoring_memory`       | **Per-user authoring memory.** Analogous to Claude Code's file-based memory system. One row per `(tenant_id, user_id, memory_key)`. Types: `user` (role/preferences), `feedback` (what to avoid/repeat), `project` (ongoing work), `reference` (external pointers). Injected into the system prompt at session start so the AI agent has continuity across sessions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workflow.platform_persona_artifact`       | **Intermediate skill artifacts** scoped to a session. Keyed by `(session_id, path)`. Stores files generated during authoring: `system.md`, companion skill YAMLs, formatters, confirmed terminology codes, and generated BDD feature files. `write_artifact` / `read_artifact` MCP tools read and write this table. Materialized to the server's `fhir-config/` directory when a persona is promoted to `PRODUCTION_APPROVED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `workflow.persona_evaluation_run`          | **Evaluation run records.** One row per async eval run. Stores `run_status` (`PENDING` → `RUNNING` → `COMPLETED` / `FAILED`), `quality_score` (0–100), `quality_dimensions` JSONB (per-dimension breakdown), `simulated_question` + `persona_response` (for the portal's Q&A replay view), `replay_trace` JSONB (full step-by-step execution trace), `human_rating` (1–5 optional reviewer score), `hitl_sim_strategy` VARCHAR (the HITL strategy used — `APPROVE`, `REJECT`, or `REFINE`), and `hitl_comparison_group` UUID (shared UUID across the three runs of a `$submit-hitl-comparison` batch; indexed for fast group queries). Each run targets an isolated `eval_tenant_id` sandbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow.persona_eval_scenario`           | **Evaluation scenario definitions.** Scenarios are reusable — the same scenario can be run against multiple persona versions. Created via `POST /api/agentbuilder/scenarios`. Contains `seed_spec` (cohort descriptor for auto-generated FHIR test data; seeded in Step 1 before eval submit), `mission_params` (typed params for parameter-driven personas), `conversation_script` (free-text turns for chat personas), `hitl_script` (canned HITL responses), `response_criteria` (auto-generated rubric from `RubricGenerator` when `generateRubric=true`), `score_weights`, `hitl_sim_config` JSONB (declarative HITL strategy for `$submit-hitl-comparison`; see §7.C), and `hitl_strategy_gold_sets` JSONB (per-strategy expected write bundles). Referenced by `persona_evaluation_run.scenario_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workflow.terminology_concept`             | **Tenant-specific clinical coding store** (Flyway V166). Keyed by `(tenant_id, resource_type, name, system)`. Stores `code`, `display`, `display_name`, and `created_by`. The `search_terminology` MCP tool queries this table first for the caller's tenant before falling back to the classpath SNOMED/LOINC/RxNorm YAML. Managed via `GET/POST/DELETE /api/agentbuilder/terminology`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
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
terminology_concept (standalone, keyed by tenant_id + resource_type + name + system)
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

# Terminology (PersonaBrowseController)
GET    /api/agentbuilder/terminology                           List/search tenant-specific coding concepts
POST   /api/agentbuilder/terminology                           Create a new tenant terminology concept (returns 201)
DELETE /api/agentbuilder/terminology/{id}                      Delete a terminology concept by numeric ID (returns 204)

# HITL Comparison (PersonaExperimentController)
POST   /api/agentbuilder/experiments/eval/$submit-hitl-comparison  Submit 3 parallel runs (APPROVE/REJECT/REFINE); returns comparisonGroup + runIds

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
    "fhir_discover": {},
    "fhir_query": {
      "allowedResourceTypes": {
        "Patient": {},
        "Observation": {},
        "Condition": {},
        "DiagnosticReport": {},
        "MedicationRequest": {},
        "MedicationDispense": {},
        "CarePlan": {},
        "FamilyMemberHistory": {},
        "Appointment": {},
        "DocumentReference": {},
        "CareTeam": {},
        "Immunization": {},
        "ImmunizationRecommendation": {},
        "Encounter": {},
        "Procedure": {},
        "AllergyIntolerance": {},
        "ServiceRequest": {}
      }
    },
    "fhir_decomposer": {
      "allowedResourceTypes": {
        "Observation": {},
        "MedicationRequest": {},
        "Condition": {},
        "AllergyIntolerance": {},
        "Procedure": {},
        "Immunization": {}
      }
    },
    "fhir_mutate": {
      "allowedResourceTypes": {
        "Condition": {},
        "Observation": {},
        "DiagnosticReport": {},
        "MedicationRequest": {},
        "CarePlan": {},
        "ServiceRequest": {},
        "Bundle": {}
      }
    },
    "propose_plan": {},
    "request_intervention": {},
    "spawn_agent": {},
    "mission_complete": {}
  },
  "roleValidation": {
    "enforceAtActivation": true,
    "enforceAtMissionCreation": true,
    "enforceAtChannelBinding": true
  },
  "completionCriteria": [
    {
      "type": "agent-declared",
      "description": "Agent calls mission_complete after delivering the clinical assessment or after a write operation is committed, rejected, or cancelled."
    }
  ],
  "metadata": {
    "requiresDelegation": true,
    "preSkillIds": ["digital-twin-prefetch-patient-context"],
    "postSkillIds": [],
    "intended-user-role": "CLINICIAN"
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
      "allowedResourceTypes": {
        "MedicationRequest": { "defaultSearchParams": { "status": "active" } },
        "CarePlan": {
          "defaultSearchParams": {
            "category": "http://snomed.info/sct|736284000",
            "status": "draft,active,on-hold"
          }
        },
        "Observation": {},
        "Patient": {}
      }
    },
    "fhir_mutate": {
      "allowedResourceTypes": {
        "CarePlan": {},
        "Bundle": {}
      }
    },
    "propose_plan": {},
    "request_intervention": {},
    "skill_invoke": {},
    "mission_complete": {}
  },
  "roleValidation": {
    "enforceAtActivation": true,
    "enforceAtMissionCreation": true,
    "enforceAtChannelBinding": true
  },
  "completionCriteria": [
    {
      "type": "agent-declared",
      "description": "Agent calls mission_complete after the care manager approves the drafted CarePlans via request_intervention."
    }
  ],
  "metadata": {
    "requiresDelegation": true,
    "intended-user-role": "CARE_COORDINATOR"
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
