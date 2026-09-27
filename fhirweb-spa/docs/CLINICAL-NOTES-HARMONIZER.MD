 <!-- @suppress WikiTextMarkupValidation -->

# Clinical Notes Harmonizer: Setup & Integration Guide

**Version**: 1.1  
**Status**: Production-Ready  
**Last Updated**: 2026-09-27 — review before save, duplicate checks, AI-generation provenance, pre-flight RBAC check, source-document audit, `pipeline-review` interventions and mission list (see [Review Before Save](#review-before-save-clinical-docs-harmonizer))  
**Audience**: Healthcare IT Architects, EHR Integration Engineers, Clinical Documentation Teams

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Components](#architecture--components)
3. [Prerequisites](#prerequisites)
4. [Setup & Installation](#setup--installation)
5. [Configuration Guide](#configuration-guide)
6. [EHR & Document Source Integration](#ehr--document-source-integration)
7. [API Reference](#api-reference)
8. [Security & Privacy](#security--privacy)
9. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
10. [FAQ & Best Practices](#faq--best-practices)
11. [Appendix: Example Configurations](#appendix-example-configurations)

---

## Overview

### What is Clinical Notes Harmonizer?

**Clinical Notes Harmonizer** is a DataPipelinePersona that:

- **Ingests** clinical documents from any format (text, PDF, CDA, HL7v2, plain text notes)
- **Extracts** clinical entities (diagnoses, medications, labs, procedures, vital signs)
- **Transforms** extracted data into FHIR R4/R5 compliant resources
- **Validates** and persists resources atomically to the FHIR database
- **Generates** quality metrics, confidence scores, and clinician summaries

> **Two harmonizer personas.**
>
> - `clinical-notes-harmonizer` runs the 6-step pipeline described below and writes records directly.
> - `clinical-docs-harmonizer` (used by the frontend) adds **review before save**: generated records are staged, checked for duplicates, and written only after a clinician approves them, with AI-generation provenance. See [Review Before Save](#review-before-save-clinical-docs-harmonizer).
>
> Other harmonizers can opt in by adding the same steps and YAML blocks.

### Key Capabilities

| Capability                                       | Description                                                                                     | Example                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Multi-Format Ingestion**                       | Parse text, PDF, CDA, HL7v2, HL7 v2.5.1                                                         | Legacy EHR notes, scanned documents, external referrals         |
| **Clinical Entity Extraction**                   | Auto-extract diagnoses, medications, observations                                               | "Patient on metformin" → MedicationRequest + Condition          |
| **Semantic Code Mapping**                        | Map clinical text to SNOMED, LOINC, RxNorm                                                      | "High blood pressure" → SNOMED 38341003 (Hypertension)          |
| **FHIR Bundle Generation**                       | Create atomic transaction bundles                                                               | All extracted entities bundled for single commit                |
| **Quality Metrics**                              | Extraction confidence, success rates                                                            | "Confidence: 0.92 (high); 5 entities extracted"                 |
| **Risk Flagging**                                | Identify data anomalies, conflicts                                                              | "Medication dosage exceeds max; review required"                |
| **Fixed-DAG Execution**                          | No replanning; deterministic pipeline                                                           | Same input always produces same output                          |
| **Review Before Save** _(docs harmonizer)_       | Records staged for a clinician to edit / exclude / add, then approve, request changes or reject | Nothing reaches the FHIR store until approved                   |
| **Duplicate Checks** _(docs harmonizer)_         | Compares generated records with the patient's existing records and the rest of the document     | Re-imported discharge note → exact duplicates flagged / skipped |
| **AI-Generation Provenance** _(docs harmonizer)_ | Written resources carry mission id, generated / reviewed / approved time and user, confidence   | `extension[ai-generation-provenance]`, `meta.tag ai-generated`  |
| **Pre-Flight Permission Check**                  | Mission refused (`403`) unless the user's RBAC scopes allow creating every written type         | Clinician without `Condition` create cannot start an import     |
| **Mission List & Audit**                         | List missions, view mission output later, download the originally uploaded document             | "My imports", "Waiting for my review"                           |

### Target Users

- **Primary**: EHR integration teams (medical records departments)
- **Secondary**: Clinical documentation specialists (quality review)
- **Tertiary**: Care coordinators (care gap detection from notes)

---

## Architecture & Components

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Clinical Document Sources                   │
│  (EHR Export, Portal Upload, External Referral, Email)  │
└──────────────────────┬──────────────────────────────────┘
                       │
                   HTTP/Async Queue
                       │
┌──────────────────────▼──────────────────────────────────┐
│        Document Harmonizer API Gateway                   │
│  (fhir4java-api module)                                  │
│  - Document format detection                            │
│  - Patient identity resolution                          │
│  - Request validation                                   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│    Pipeline Executor (DataPipelinePersona Runtime)       │
│  (fhir4java-core module)                                │
│  - 6-step fixed DAG execution                           │
│  - Step error handling (fail/retry/skip)                │
│  - Budget enforcement (timeout, token limits)           │
│  - Progress tracking & logging                          │
└──────────────────────┬──────────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────┐      ┌──────────┐      ┌────────────┐
│ STEP 1: │      │ STEP 2: │      │ STEP 3:    │
│ Bulk    │      │ Document│      │ LLM        │
│ Query   │      │ Parse   │      │ Analyze    │
│ (Load   │      │ (Extract│      │ (Extract   │
│ context)│      │ raw text)      │ entities) │
└─────────┘      └──────────┘     └────────────┘
    │                  │                  │
    └──────────────────┼──────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌──────────┐     ┌──────────────┐  ┌──────────┐
│ STEP 4:  │     │ STEP 5:      │  │ STEP 6:  │
│ LLM      │     │ FHIR         │  │ Aggregate│
│ Transform│     │ Write        │  │ (Metrics)│
│ (Map to  │     │ (Persist     │  │          │
│ FHIR)    │     │ bundle)      │  │          │
└──────────┘     └──────────────┘  └──────────┘
    │                  │                  │
    └──────────────────┼──────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │   FHIR Database             │
        │  (PostgreSQL)               │
        │  - Patient records          │
        │  - Conditions               │
        │  - Observations (labs)      │
        │  - Medications              │
        │  - Procedures               │
        │  - Care Plans               │
        │  - Audit logs               │
        └─────────────────────────────┘
```

### 6-Step Pipeline Details

#### Step 1: BULK-QUERY

- **Purpose**: Load patient context (existing conditions, medications, observations)
- **Input**: Patient ID from document header
- **Output**: Patient record + related FHIR resources
- **Latency**: 100-500ms
- **Error Handling**: FAIL (can't proceed without patient context)

#### Step 2: DOCUMENT-PARSE

- **Purpose**: Extract raw text from any document format
- **Supports**:
  - Plain text (.txt)
  - PDF (uses Apache PDFBox)
  - CDA (HL7 Clinical Document Architecture; XML parser)
  - HL7v2 (fixed-width segment parsing)
- **Output**: Normalized text document
- **Latency**: 50-200ms
- **Error Handling**: RETRY on parse failure; FAIL after 3 attempts

#### Step 3: LLM-ANALYZE

- **Purpose**: Extract clinical entities using LLM (structured extraction)
- **LLM Providers**: Ollama (dev), OpenAI (prod), Claude (fallback)
- **Extracts**:
  - Diagnoses (SNOMED codes)
  - Medications (RxNorm codes + dosages)
  - Laboratory observations (LOINC codes + values)
  - Procedures (SNOMED procedure codes)
  - Vital signs (BP, temperature, etc.)
  - Allergies & adverse reactions
- **Confidence Scoring**: Returns 0.0–1.0 per entity
- **Latency**: 1-5 seconds
- **Error Handling**: RETRY with temperature adjustment; SKIP if confidence < 0.7

#### Step 4: LLM-TRANSFORM

- **Purpose**: Map extracted entities to FHIR R4/R5 resources
- **Generates**:
  - Condition resources (with SNOMED codes)
  - Observation resources (labs with LOINC codes)
  - MedicationRequest resources (RxNorm codes)
  - Procedure resources
  - AllergyIntolerance resources
  - DiagnosticReport (for lab panels)
- **Validation**: FHIR StructureDefinition validation
- **Output**: FHIR Bundle (transaction type)
- **Latency**: 500ms-1 second
- **Error Handling**: RETRY if validation fails; FAIL on repeated errors

#### Step 5: FHIR-WRITE

- **Purpose**: Atomically persist FHIR Bundle to database
- **Transaction Type**: Batch with rollback on error
- **Validation**:
  - Reference integrity (all referenced resources exist)
  - Required field validation
  - Code system validation
- **Output**: Created resource IDs
- **Latency**: 200-500ms
- **Error Handling**: FAIL (no retry; atomic transaction)

#### Step 6: AGGREGATE

- **Purpose**: Calculate metrics, identify risk flags, generate summary
- **Metrics Calculated**:
  - Extraction confidence (mean of all entities)
  - Write success rate (resources created / resources intended)
  - Processing time per step
  - Token usage (LLM calls)
- **Risk Flags**:
  - Low confidence extractions (< 0.7)
  - Medication dosage out of normal range
  - New diagnosis conflicting with existing records
  - Missing critical information
- **Output**: Structured summary for clinician review
- **Latency**: 50-100ms
- **Error Handling**: Never fails (summary is always generated)

### Review Before Save (clinical-docs-harmonizer)

`clinical-docs-harmonizer` inserts two steps between LLM-TRANSFORM and FHIR-WRITE:

```
bulk-query → document-parse → llm-analyze → llm-transform → dedup-check → review-gate → fhir-write → aggregate
                                              ▲                              │  ▲
                                              │  request-changes (notes)     │  │ approve
                                              └──────────────────────────────┘  │
                                                          pause: awaiting_review ┘
```

| Step                    | What changes                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **llm-analyze**         | Each entity returns `entityId`, a `confidence` and a verbatim `evidence` quote from the document                                                                                                                                                                                                                                  |
| **llm-transform**       | Each resource carries its source `entityId` (removed before write). R4-shaped output is normalized to R5: `Procedure.performed[x]` → `occurrence[x]`, `Encounter.class` Coding → CodeableConcept, `period` → `actualPeriod`, and LLM-invented `meta.versionId`/`lastUpdated` are dropped                                          |
| **dedup-check** _(new)_ | Classifies each record `NEW` / `POSSIBLE_DUPLICATE` / `EXACT_DUPLICATE` against the patient's existing records and earlier records in the document. Same code and day in a _different encounter_ is only a possible duplicate. Without review, exact duplicates are dropped; with review, they are staged as `SKIPPED_DUPLICATE`. |
| **review-gate** _(new)_ | Stages records in `workflow.pipeline_review_draft` with pre-assigned ids, per-record confidence, evidence and duplicate flags; pauses the job (`awaiting_review`); opens an `AgentInterventionRequest` (`pipeline-review`). A pass-through when review is off for the job.                                                        |
| **fhir-write**          | Writes approved records with `PUT` under the ids shown during review, and stamps the `ai-generation-provenance` extension and `ai-generated` tag (`stampProvenance: true`)                                                                                                                                                        |
| **aggregate**           | Job confidence = mean of the per-record scores; `low_confidence` risk flag below `review.lowConfidenceThreshold`                                                                                                                                                                                                                  |

**Per-record confidence**:

```
clamp(llmConfidence, 0.05, 0.99) × grounding (evidence found 1.0 · fuzzy 0.85 · not found 0.5)
    × terminology (1.0 until a terminology server is configured) − 0.05 per missing key field
```

**Persona YAML blocks** (`clinical-docs-harmonizer.yml`):

```yaml
review:
  enabled: true # per job: $execute input "reviewRequired": true|false
  maxRevisions: 3 # request-changes rounds
  lowConfidenceThreshold: 0.7
  expiresAfter: 7d
dedup:
  enabled: true
  possibleDuplicateWindowDays: 30
authorization:
  preflight: true # RBAC create on every written type, read on every looked-up type
```

**Reviewer actions**:

- `$review…` operations: edit a record, exclude / include it, ignore it (`$ignore-record` — LLM hallucination / unrelated record), add a missed record, resolve a duplicate (`CREATE_NEW` / `SKIP` / `UPDATE_EXISTING`).
- Decide with `approve`, `request-changes` (re-generates with the reviewer's notes; records the reviewer edited are kept) or `reject` (discard).
- Decisions go through `PATCH /api/agent/AgentInterventionRequest/{id}` or `$approve` / `$reject`.

API details: [Review before save, mission output and audit operations](#review-before-save-mission-output-and-audit-operations). Design: `docs/superpowers/specs/2026-09-26-docs-harmonizer-review-dedup-terminology-design.md`. Persona-level guide: `docs/AI-Persona-Design-User-Guide.md` → "DataPipelinePersona Review Before Save, Missions & Audit".

### AI-Generation Provenance Extension

Every FHIR resource written by the `clinical-docs-harmonizer` carries a complex extension that records how, when, and by whom the record was generated and approved. The extension is stamped by the **fhir-write step** immediately before each `PUT`; it is never placed into LLM output, so the model cannot fabricate or corrupt it.

#### Extension URL

```
http://fhir4java.org/StructureDefinition/ai-generation-provenance
```

A `StructureDefinition` for this extension lives under `fhir-config/r5/profiles/` (and `r4b/`), so profile validation accepts it without warnings.

#### Full example on a written resource

```json
{
  "resourceType": "Condition",
  "id": "7f3c-abc-...",
  "meta": {
    "tag": [
      {
        "system": "http://fhir4java.org/CodeSystem/data-origin",
        "code": "ai-generated"
      }
    ]
  },
  "extension": [
    {
      "url": "http://fhir4java.org/StructureDefinition/ai-generation-provenance",
      "extension": [
        { "url": "generatedAt",    "valueDateTime": "2026-09-26T08:14:03Z" },
        { "url": "missionId",      "valueString":   "exec-async-456" },
        { "url": "personaId",      "valueString":   "clinical-docs-harmonizer" },
        { "url": "personaVersion", "valueString":   "1.0.0" },
        { "url": "revision",       "valueInteger":  2 },
        { "url": "confidence",     "valueDecimal":  0.87 },
        { "url": "humanEdited",    "valueBoolean":  true },
        { "url": "reviewedAt",     "valueDateTime": "2026-09-26T09:02:11Z" },
        { "url": "reviewedBy",     "valueString":   "user-dr-chan" },
        { "url": "approvedAt",     "valueDateTime": "2026-09-26T09:05:40Z" },
        { "url": "approvedBy",     "valueString":   "user-dr-chan" }
      ]
    }
  ],
  ...
}
```

#### Attribute reference

| Sub-extension URL | FHIR type       | Set by          | Description                                                                                                                                  |
| ----------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `generatedAt`     | `valueDateTime` | fhir-write step | When the LLM generated this draft (start of the revision that produced it)                                                                   |
| `missionId`       | `valueString`   | fhir-write step | The `jobId` / `executionId`; use with `$mission-output?job=` to retrieve the full job record                                                 |
| `personaId`       | `valueString`   | fhir-write step | The DataPipelinePersona that generated the record, e.g. `clinical-docs-harmonizer`                                                           |
| `personaVersion`  | `valueString`   | fhir-write step | Version of the persona YAML at the time the job ran                                                                                          |
| `revision`        | `valueInteger`  | fhir-write step | Which request-changes round produced this record (`1` = first attempt, `2` = after first request-changes, …)                                 |
| `confidence`      | `valueDecimal`  | fhir-write step | Per-record confidence score (0–1) calculated in the review gate: `llmConfidence × groundingFactor × terminologyFactor − completenessPenalty` |
| `humanEdited`     | `valueBoolean`  | fhir-write step | `true` if a reviewer edited this record's FHIR JSON during review before approving                                                           |
| `reviewedAt`      | `valueDateTime` | fhir-write step | When the reviewer first opened / claimed the review (or the time of the last manual edit if no claim)                                        |
| `reviewedBy`      | `valueString`   | fhir-write step | User ID of the reviewer                                                                                                                      |
| `approvedAt`      | `valueDateTime` | fhir-write step | When the `$approve` decision was made                                                                                                        |
| `approvedBy`      | `valueString`   | fhir-write step | User ID of the approver (may differ from `reviewedBy` if claims are shared)                                                                  |

> `reviewedAt` and `approvedAt` are different moments and both are preserved for audit. A resource approved without a prior claim has both set to the approval time.

#### `meta.tag`: `ai-generated`

In addition to the extension, every written resource has a `meta.tag` entry:

```json
"meta": {
  "tag": [{ "system": "http://fhir4java.org/CodeSystem/data-origin", "code": "ai-generated" }]
}
```

This tag lets any consumer — clinicians, downstream agents, FHIR subscriptions — identify AI-generated records without inspecting the extension.

#### Searching by tag and extension

```bash
# All AI-generated Conditions for a patient
GET /fhir/r5/Condition?patient=Patient/P12345&_tag=http://fhir4java.org/CodeSystem/data-origin|ai-generated

# Find every resource from a specific harmonizer job
GET /fhir/r5/Condition?_tag=http://fhir4java.org/CodeSystem/data-origin|ai-generated&_has:Condition:_extension=missionId|exec-async-456
```

To trace a record back to its source document and review history use `$mission-output?job={missionId}` or `$source-document?job={missionId}` on the `DataPipelinePersona` endpoint.

### Key Components

#### 1. Clinical Notes Harmonizer Persona Definition

**File**: `fhir-config/personas/harmonizer.yml`

- Declares pipeline scope (DOMAIN-level for endocrinology)
- Defines 6-step DAG structure
- Specifies completion criteria (ALL_STEPS_COMPLETE)
- Sets performance budget (timeout, max tokens)

#### 2. Pipeline Executor

**Class**: `PipelineExecutor` (fhir4java-core)

- Executes steps sequentially (no parallelization)
- Enforces timeouts and budget constraints
- Handles step failures per configured fallback actions
- Logs audit trail per step

#### 3. Document Parser

**Class**: `DocumentParserService` (fhir4java-core)

- Detects format automatically (magic bytes or extension)
- Extracts raw text from PDF/CDA/HL7v2
- Normalizes whitespace and encoding
- Returns structured DocumentMetadata

#### 4. LLM Entity Extractor

**Class**: `LlmEntityExtractorService` (fhir4java-core)

- Calls LLM with structured prompt for extraction
- Parses JSON response (extracted entities + confidence)
- Validates against clinical ontologies (SNOMED, LOINC, RxNorm)
- Returns structured EntitySet

#### 5. FHIR Resource Generator

**Class**: `FhirBundleGeneratorService` (fhir4java-core)

- Maps extracted entities to FHIR resources
- Resolves code system bindings
- Creates proper resource references
- Builds transaction Bundle

#### 6. Quality Metrics Engine

**Class**: `HarmonizationMetricsService` (fhir4java-core)

- Calculates confidence scores
- Identifies risk flags
- Generates clinician-facing summary
- Formats for compliance/audit

---

## Prerequisites

### System Requirements

- **Java**: 21 LTS or later
- **Spring Boot**: 3.4+
- **PostgreSQL**: 16+ (for persistent storage)
- **Memory**: 4GB minimum (2GB heap, 2GB JVM)
- **CPU**: 4 cores recommended (document parsing is CPU-intensive)
- **Disk**: 50GB minimum (documents + FHIR database)
- **Storage**: 1-5GB per 10,000 documents (with FHIR resources)

### External Dependencies

| Dependency           | Version | Purpose                |
| -------------------- | ------- | ---------------------- |
| Apache PDFBox        | 3.0+    | PDF text extraction    |
| HAPI FHIR            | 7.x     | FHIR resource handling |
| LangChain4J          | Latest  | LLM integration        |
| Spring Data JPA      | 3.4+    | ORM for database       |
| PostgreSQL JDBC      | 42+     | Database connectivity  |
| OpenAI/Anthropic SDK | Latest  | LLM provider access    |

### Required Infrastructure

1. **FHIR Server** (self: fhir4java-server)
   - Hosting clinical records
   - Support for R4B or R5 FHIR version
   - Transaction Bundle support (for atomic writes)

2. **PostgreSQL Database** (required)
   - FHIR resource tables (fhir_resource)
   - Document staging table (incoming_document)
   - Harmonization job table (harmonization_job)
   - Search indexes (fhir_search_param)

3. **Document Storage** (required)
   - S3-compatible object store (AWS S3, MinIO, or local filesystem)
   - For storing raw documents + parsed output
   - Retention policy (e.g., 7 years for compliance)

4. **LLM Provider** (required)
   - OpenAI GPT-4 Turbo (recommended)
   - Anthropic Claude 3 (fallback)
   - Local Ollama (development/cost-saving)

5. **Message Queue** (recommended)
   - Apache Kafka or RabbitMQ for async document processing
   - For handling large volumes without blocking API

### Credentials & Access

- **EHR API credentials** (if connecting to external EHR)
- **LLM API key** (OpenAI, Anthropic, or Ollama endpoint)
- **Document storage credentials** (S3 access key, or local filesystem path)
- **FHIR server access token** (for writing resources)

---

## Setup & Installation

### Step 1: Clone & Build

```bash
# Clone repository
git clone https://github.com/your-org/agentic-services.git
cd agentic-services

# Build with Maven Wrapper
./mvnw clean install -DskipTests

# Or with Docker Compose (includes PostgreSQL)
docker compose build
docker compose up -d
```

### Step 2: Database Schema (Generic Pipeline Infrastructure)

**IMPORTANT**: Clinical Notes Harmonizer uses **generic DataPipelinePersona infrastructure** shared by all pipelines (implemented as GAP 22 in MASTER-Persona-Audit-Implementation-Gaps-Recommendations.md).

Flyway migrations create these tables in the `workflow` schema (see also: docs/superpowers/plans/2026-06-20-pipeline-job-step-persistence-complete-implementation.md):

#### **Table: pipeline_job** (Execution Metadata)

```sql
CREATE TABLE workflow.pipeline_job (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    pipeline_id VARCHAR(255) NOT NULL,      -- 'clinical-note-harmonizer'
    trigger_type VARCHAR(30) NOT NULL,      -- manual, scheduled, event-driven
    trigger_ref VARCHAR(255),                -- Reference to triggering event
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, RUNNING, COMPLETED, FAILED
    current_step_id VARCHAR(100),
    context JSONB NOT NULL DEFAULT '{}',    -- Input params: patientId, documentUrl, documentType
    submitted_by VARCHAR(255),               -- User who triggered
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
-- Indexes
CREATE INDEX idx_pipeline_job_tenant_status ON workflow.pipeline_job(tenant_id, status);
CREATE INDEX idx_pipeline_job_pipeline ON workflow.pipeline_job(pipeline_id, status, created_at);
```

#### **Table: pipeline_job_step** (Per-Step Execution & Progress)

```sql
CREATE TABLE workflow.pipeline_job_step (
    job_id UUID NOT NULL REFERENCES workflow.pipeline_job(id) ON DELETE CASCADE,
    step_id VARCHAR(100) NOT NULL,
    step_sequence INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, RUNNING, COMPLETED, FAILED, SKIPPED
    total_items BIGINT,
    processed_items BIGINT NOT NULL DEFAULT 0,
    failed_items BIGINT NOT NULL DEFAULT 0,
    batch_size INT,
    total_batches INT,
    completed_batches INT NOT NULL DEFAULT 0,
    batch_cursor JSONB,                      -- Resume point for interrupted batches
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_detail TEXT,                       -- Error message if step failed
    PRIMARY KEY (job_id, step_id)
);
-- Indexes
CREATE INDEX idx_pipeline_job_step_status ON workflow.pipeline_job_step(job_id, status);
```

#### **Table: pipeline_job_step_data** (Document Content & Entity Tracking)

```sql
-- HASH-PARTITIONED for scalability (4 partitions: p0, p1, p2, p3)
CREATE TABLE workflow.pipeline_job_step_data (
    job_id UUID NOT NULL,
    step_id VARCHAR(100) NOT NULL,           -- bulk-query, document-parse, llm-analyze, llm-transform, fhir-write
    item_id VARCHAR(255) NOT NULL,           -- Unique per entity (e.g., entity-1, resource-123)
    batch_number INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    data JSONB,                              -- ← RAW DOCUMENT or EXTRACTED ENTITY or FHIR RESOURCE
    source_flags JSONB,                      -- Multi-source status flags
    confidence NUMERIC(5,4),                 -- Confidence of extraction (0.0-1.0)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    PRIMARY KEY (job_id, step_id, item_id)
) PARTITION BY HASH (job_id);

-- 4 initial partitions
CREATE TABLE workflow.pipeline_job_step_data_p0 PARTITION OF workflow.pipeline_job_step_data FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE workflow.pipeline_job_step_data_p1 PARTITION OF workflow.pipeline_job_step_data FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE workflow.pipeline_job_step_data_p2 PARTITION OF workflow.pipeline_job_step_data FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE workflow.pipeline_job_step_data_p3 PARTITION OF workflow.pipeline_job_step_data FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Indexes
CREATE INDEX idx_pipeline_jsd_pending ON workflow.pipeline_job_step_data(job_id, step_id, status) WHERE status = 'PENDING';
CREATE INDEX idx_pipeline_jsd_source_flags ON workflow.pipeline_job_step_data USING gin(source_flags);
```

#### **Table: pipeline_job_step_failure** (Error Tracking)

```sql
CREATE TABLE workflow.pipeline_job_step_failure (
    job_id UUID NOT NULL,
    step_id VARCHAR(100) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    batch_number INT NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    error_detail TEXT,                       -- Error message
    context_data JSONB,                      -- Context when error occurred
    failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, step_id, item_id),
    FOREIGN KEY (job_id, step_id) REFERENCES workflow.pipeline_job_step(job_id, step_id) ON DELETE CASCADE
);
```

#### **Table: pipeline_risk_flags** (Data Quality & Anomalies)

```sql
CREATE TABLE workflow.pipeline_risk_flags (
    id BIGSERIAL PRIMARY KEY,
    execution_id VARCHAR(255) NOT NULL,
    flag_type VARCHAR(100) NOT NULL,        -- LOW_CONFIDENCE, DOSAGE_EXCEED, CONFLICT, MISSING_DATA
    severity VARCHAR(20) NOT NULL,          -- INFO, WARNING, ERROR, CRITICAL
    message TEXT NOT NULL,                  -- Human-readable description
    remediation_hint TEXT,                  -- Suggested fix
    step_name VARCHAR(100),                 -- Which step detected it
    entity_reference VARCHAR(255),          -- Reference to problematic entity
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_execution_flags (execution_id, severity),
    INDEX idx_flag_type (flag_type)
);
```

#### **Table: pipeline_metrics** (Performance & Quality Metrics)

```sql
CREATE TABLE workflow.pipeline_metrics (
    id BIGSERIAL PRIMARY KEY,
    execution_id VARCHAR(255) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,      -- extraction_confidence, entity_count, tokens_used, duration_ms
    metric_type VARCHAR(50) NOT NULL,       -- NUMERIC, PERCENTAGE, COUNT, DURATION_MS
    metric_value VARCHAR(255) NOT NULL,
    threshold_min VARCHAR(255),
    threshold_max VARCHAR(255),
    within_threshold BOOLEAN,
    step_name VARCHAR(100),                 -- Which step produced this metric
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_execution_metric (execution_id, metric_name),
    INDEX idx_metric_name (metric_name)
);
```

#### **Table: pipeline_cost_tracking** (LLM Model Cost Tracking - GAP 20)

```sql
CREATE TABLE workflow.pipeline_cost_tracking (
    id BIGSERIAL PRIMARY KEY,
    execution_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,          -- anthropic, openai, azure, ollama
    model VARCHAR(100) NOT NULL,            -- claude-3-5-sonnet, gpt-4o
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    cost_per_1k_input_tokens DECIMAL(10,6),
    cost_per_1k_output_tokens DECIMAL(10,6),
    total_cost_usd DECIMAL(12,6),
    step_name VARCHAR(100),                 -- Which step used this model
    request_timestamp TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_execution_provider (execution_id, provider),
    INDEX idx_provider_model (provider, model)
);
```

### Document Storage Flow

**Raw Document Storage**:

- Step 1 uploads document → stored in `pipeline_job_step_data` where `step_id='bulk-query'` (patient context)
- Step 2 parses document → stored in `pipeline_job_step_data` where `step_id='document-parse'` with `data` JSONB containing raw text
- Format: Base64-encoded, plain text, or URL reference (e.g., `s3://bucket/file.pdf`)

**Entity Extraction & Resource Mapping**:

- Step 3 extracts entities → stored in `pipeline_job_step_data` where `step_id='llm-analyze'` with extracted entities + confidence scores
- Step 4 transforms to FHIR → stored in `pipeline_job_step_data` where `step_id='llm-transform'` with FHIR resource JSON
- Step 5 persists resources → stored in `pipeline_job_step_data` where `step_id='fhir-write'` with resourceId reference

**Traceability**: Use `job_id` + `item_id` to trace a single entity through all transformation steps

### Step 3: Configuration

The Clinical Notes Harmonizer is **configured entirely via YAML** in `fhir4java-server/src/main/resources/fhir-config/personas/clinical-notes-harmonizer.yml`. The persona YAML includes all pipeline-specific settings (timeouts, retries, persistence strategies, etc.).

**Important**: The following `application.yml` configuration sections are **DEPRECATED** and should be **REMOVED** or updated:

#### ❌ DEPRECATED: Document-Parsing Configuration

```yaml
# REMOVE OR COMMENT OUT - NO LONGER USED
# Document parsing is now configured in:
# - clinical-notes-harmonizer.yml (Step 2 config.vision-model-alias, timeouts)
# - LLM provider-specific config (fhir4java.ai.models.providers.{provider}.vision.*)

fhir4java:
  document-parsing:
    image:
      vision-model-enabled: true
      vision-model-max-size-bytes: 2097152 # DEPRECATED
      skip-log-level: INFO
      ocr-prompt: |
        Extract all text from this medical document.
        Return only the extracted text, no additional commentary.
    ocr:
      enabled: true
      primary-provider: medgemma:4b # DEPRECATED - use model alias instead
      fallback-provider: tesseract
      qwen2.5vl:
        enabled: true
        prompt: '...' # DEPRECATED - use promptPath in persona YAML
      tesseract:
        enabled: true
```

**Replaced by**: Vision model alias configuration in LLM provider settings:

```yaml
fhir4java:
  ai:
    models:
      providers:
        ollama:
          vision:
            aliases:
              ocr:
                name: 'qwen2.5vl:latest'
        bedrock:
          vision:
            aliases:
              ocr:
                name: 'global.anthropic.claude-haiku-4-5-20251001-v1:0'
```

#### ❌ DEPRECATED: Resource Normalization Configuration

```yaml
# REMOVE OR COMMENT OUT - NO LONGER USED
# Resource normalization is now configured in:
# - fhir4java-server/src/main/resources/fhir-config/bindings/*.yml
# - Automatically applied by LlmTransformStepExecutor in Step 4

fhir4java:
  normalization:
    enabled: true
    status-mappings:
      Encounter:
        finished: completed
        # ... other mappings ... DEPRECATED
      Condition:
        # ... DEPRECATED
      # ... other resources ... DEPRECATED
```

**Replaced by**: Per-resource YAML configuration files:

```
fhir-config/bindings/Encounter.yml
fhir-config/bindings/Condition.yml
fhir-config/bindings/Observation.yml
fhir-config/bindings/Procedure.yml
fhir-config/bindings/MedicationRequest.yml
```

See: `fhir-config/bindings/README.md` for binding structure details.

#### ✅ KEEP: LLM Provider Configuration

LLM provider configuration **is still required** in `application.yml`:

```yaml
fhir4java:
  ai:
    models:
      providers:
        # Example: Ollama with model aliases
        ollama:
          enabled: true
          base-url: http://localhost:11434
          llm-extraction:
            aliases:
              smart:
                name: 'neural-chat:latest'
          vision:
            aliases:
              ocr:
                name: 'qwen2.5vl:latest'

        # Example: Bedrock with Claude
        bedrock:
          enabled: true
          region: us-east-1
          llm-extraction:
            aliases:
              smart:
                name: 'anthropic.claude-3-5-sonnet-20241022-v2:0'
          vision:
            aliases:
              ocr:
                name: 'global.anthropic.claude-haiku-4-5-20251001-v1:0'
```

#### ✅ KEEP: Standard Configuration

Create `application-production.yml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/fhir4java
    username: fhir_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 25
      minimum-idle: 5

fhir4java:
  # Multi-tenancy
  tenant:
    enabled: true
    default-tenant-id: default
    header-name: X-Tenant-ID

  # LLM provider (see examples above)
  ai:
    models:
      providers:
        ollama: # or bedrock, openai, claude, etc.
          enabled: true
          base-url: http://localhost:11434

  # Monitoring & logging
  monitoring:
    prometheus-enabled: true

logging:
  level:
    org.fhirframework.core.pipeline: INFO
    org.fhirframework.core.document: DEBUG
  pattern:
    file: '%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger - %msg%n'
  file:
    name: /var/log/fhir4java/harmonizer.log
    max-size: 100MB
    max-history: 30
```

### Step 4: Persona Activation

Activate Harmonizer for your organization:

```bash
curl -X POST http://localhost:8080/api/v1/personas/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "personaId": "clinical-note-harmonizer",
    "tenantId": "your-tenant-uuid",
    "scope": {
      "level": "DOMAIN",
      "domainCode": "endocrinology"
    },
    "grantedBy": "admin@hospital.org"
  }'
```

### Step 5: Test Integration

```bash
# Test document upload endpoint
curl -X POST http://localhost:8080/api/personas/clinical-notes-harmonizer/import \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: your-tenant-uuid" \
  -d '{
    "patientId": "P12345",
    "documentContent": "Patient presents with type 2 diabetes. HbA1c 8.5%. Started on metformin 500mg BID.",
    "documentType": "text",
    "metadata": {
      "source": "Clinic Note",
      "date": "2026-06-16"
    }
  }'

# Response:
{
  "jobId": "job-abc123",
  "status": "RUNNING",
  "patientId": "P12345",
  "message": "Processing started"
}

# Check status
curl http://localhost:8080/api/personas/clinical-notes-harmonizer/jobs/job-abc123 \
  -H "X-Tenant-ID: your-tenant-uuid"
```

**Docs harmonizer with review before save** (unified endpoint, signed-in user token):

```bash
# 0. May this user run it? → {"allowed": true, "roles": [...], "missing": []}
curl http://localhost:8080/api/persona/DataPipelinePersona/clinical-docs-harmonizer/\$can-execute \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default"

# 1. Submit (async). Add "reviewRequired": false inside inputs to skip review for this job
curl -X POST http://localhost:8080/api/persona/DataPipelinePersona/clinical-docs-harmonizer/\$execute \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default" -H "Content-Type: application/json" \
  -d '{"inputs": {"patientId": "P12345", "documentType": "text", "documentName": "clinic-note.txt",
                  "documentContent": "Type 2 diabetes. HbA1c 8.5%. Started metformin 500mg BID."},
       "execution": {"mode": "async"}}'
# → 202 {"status":"queued","jobId":"<jobId>","reviewRequired":true,"statusUrl":"…/$status?job=<jobId>"}

# 2. Poll until "status": "awaiting_review" (carries reviewUrl + interventionId)
curl ".../clinical-docs-harmonizer/\$status?job=<jobId>" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default"

# 3. Review the staged records (note the ETag)
curl -i ".../clinical-docs-harmonizer/\$review?job=<jobId>" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default"

# 4. Approve through the intervention (or POST .../$approve?job=<jobId>)
curl -X PATCH http://localhost:8080/api/agent/AgentInterventionRequest/<interventionId> \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default" -H "If-Match: <ETag>" \
  -H "Content-Type: application/json" -d '{"decision": "approve", "notes": "Checked against source"}'

# 5. When "completed": the records created, with resourceType + resourceId
curl ".../clinical-docs-harmonizer/\$mission-output?job=<jobId>" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: default"
```

---

## Configuration Guide

### Overview: YAML-Driven Configuration Model

As of Phase 3 (2026-06), the Clinical Notes Harmonizer moved from **application.yml-based configuration** to a **YAML-driven pipeline model**:

| Aspect                 | Old (application.yml)             | New (fhir-config/personas/)                          |
| ---------------------- | --------------------------------- | ---------------------------------------------------- |
| Pipeline definition    | ❌ Not defined                    | ✅ clinical-notes-harmonizer.yml                     |
| Step timeouts          | application.yml                   | clinical-notes-harmonizer.yml (per-step)             |
| LLM prompts            | Hardcoded in code                 | ✅ fhir-config/prompts/\*.txt                        |
| Resource normalization | application.yml (status-mappings) | ✅ fhir-config/bindings/\*.yml                       |
| Document parsing       | application.yml                   | ✅ clinical-notes-harmonizer.yml (Step 2 config)     |
| Completion criteria    | Implicit                          | ✅ clinical-notes-harmonizer.yml (explicit strategy) |

**Benefits**:

- Pipelines can be customized without code changes
- Easy to create domain-specific variants (cardiology, oncology, etc.)
- No application restart needed for prompt/binding changes
- Audit trail of changes via YAML versioning
- Shared infrastructure across all DataPipelinePersona

### Harmonizer Persona YAML Definition (Reference Implementation)

**Location**: `fhir4java-server/src/main/resources/fhir-config/personas/clinical-notes-harmonizer.yml`

**Source**: IMPL-GAP-3-Clinical-Notes-Harmonizer.md (documented in MASTER-Persona-Audit-Implementation-Gaps-Recommendations.md)

The Clinical Notes Harmonizer uses a **fixed-DAG pipeline** with 6 sequential steps. See the reference YAML above for the complete implementation details including:

- **Step 1 (bulk-query-patient-context)**: Fetches patient's existing conditions, medications, observations
- **Step 2 (document-parse-clinical-note)**: Extracts text from images (via vision model alias), PDFs, CDA XML, HL7v2, or plain text
- **Step 3 (llm-extract-clinical-entities)**: Uses LLM to extract clinical entities (diagnoses, medications, observations, etc.)
- **Step 4 (llm-fhir-mapping)**: Transforms extracted entities into FHIR R4/R5 resources
- **Step 5 (fhir-write-resources)**: Persists resources atomically to the FHIR repository
- **Step 6 (aggregate-import-summary)**: Calculates quality metrics and generates clinician-facing summary

### Configuration Files Reference

#### LLM Prompts

**Location**: `fhir4java-server/src/main/resources/fhir-config/prompts/clinical-notes-harmonizer/`

**Files**:

- `llm-analyze.prompt.txt` — Entity extraction prompt for Step 3 (llm-extract-clinical-entities)
- `llm-fhir-mapping.prompt.txt` — FHIR transformation prompt for Step 4 (llm-fhir-mapping)

These prompts are referenced in the persona YAML via `promptPath: "classpath:/fhir-config/prompts/..."` and loaded automatically at runtime. Both steps use the `modelAlias: "smart"` which resolves to the configured LLM provider's model.

#### Resource Normalization & Bindings

**Location**: `fhir4java-server/src/main/resources/fhir-config/bindings/`

**Purpose**: Corrects invalid LLM-generated FHIR resource values to match FHIR specification.

**Configuration Files** (per-resource):

- `Encounter.yml` — Status mappings and transformations (e.g., "finished" → "completed")
- `Condition.yml` — Code system and status corrections
- `Observation.yml` — Code and value type normalization
- `DiagnosticReport.yml` — Report status and result handling
- `MedicationRequest.yml` — Medication code and request status
- `Procedure.yml` — Procedure code normalization
- `CarePlan.yml` — Care plan activity mapping

**See**: `fhir4java-server/src/main/resources/fhir-config/bindings/README.md` for detailed documentation on:

- Binding structure (value mappings and FHIRPath transformations)
- Persona-specific overrides (how to customize bindings for specialized harmonizers)

Applied by: `LlmTransformStepExecutor` in Step 4 (llm-fhir-mapping) to correct invalid/LLM values before FHIR write.

### Domain-Scoped Configuration Example

For **cardiology** harmonizer, create a new persona:

```yaml
resourceType: DataPipelinePersona
id: clinical-note-harmonizer-cardiology
domainCode: cardiology

# Cardiology-specific prompts
steps:
  - stepId: llm-extract-clinical-entities
    type: llm-analyze
    config:
      promptPath: 'classpath:/fhir-config/prompts/clinical-notes-harmonizer/cardiology-analyze.prompt.txt'
```

Add corresponding prompt file:

```
fhir4java-server/src/main/resources/fhir-config/prompts/clinical-notes-harmonizer/cardiology-analyze.prompt.txt
```

Optionally add binding overrides for cardiology-specific mappings:

```
fhir4java-server/src/main/resources/fhir-config/personas/clinical-note-harmonizer-cardiology/bindings/Condition.yml
```

---

## EHR & Document Source Integration

### Integration Points

```
EHR System            Harmonizer         FHIR Server
─────────────         ──────────         ───────────
  │                      │                    │
  │ POST document ─────>  │                    │
  │   (REST API)          │                    │
  │                       │ Process 6 steps    │
  │                       │ (pipeline)         │
  │                       │                    │
  │                       │ Create FHIR <─────►
  │                       │ resources          │
  │                       │                    │
  │  <── Job Status ────  │                    │
  │      (webhook)        │                    │
```

### REST API Integration

#### Synchronous Upload

```bash
# Send document and wait for result
curl -X POST http://localhost:8080/api/personas/clinical-notes-harmonizer/import \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: ${TENANT_ID}" \
  -d '{
    "patientId": "MRN12345",
    "documentContent": "<PDF bytes or text>",
    "documentType": "pdf",
    "encounterId": "ENC-456",
    "metadata": {
      "source": "EHR_EPIC",
      "priority": "HIGH",
      "date": "2026-06-16",
      "clinicianId": "DR-789"
    }
  }'

# Synchronous response (after processing):
{
  "jobId": "job-abc123",
  "status": "COMPLETED",
  "patientId": "MRN12345",
  "results": {
    "extractedEntities": {
      "conditions": 3,
      "medications": 5,
      "observations": 8
    },
    "fhirBundle": { ... },
    "metrics": {
      "extractionConfidence": 0.91,
      "processingTimeMs": 4200,
      "tokensUsed": 1850
    },
    "summary": {
      "text": "Successfully harmonized cardiology note...",
      "riskFlags": [
        "Dosage of Metoprolol exceeds recommended max; verify with pharmacist"
      ]
    }
  }
}
```

#### Asynchronous Processing (for large documents)

```bash
# Step 1: Submit document (returns immediately)
curl -X POST http://localhost:8080/api/personas/clinical-notes-harmonizer/import-async \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: ${TENANT_ID}" \
  -d '{
    "patientId": "MRN12345",
    "documentUrl": "s3://documents/large-scan.pdf",
    "documentType": "pdf",
    "webhookUrl": "https://ehr.hospital.org/webhooks/harmonizer"
  }'

# Response (202 Accepted):
{
  "jobId": "job-async-456",
  "status": "QUEUED",
  "estimatedWaitTimeSeconds": 30
}

# Step 2: EHR receives webhook notification when complete
POST /webhooks/harmonizer
{
  "jobId": "job-async-456",
  "status": "COMPLETED",
  "patientId": "MRN12345",
  "results": { ... }
}
```

### Webhook Subscription

```bash
# Register to receive harmonization completion events
curl -X POST http://localhost:8080/api/webhooks/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "event": "harmonization.completed",
    "targetUrl": "https://ehr.hospital.org/webhooks/harmonizer",
    "secret": "webhook-secret-for-hmac",
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMs": 5000
    }
  }'
```

### FHIR Bundle Consumption

External systems can subscribe to FHIR Bundle creation events:

```bash
# Create subscription for new Condition resources from harmonizer
curl -X POST http://localhost:8080/fhir/r5/Subscription \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Subscription",
    "status": "active",
    "reason": "Monitor harmonizer-created Conditions",
    "criteria": "Condition?_profile=http://hl7.org/fhir/StructureDefinition/Condition&source=harmonizer",
    "channel": {
      "type": "rest-hook",
      "endpoint": "https://ehr.hospital.org/fhir/conditions/incoming",
      "header": ["Authorization: Bearer token"]
    }
  }'
```

### HL7v2 Message Integration

For legacy EHR systems sending HL7v2 messages:

```bash
# Convert HL7v2 message to FHIR and harmonize
curl -X POST http://localhost:8080/api/personas/clinical-notes-harmonizer/import-hl7v2 \
  -H "Content-Type: text/plain" \
  -H "X-Tenant-ID: ${TENANT_ID}" \
  -d 'MSH|^~\&|EPIC|HOSP|FHIR4JAVA|INBOUND|20260616||ADT^A08|||2.5
PID|||MRN12345||DOE^JOHN||19601015|M
OBX|1|NM|HBA1C^Hemoglobin A1c||8.5|%|<7.0||||F
OBX|2|TX|DIAGNOSIS^Diagnosis||Type 2 Diabetes Mellitus||||||F'
```

---

## API Reference

### Unified DataPipelinePersona Endpoint (GAP 21)

**RECOMMENDED**: Use the unified endpoint pattern below for all pipelines (harmonizer, cohort-explorer, vital-signs-monitor).

---

### POST /api/persona/DataPipelinePersona/{personaId}/$execute

**Description**: Invoke any DataPipelinePersona (synchronous or asynchronous)

**Request Headers**:

```
Content-Type: application/json
X-Tenant-ID: <tenant-uuid>
Authorization: Bearer <access-token>
```

**Request Body** (Clinical Notes Harmonizer example):

```json
{
  "inputs": {
    "patientId": "MRN12345",
    "documentContent": "string or base64-encoded bytes", // OR documentUrl
    "documentType": "text|pdf|cda|hl7v2",
    "encounterId": "ENC-456",
    "metadata": {
      "source": "EHR_EPIC|PORTAL_UPLOAD|EMAIL",
      "date": "2026-06-16",
      "priority": "HIGH|NORMAL|LOW",
      "clinicianId": "DR-789"
    }
  },
  "execution": {
    "mode": "sync", // sync or async
    "timeout": "300s",
    "maxTokens": 100000,
    "llmOverride": {
      // Optional: override YAML config
      "provider": "anthropic",
      "model": "claude-3-5-sonnet",
      "temperature": 0.1,
      "maxTokens": 50000
    }
  }
}
```

**Response (200 OK - Synchronous)**:

```json
{
  "jobId": "exec-abc123",
  "status": "COMPLETED",
  "duration": "4.2s",
  "steps": [
    {
      "name": "bulk-query",
      "status": "COMPLETED",
      "duration": "0.5s",
      "summary": "Loaded patient context: 2 existing conditions, 3 medications"
    },
    {
      "name": "document-parse",
      "status": "COMPLETED",
      "duration": "0.2s",
      "summary": "Extracted 2450 characters from PDF document"
    },
    {
      "name": "llm-analyze",
      "status": "COMPLETED",
      "duration": "2.1s",
      "tokensUsed": 850,
      "model": "claude-3-5-sonnet",
      "summary": "Extracted 15 clinical entities with avg confidence 0.91"
    },
    {
      "name": "llm-transform",
      "status": "COMPLETED",
      "duration": "1.0s",
      "tokensUsed": 600,
      "model": "gpt-4o",
      "summary": "Generated 8 FHIR resources (3 Conditions, 5 MedicationRequests)"
    },
    {
      "name": "fhir-write",
      "status": "COMPLETED",
      "duration": "0.3s",
      "summary": "Persisted 8 resources atomically; generated IDs: Condition/123, ..."
    },
    {
      "name": "aggregate",
      "status": "COMPLETED",
      "duration": "0.1s",
      "summary": "Calculated metrics; identified 2 risk flags requiring review"
    }
  ],
  "outputs": {
    "resourceCount": 8,
    "entityCount": 15,
    "fhirBundle": {
      "resourceType": "Bundle",
      "type": "transaction",
      "entry": [
        {
          "resource": {
            /* Condition FHIR R5 resource */
          },
          "request": { "method": "POST", "url": "Condition" }
        },
        {
          "resource": {
            /* MedicationRequest FHIR R5 resource */
          },
          "request": { "method": "POST", "url": "MedicationRequest" }
        }
      ]
    },
    "metrics": {
      "extraction_confidence": 0.91,
      "tokens_used": 1450,
      "entity_count": 15,
      "duration_ms": 4200,
      "processing_time_per_entity_ms": 280
    },
    "costBreakdown": {
      "anthropic": {
        "model": "claude-3-5-sonnet",
        "tokens": 850,
        "cost_usd": 0.032
      },
      "openai": { "model": "gpt-4o", "tokens": 600, "cost_usd": 0.0156 },
      "totalCost": 0.0476
    }
  },
  "riskFlags": [
    {
      "type": "DOSAGE_EXCEED",
      "severity": "ERROR",
      "message": "Metoprolol dosage 500mg daily exceeds recommended max of 190mg daily",
      "remediation": "Verify with pharmacist; may need dosage adjustment",
      "entityReference": "MedicationRequest/456"
    },
    {
      "type": "LOW_CONFIDENCE",
      "severity": "WARNING",
      "message": "Medication extraction confidence 0.62 < 0.7 threshold",
      "remediation": "Clinician should verify medication name and dosage",
      "entityReference": "entity-5"
    }
  ]
}
```

### POST /api/persona/DataPipelinePersona/{personaId}/$execute (Asynchronous)

**Request** (with `execution.mode: async`):

```json
{
  "inputs": { ... },
  "execution": {
    "mode": "async",
    "timeout": "600s"
  }
}
```

**Response (202 Accepted)** (`Location` / `Content-Location` headers = `statusUrl`):

```json
{
  "status": "queued",
  "jobId": "exec-async-456",
  "personaId": "clinical-docs-harmonizer",
  "statusUrl": "/api/persona/DataPipelinePersona/clinical-docs-harmonizer/$status?job=exec-async-456",
  "reviewRequired": true
}
```

- `reviewRequired` is the effective review setting for this job: the persona's `review.enabled`, unless the `"reviewRequired": true|false` input overrides it.
- A missing permission returns `403` before any job is created. The body has `missing[]`, e.g. `{"resourceType": "Condition", "operation": "create"}`.

---

### GET /api/persona/DataPipelinePersona/{personaId}/$status?job={executionId}

**Description**: Poll execution status (sync-like behavior for async jobs)

**Response (while RUNNING)**:

```json
{
  "jobId": "exec-async-456",
  "status": "RUNNING",
  "currentStep": "llm-analyze",
  "progress": {
    "completedSteps": 2,
    "totalSteps": 6,
    "percentComplete": 33
  }
}
```

**Response (while AWAITING_REVIEW)** — review-enabled personas; nothing has been written yet:

```json
{
  "jobId": "exec-async-456",
  "status": "awaiting_review",
  "personaId": "clinical-docs-harmonizer",
  "currentStep": "review-gate",
  "currentStepStatus": "AWAITING_REVIEW",
  "message": "Generated records are awaiting clinical review before they are saved",
  "reviewUrl": "/api/persona/DataPipelinePersona/clinical-docs-harmonizer/$review?job=exec-async-456",
  "interventionId": "int-7f3c…"
}
```

Other terminal statuses: `rejected` (discarded by the reviewer) and `failed`. Every finished job's response includes `missionOutput`.

**Response (after COMPLETED)**:

```json
{
  "jobId": "exec-async-456",
  "status": "COMPLETED",
  "duration": "4.2s",
  "steps": [ ... ],
  "outputs": { ... },
  "riskFlags": [ ... ]
}
```

---

### Review before save, mission output and audit operations

These are operations on the same unified path. The job is selected with `?job={jobId}`, and the headers are `X-Tenant-ID` plus `Authorization: Bearer <access-token>`. API keys are refused, and a job belonging to another persona or tenant returns `404`. Design: `docs/superpowers/specs/2026-09-26-docs-harmonizer-review-dedup-terminology-design.md`.

| Method | Operation                                                       | Body                                                                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `$can-execute`                                                  | —                                                                                                                   | `{allowed, roles, missing[]}`: whether the signed-in user's RBAC role scopes allow running this persona (create on every written type, read on looked-up types). `$execute` returns `403` with the same `missing[]` when not                                                                                                                                                    |
| `GET`  | `$review?job=`                                                  | —                                                                                                                   | Records staged for review (FHIR JSON + `recordId`, `resourceType`, `resourceId`, `status`, `outcome`, `confidence`, `evidence`, `dedup`, `ignoreReason`, `terminology`) and an `ETag` header. Counts: `generated`, `included`, `excluded`, `ignored`, `flaggedDuplicates`                                                                                                       |
| `PUT`  | `$review-record?job=&record=`                                   | FHIR resource                                                                                                       | Edit a staged record (`resourceType`, `id`, subject immutable)                                                                                                                                                                                                                                                                                                                  |
| `POST` | `$review-record?job=`                                           | FHIR resource                                                                                                       | Add a record the pipeline missed                                                                                                                                                                                                                                                                                                                                                |
| `POST` | `$exclude-record?job=&record=` / `$include-record?job=&record=` | —                                                                                                                   | Leave a record out / put it back (valid but not wanted) — requires create on type                                                                                                                                                                                                                                                                                               |
| `POST` | `$ignore-record?job=&record=`                                   | `{"reason": "..."}` (optional)                                                                                      | Mark record as an LLM error / irrelevant; `$include-record` reverses — requires only read on type                                                                                                                                                                                                                                                                               |
| `POST` | `$resolve-duplicate?job=&record=`                               | `{"action": "CREATE_NEW" \| "SKIP" \| "UPDATE_EXISTING"}`                                                           | Decide a flagged duplicate                                                                                                                                                                                                                                                                                                                                                      |
| `POST` | `$approve?job=`                                                 | `{"notes": "..."}`                                                                                                  | `202`; the job resumes and writes the included records under the ids shown during review                                                                                                                                                                                                                                                                                        |
| `POST` | `$reject?job=`                                                  | `{"mode": "REVISE" \| "DISCARD", "instructions": "...", "recordComments": [{"recordId": "...", "comment": "..."}]}` | `202`; REVISE re-runs generation with the reviewer's feedback, DISCARD ends the job without writing                                                                                                                                                                                                                                                                             |
| `GET`  | `$mission-output?job=`                                          | —                                                                                                                   | Every generated and created record with `resourceType` + `resourceId`, counts, review decision, risk flags, `sourceDocument`, `steps[]` timeline, `submittedAt` / `completedAt`, `interventionId` while pending. Finished jobs return the snapshot stored when they ended                                                                                                       |
| `GET`  | `$missions` (no `job`)                                          | —                                                                                                                   | The caller's missions of this persona, newest first. Filters: `status` (comma-separated, e.g. `awaiting_review`), `submittedBy=me\|any` (`any` needs read on the persona's output types), `patient`, `from`, `to`, `_count` (≤100), `_offset`. Response `{total, offset, count, missions[]}`; each row has `missionId`, `status`, `review`, `interventionId`, `counts`, `links` |
| `GET`  | `$source-document?job=`                                         | —                                                                                                                   | The originally uploaded document (audit)                                                                                                                                                                                                                                                                                                                                        |

`GET /api/persona/DataPipelinePersona/$missions?persona=` lists across pipeline personas, e.g. for a "waiting for my review" inbox. `persona` is optional with `submittedBy=me` and required with `any`.

---

#### Exclude vs Ignore — when to use which

Both `$exclude-record` and `$ignore-record` prevent a record from being written. `$include-record` reverses either. The distinction is **intent and permission level**.

|                         | `$exclude-record`                                                  | `$ignore-record`                                                                          |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **What it means**       | "This record is valid — I just don't want it saved in this import" | "The LLM should not have generated this at all — it is wrong, hallucinated, or unrelated" |
| **Outcome**             | `EXCLUDED_BY_REVIEWER`                                             | `IGNORED_BY_REVIEWER`                                                                     |
| **Permission required** | create on the resource type                                        | read on the resource type (lighter gate)                                                  |
| **Optional body**       | none                                                               | `{"reason": "..."}`                                                                       |
| **Count bucket**        | `counts.excluded`                                                  | `counts.ignored`                                                                          |
| **Signal**              | "Skip for now" — no quality signal                                 | Flags an LLM error — feeds accuracy monitoring                                            |

**Concrete examples:**

- **Exclude:** The harmonizer generated a valid Condition for diabetes, but the clinician says "we already have this documented in the other system — skip it for this import." The record is clinically correct; the reviewer just does not want a duplicate write right now.

- **Ignore:** The harmonizer generated a Procedure for "appendectomy" from a note that only mentioned the _patient's family history_ of appendectomy. The LLM misread the context. The record should never have been created. The reviewer flags it with `$ignore-record` and adds `{"reason": "family history, not the patient's own procedure"}`.

The practical implication is that `counts.ignored` feeds into LLM quality monitoring over time. If a persona accumulates a high `ignored` rate, it signals the prompt or pipeline needs tuning. `counts.excluded` does not carry that signal — it is a normal reviewer workflow action.

**HITL through `AgentInterventionRequest`.** Each pause for review also opens an `AgentInterventionRequest` with `type: "pipeline-review"`, `options: ["approve","request-changes","reject"]`, and `context.reviewUrl` / `missionOutputUrl`. It uses the same convention as AgentPersona HITL in `docs/AI-Persona-Design-User-Guide.md`:

1. `GET /api/agent/AgentInterventionRequest?missionId={jobId}&status=PENDING` finds it. The `create AgentInterventionRequest` SSE event also fires.
2. Records are edited with the `$review…` operations above.
3. `PATCH /api/agent/AgentInterventionRequest/{id}` (optional `If-Match`) decides:

   | Body                                                              | Same as                           |
   | ----------------------------------------------------------------- | --------------------------------- |
   | `{"decision":"approve","notes":"…"}`                              | `$approve`                        |
   | `{"decision":"request-changes","notes":"…","recordComments":[…]}` | `$reject` REVISE (notes required) |
   | `{"decision":"reject","notes":"…"}`                               | `$reject` DISCARD                 |

Either path marks the intervention `ANSWERED`. Each revise round opens a new intervention with a new id, so always re-fetch `?status=PENDING`. Answering a non-pending intervention returns `409`.

**Record statuses:** `PROPOSED` → `EDITED` (reviewer changed content) → `EXCLUDED` (excluded) → `IGNORED` (LLM error) → `WRITTEN` (approved and saved) → `FAILED` (write error) → `SUPERSEDED` (replaced by a newer revision).

**Record outcomes** (in `$mission-output` and each draft): `PENDING_REVIEW`, `CREATED`, `UPDATED_EXISTING`, `SKIPPED_DUPLICATE`, `EXCLUDED_BY_REVIEWER`, `IGNORED_BY_REVIEWER`, `DISCARDED`, `FAILED`.

Mutations accept `If-Match: <ETag>`; a stale ETag returns `412`. While paused, `$status` returns `"status": "awaiting_review"` with `reviewUrl` and `interventionId`. Once the job has finished (completed, failed or rejected), `$status` includes `missionOutput`.

Review is enabled per persona with `review.enabled: true` (the docs harmonizer default). A single job can override it with the `$execute` input `"reviewRequired": true | false`. The async response echoes the effective `reviewRequired`. Written resources carry the `http://fhir4java.org/StructureDefinition/ai-generation-provenance` extension (generatedAt, missionId, reviewedAt/By, approvedAt/By, …) and the `ai-generated` meta tag.

#### What happens when a reviewer submits "Request Changes"

"Request changes" corresponds to `$reject` with `mode: REVISE` (or the intervention body `{"decision":"request-changes","notes":"...","recordComments":[...]}`). It does **not** write anything to the FHIR store. Instead it triggers a re-generation loop:

1. **Current drafts marked `SUPERSEDED`.** All staged records for the current revision are closed out. The revision counter on the job increments (`revision + 1`).

2. **Pipeline re-runs from Step 3 (`llm-extract-clinical-entities`).** Steps 1–2 (bulk-query, document-parse) are skipped because their outputs are already persisted. The executor resumes via `executeFrom(…, "llm-extract-clinical-entities")`.

3. **Reviewer feedback injected into the LLM prompt.** The `notes` and `recordComments` supplied by the reviewer are added to the pipeline context and surfaced to the LLM in a new prompt section:

   ```
   Reviewer feedback on the previous attempt (revision {{ revision }}):
   {{ reviewerInstructions }}

   Per-record comments:
   {{ recordComments | tojson }}

   Records the reviewer already edited (keep as-is):
   {{ lockedRecords | tojson }}
   ```

4. **Hand-edited records are locked.** Any record the reviewer edited manually before submitting request-changes is carried into the new revision unchanged. The LLM is told not to regenerate those records.

5. **Pipeline pauses again at `review-gate`.** A new set of drafts is staged with a fresh `revision` number. A new `AgentInterventionRequest` is created (always re-fetch `?status=PENDING` to get the new id). The job status returns to `awaiting_review`.

6. **`review.maxRevisions` caps the loop** (default 3). If the revision limit is reached, the job moves to `failed` instead of pausing again.

The reviewer can inspect the new drafts — including the updated dedup annotations and confidence scores — and decide again: approve, request further changes, or reject.

---

### Deprecated Endpoints (Legacy - Still Functional)

```
POST /api/personas/clinical-notes-harmonizer/import          → forwards to /api/persona/DataPipelinePersona/clinical-note-harmonizer/$execute
POST /api/personas/clinical-notes-harmonizer/import-async    → forwards to /api/persona/DataPipelinePersona/clinical-note-harmonizer/$execute (mode: async)
GET /api/personas/clinical-notes-harmonizer/jobs/{jobId}     → forwards to /api/persona/DataPipelinePersona/clinical-note-harmonizer/$status?job={jobId}
```

Use the unified endpoints above for all new development.

---

## Step 2 Configuration: Document Parsing with OCR

### Overview

**Step 2 (document-parse-clinical-note)** of the Clinical Notes Harmonizer pipeline extracts text from documents using OCR and structured parsing. Configuration is entirely in the persona YAML file.

**Supported document types:**

- **Images**: JPEG, PNG, TIFF (via qwen2.5vl vision model + Tesseract fallback OCR)
- **PDFs**: Text extraction via Apache PDFBox
- **CDA XML**: Clinical document architecture (extracts narrative + structured entries)
- **HL7v2**: Clinical messages (extracts diagnostic, medication, observation segments)
- **Text**: Plain text (pass-through)

### YAML Configuration

Located in: `fhir4java-server/src/main/resources/fhir-config/personas/clinical-notes-harmonizer.yml`

```yaml
steps:
  - stepId: document-parse-clinical-note
    type: document-parse
    description: 'Parse document; extract text content using OCR or text extraction'
    config:
      documentType: '{{ input.documentType }}'
      maxCharacters: 100000

      # Image OCR (JPEG/PNG/TIFF)
      ocr:
        enabled: true
        primaryProvider: qwen2.5vl # Primary: vision model
        fallbackProvider: tesseract # Fallback: Tesseract OCR
        timeout: 120 # Seconds

        # Vision model (qwen2.5vl via Ollama)
        qwen2.5vl:
          enabled: true
          endpoint: "{{ env.QWEN_ENDPOINT | default('http://ollama:11434/api/generate') }}"
          model: 'qwen2.5vl:latest'
          prompt: 'Extract all text from this medical document. Return only the extracted text, no additional commentary.'
          timeout: 120

        # Tesseract OCR fallback
        tesseract:
          enabled: true
          binaryPath: "{{ env.TESSERACT_BIN | default('/usr/bin/tesseract') }}"
          language: "{{ env.TESSERACT_LANG | default('eng') }}" # 'eng+medical' if available
          timeout: 60

      # PDF Configuration
      pdf:
        enabled: true
        library: apache-pdfbox
        maxPages: 1000
        timeout: 30

      # CDA XML Configuration
      cda:
        enabled: true
        extractNarrative: true
        extractStructuredData: true

      # HL7v2 Configuration
      hl7v2:
        enabled: true
        extractSegments: [OBX, DG1, RXE, PV1, ORC] # OBX=observations, DG1=diagnoses, RXE=meds
        timeout: 10

      # Failure handling
      errorHandling:
        onOcrFallure: continue # continue = return raw; fail = abort step
        onPdfFailure: fail
        onStructuredParseFailure: continue

    outputVar: parseResult
    retryPolicy:
      maxRetries: 2
      backoffMs: 1000
      retryableErrors:
        - VisionModelException
        - DocumentParsingException
```

### Environment Variables

| Variable         | Default                            | Purpose                         | Required                                |
| ---------------- | ---------------------------------- | ------------------------------- | --------------------------------------- |
| `QWEN_ENDPOINT`  | `http://ollama:11434/api/generate` | qwen2.5vl vision model endpoint | No (falls back to Tesseract)            |
| `TESSERACT_BIN`  | `/usr/bin/tesseract`               | Tesseract OCR binary path       | No (skipped if not found)               |
| `TESSERACT_LANG` | `eng`                              | Tesseract language code         | No (use `eng+medical` for medical pack) |

### Deployment Scenarios

#### Local Development (Both Providers)

```bash
# Start Ollama with qwen2.5vl
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5vl:latest

# Install Tesseract
sudo apt-get install tesseract-ocr  # Ubuntu/Debian
brew install tesseract               # macOS
```

**Behavior**: Tries qwen2.5vl first, automatically falls back to Tesseract on timeout/failure

#### Production (Vision-Only)

```bash
# Ollama on secure network; no Tesseract installed
export QWEN_ENDPOINT=https://internal-ollama.acme.com:11434/api/generate
```

**YAML override**:

```yaml
ocr:
  fallbackProvider: null # No fallback
errorHandling:
  onOcrFallure: fail # Strict: fail if qwen2.5vl unavailable
```

**Behavior**: qwen2.5vl only; strict failure handling

#### Tesseract-Only (No Ollama)

```bash
# Install with medical language pack
sudo apt-get install tesseract-ocr tesseract-ocr-medical
export TESSERACT_LANG=eng+medical
```

**YAML override**:

```yaml
ocr:
  primaryProvider: tesseract
qwen2.5vl:
  enabled: false
```

**Behavior**: Faster, lighter, no network dependency; lower accuracy on handwritten

#### Fast Testing (Skip OCR)

```yaml
ocr:
  enabled: false
pdf:
  enabled: false
cda:
  enabled: false
hl7v2:
  enabled: false
errorHandling:
  onOcrFallure: continue # Return raw content unchanged
```

**Behavior**: All parsers disabled; useful for testing pipeline plumbing

### Step Output Format

Regardless of parsing method, Step 2 outputs:

```json
{
  "parseResult": {
    "rawText": "Extracted text content here...",
    "documentType": "image|pdf|cda|hl7v2|text",
    "characterCount": 2451,
    "parseTimestamp": 1719086400000,
    "parserUsed": "ImageDocumentParser|PdfDocumentParser|..."
  }
}
```

This flows into **Step 3 (llm-extract-clinical-entities)** as `{{ parseResult.rawText }}`.

### Troubleshooting

| Issue                           | Cause                                   | Solution                                                                                  |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Vision model timeout (120s+)    | qwen2.5vl on CPU is slow                | Use GPU if available; switch to Tesseract; increase timeout to 180s                       |
| Tesseract not found             | Binary not at configured path           | Verify: `which tesseract`; update `TESSERACT_BIN` env var                                 |
| Low OCR accuracy on handwriting | Vision/Tesseract struggles with cursive | Use qwen2.5vl if available; pre-process images (rotate, denoise); document as best-effort |
| CDA/HL7v2 returns empty         | Missing XML elements or segments        | Check document structure; adjust `extractSegments`; review logs                           |
| PDF text extraction empty       | Scanned PDF (image-only)                | No solution; recommend re-scanning or manual review                                       |

### Monitoring & Metrics

Track in Step 2 output:

- **`characterCount`** — How much text was extracted
- **`parserUsed`** — Which parser succeeded (validates fallback strategy)
- **Retry count** — How many times the step retried
- **Duration** — Compare to timeout threshold (120s for qwen2.5vl, 60s for Tesseract)

View logs:

```bash
# Check vision model usage
docker logs fhir-server | grep -i "qwen\|vision"

# Check Tesseract fallback
docker logs fhir-server | grep -i "tesseract"

# Check parsing errors
docker logs fhir-server | grep -i "DocumentParsing"
```

---

## Execution Status & Database Queries

### Overview

Behind the REST API, the Clinical Notes Harmonizer uses the generic **Pipeline Infrastructure** tables (GAP 19 implementation) to store execution state. These tables enable:

- **Deep visibility** into execution progress (what step failed and why)
- **Cost tracking** across multiple LLM providers
- **Risk detection** (low confidence, dosage issues, data conflicts)
- **Multi-tenant isolation** (tenant_id field on all tables)
- **Audit trails** (when steps failed, retry counts, error contexts)

### Querying Execution Status by executionId

When you invoke `/api/persona/DataPipelinePersona/clinical-note-harmonizer/$execute`, the response includes a `jobId`. Use this to query the execution state directly:

```sql
-- Find the main execution record
SELECT id, persona_id, tenant_id, status, context, created_at, started_at, completed_at
FROM workflow.pipeline_job
WHERE id = 'exec-abc123'
  AND tenant_id = 'tenant-123';

-- Get step-by-step progress
SELECT
    step_name,
    step_index,
    status,
    error_detail,
    processed_items,
    failed_items,
    duration_ms,
    created_at,
    completed_at
FROM workflow.pipeline_job_step
WHERE job_id = 'exec-abc123'
  AND tenant_id = 'tenant-123'
ORDER BY step_index ASC;

-- Get raw document content and extracted entities (HASH-partitioned table)
SELECT
    step_name,
    data->'document'->>'content' AS raw_document,
    data->'document'->>'type' AS document_type,
    data->'entities' AS extracted_entities,
    confidence,
    created_at
FROM workflow.pipeline_job_step_data
WHERE job_id = 'exec-abc123'
  AND tenant_id = 'tenant-123'
ORDER BY created_at ASC;
```

### Finding Failed Executions

```sql
-- List all failed executions for a tenant (last 7 days)
SELECT
    j.id AS execution_id,
    j.persona_id,
    j.context->>'patientId' AS patient_id,
    j.status,
    j.created_at,
    j.started_at,
    j.completed_at,
    -- Find the failed step
    (SELECT step_name FROM workflow.pipeline_job_step
     WHERE job_id = j.id AND status = 'FAILED' LIMIT 1) AS failed_step
FROM workflow.pipeline_job j
WHERE j.tenant_id = 'tenant-123'
  AND j.status = 'FAILED'
  AND j.created_at > NOW() - INTERVAL '7 days'
ORDER BY j.created_at DESC;

-- Get failure details for a specific execution
SELECT
    step_name,
    error_detail,
    context_data->>'error_message' AS error_msg,
    context_data->>'root_cause' AS root_cause,
    retry_count,
    created_at
FROM workflow.pipeline_job_step_failure
WHERE job_id = 'exec-abc123'
  AND tenant_id = 'tenant-123'
ORDER BY created_at DESC;
```

### Identifying Low-Confidence Extractions

```sql
-- Find all executions with low-confidence entities (< 0.7)
SELECT
    j.id AS execution_id,
    j.context->>'patientId' AS patient_id,
    s.step_name,
    COUNT(*) AS low_confidence_count,
    AVG((s.data->'entities'->0->>'confidence')::numeric) AS avg_confidence
FROM workflow.pipeline_job j
JOIN workflow.pipeline_job_step_data s ON s.job_id = j.id
WHERE j.tenant_id = 'tenant-123'
  AND j.created_at > NOW() - INTERVAL '24 hours'
  AND (s.data->'entities'->0->>'confidence')::numeric < 0.7
GROUP BY j.id, j.context->>'patientId', s.step_name
ORDER BY avg_confidence ASC;
```

### Tracking LLM Costs

```sql
-- Cost breakdown by LLM provider for last 30 days
SELECT
    provider,
    model,
    SUM(tokens_used) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS execution_count,
    ROUND(SUM(cost_usd) / COUNT(*), 4) AS avg_cost_per_execution
FROM workflow.pipeline_cost_tracking
WHERE tenant_id = 'tenant-123'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY provider, model
ORDER BY total_cost_usd DESC;

-- Cost per step (identify expensive steps)
SELECT
    step_name,
    provider,
    COUNT(*) AS execution_count,
    SUM(tokens_used) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd
FROM workflow.pipeline_cost_tracking
WHERE tenant_id = 'tenant-123'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY step_name, provider
ORDER BY total_cost_usd DESC;
```

### Monitoring Risk Flags

```sql
-- List all risk flags flagged in last 24 hours
SELECT
    j.id AS execution_id,
    j.context->>'patientId' AS patient_id,
    prf.risk_type,
    prf.severity,
    prf.message,
    prf.remediation,
    prf.created_at
FROM workflow.pipeline_risk_flags prf
JOIN workflow.pipeline_job j ON j.id = prf.job_id
WHERE j.tenant_id = 'tenant-123'
  AND prf.created_at > NOW() - INTERVAL '24 hours'
ORDER BY prf.severity DESC, prf.created_at DESC;

-- Summary of risk flags by type
SELECT
    risk_type,
    severity,
    COUNT(*) AS occurrence_count,
    COUNT(DISTINCT job_id) AS unique_executions
FROM workflow.pipeline_risk_flags
WHERE tenant_id = 'tenant-123'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY risk_type, severity
ORDER BY occurrence_count DESC;
```

### Performance Analysis

```sql
-- Step execution times (identify bottlenecks)
SELECT
    step_name,
    COUNT(*) AS execution_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))))::integer AS avg_duration_sec,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))))::integer AS p95_duration_sec,
    MAX(EXTRACT(EPOCH FROM (completed_at - created_at)))::integer AS max_duration_sec
FROM workflow.pipeline_job_step
WHERE job_id IN (
    SELECT id FROM workflow.pipeline_job
    WHERE tenant_id = 'tenant-123' AND status = 'COMPLETED'
)
GROUP BY step_name
ORDER BY avg_duration_sec DESC;

-- End-to-end execution duration
SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))))::integer AS avg_total_duration_sec,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))))::integer AS p95_total_duration_sec,
    MIN(created_at) AS oldest_execution,
    MAX(completed_at) AS most_recent_execution
FROM workflow.pipeline_job
WHERE tenant_id = 'tenant-123'
  AND status = 'COMPLETED'
  AND created_at > NOW() - INTERVAL '7 days';
```

### Dashboard Query (Overall Health)

```sql
-- Single query for pipeline health dashboard
SELECT
    DATE_TRUNC('hour', j.created_at) AS hour,
    COUNT(*) AS total_executions,
    COUNT(CASE WHEN j.status = 'COMPLETED' THEN 1 END) AS successful,
    COUNT(CASE WHEN j.status = 'FAILED' THEN 1 END) AS failed,
    ROUND(100.0 * COUNT(CASE WHEN j.status = 'COMPLETED' THEN 1 END) / COUNT(*), 1) AS success_rate,
    COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM workflow.pipeline_risk_flags prf
        WHERE prf.job_id = j.id AND prf.severity = 'ERROR'
    ) THEN j.id END) AS with_errors,
    ROUND(AVG(EXTRACT(EPOCH FROM (j.completed_at - j.created_at))))::integer AS avg_duration_sec,
    SUM(CASE WHEN m.metrics_type = 'EXTRACTION_CONFIDENCE'
        THEN (m.metric_value::numeric) END) / NULLIF(
        COUNT(CASE WHEN m.metrics_type = 'EXTRACTION_CONFIDENCE' THEN 1 END), 0
    ) AS avg_extraction_confidence
FROM workflow.pipeline_job j
LEFT JOIN workflow.pipeline_metrics m ON m.job_id = j.id
WHERE j.tenant_id = 'tenant-123'
  AND j.created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', j.created_at)
ORDER BY hour DESC;
```

---

## Security & Privacy

### PII Handling in Clinical Documents

**Challenge**: Clinical notes contain Protected Health Information (PHI) that must be securely stored and processed

**Solutions**:

#### 1. Document Encryption

```yaml
fhir4java:
  storage:
    encryption:
      enabled: true
      algorithm: AES-256-GCM
      keyManagement: aws-kms # or vault, local-key
      aws-kms:
        key-id: arn:aws:kms:us-east-1:123456789:key/...
```

#### 2. PII Redaction During Processing

```python
# LLM prompt includes redaction instruction
EXTRACTION_PROMPT = """
Extract clinical entities from the following note.

IMPORTANT: Do not extract or return:
- Patient names
- Medical record numbers
- Social security numbers
- Dates of birth
- Phone numbers
- Addresses

Focus only on clinical findings (diagnoses, medications, observations).
"""
```

#### 3. Document Retention Policy

```yaml
fhir4java:
  storage:
    documentBucket: clinical-documents
    retentionPolicy:
      retentionDays: 2555 # 7 years for HIPAA
      deleteAfterExtraction: false # Keep for audit
      archiveAfterDays: 365
      archiveLocation: s3-glacier
```

### Authentication & Authorization

**Required**: OAuth 2.0 or FHIR-specific token validation

**Pre-flight permission check (implemented).**

- Before a harmonizer job is created, `$execute` checks the signed-in user's **RBAC role scopes** (`rbac_user_role` → `rbac_role_scope`, see `docs/SMARTONFHIR-SETUP-AND-INTEGRATION-GUIDE.md`):
  - create on **every** resource type the pipeline writes;
  - read on every type it looks up.
- Any gap refuses the whole mission with `403` and `missing[]`. No job row, LLM call or thread is created.
- API-key and service credentials are refused, because a signed-in user is required.
- `GET …/$can-execute` gives the frontend the same answer up front.
- **Reviewer decisions** are checked too:
  - approving needs create (or update) on every included record type;
  - request-changes re-checks that the mission initiator may still run the persona.

Illustrative only (the generic pattern):

```java
// Validate incoming document submission
if (!userHasPermission("SUBMIT_DOCUMENTS", patientId)) {
    return Response.status(403).build();
}

// Audit who submitted the document
auditLog.record("document_submitted", {
    "documentId": documentId,
    "patientId": patientId,
    "submittedBy": userId,
    "timestamp": now(),
    "ipAddress": request.getRemoteAddr()
});
```

### Audit Logging

**Mission-level audit (docs harmonizer):**

- **Who and when on each record:** every written resource carries the `http://fhir4java.org/StructureDefinition/ai-generation-provenance` extension (`generatedAt`, `missionId`, `personaId`/`personaVersion`, `revision`, `confidence`, `humanEdited`, `reviewedAt`/`By`, `approvedAt`/`By`) and `meta.tag` `ai-generated`.
- **The source document:** the uploaded document is kept on its job (`workflow.pipeline_job.document_*`) and downloadable with `$source-document?job=`. It is governed by `fhir4java.pipeline.source-document.store` / `max-bytes`.
- **The review trail:** reviewer, approver, decision notes and the instruction history of every request-changes round are kept in `workflow.pipeline_review_session`, and every staged record version in `workflow.pipeline_review_draft`.
- **The mission output** (records generated / created, counts, decision) is snapshotted on the job when it finishes (`pipeline_job.mission_output`).

All harmonization activities logged:

```sql
-- Query audit trail for document
SELECT * FROM audit_event
WHERE event_type = 'HARMONIZATION'
  AND details->>'document_id' = 'doc-xyz'
ORDER BY recorded DESC;

-- Check who accessed patient's harmonized data
SELECT * FROM audit_event
WHERE event_type = 'DATA_ACCESS'
  AND details->>'patient_id' = 'MRN12345'
  AND recorded > NOW() - INTERVAL '30 days'
ORDER BY recorded DESC;
```

### Compliance Standards

- **HIPAA**: Document retention (7 years), access audit logs, encryption at rest/in-transit
- **GDPR**: Right to access, right to deletion (soft-delete with 30-day grace period)
- **HITECH**: Breach notification (within 60 days)

---

## Monitoring & Troubleshooting

### Health Checks

```bash
# Check harmonizer service health
curl http://localhost:8080/actuator/health/harmonizer

# Check document parsing capability
curl http://localhost:8080/api/personas/clinical-notes-harmonizer/health/document-parser

# Check LLM provider connectivity
curl http://localhost:8080/actuator/health/llm
```

### Key Metrics

```yaml
# Prometheus metrics at /actuator/prometheus
harmonizer_job_duration_seconds:
  description: "Time to complete harmonization"
  targets:
    - p50: < 5 seconds
    - p95: < 10 seconds
    - p99: < 30 seconds

harmonizer_extraction_confidence:
  description: "Quality of entity extraction"
  targets:
    - mean: > 0.85
    - < 0.7: < 5% of jobs (investigate)

harmonizer_risk_flags_detected:
  description: "Count of data anomalies flagged"
  targets:
    - daily_average: < 10% of jobs
    - HIGH severity: reviewed within 24h

harmonizer_llm_errors:
  description: "LLM provider failures"
  targets:
    - rate: < 1% of calls
    - response_time: < 30 seconds p95

harmonizer_fhir_write_errors:
  description: "FHIR resource persistence failures"
  targets:
    - rate: < 0.1% (atomic; should rarely fail)
    - validation_errors: reviewed daily
```

### Troubleshooting Guide

### Overview: Query the Generic Pipeline Tables

All Harmonizer executions are tracked in the `workflow` schema. Use these queries to investigate issues.

---

### **Issue 1: Pipeline Execution Failed**

**Symptom**: Harmonizer job status is FAILED; need to find root cause

**Investigation - Find the execution**:

```sql
-- Find failed executions for a patient
SELECT
    pj.id as job_id,
    pj.pipeline_id,
    pj.status,
    pj.context->>'patientId' as patientId,
    pj.created_at,
    pj.completed_at,
    (EXTRACT(EPOCH FROM (pj.completed_at - pj.created_at)))::int as duration_sec
FROM workflow.pipeline_job pj
WHERE pj.context->>'patientId' = 'P123'
  AND pj.pipeline_id = 'clinical-note-harmonizer'
  AND pj.status = 'FAILED'
ORDER BY pj.created_at DESC
LIMIT 10;
```

**Find which step failed**:

```sql
SELECT
    pjs.step_id,
    pjs.step_sequence,
    pjs.status,
    pjs.error_detail,
    pjs.started_at,
    pjs.completed_at
FROM workflow.pipeline_job_step pjs
WHERE pjs.job_id = 'exec-abc123'  -- From above query
ORDER BY pjs.step_sequence;
```

**Get detailed error context**:

```sql
SELECT
    pjsf.step_id,
    pjsf.item_id,
    pjsf.retry_count,
    pjsf.error_detail,
    pjsf.context_data,
    pjsf.failed_at
FROM workflow.pipeline_job_step_failure pjsf
WHERE pjsf.job_id = 'exec-abc123'
ORDER BY pjsf.failed_at DESC;
```

---

### **Issue 2: Document Parsing Failed**

**Symptom**: "Document parse failed" at step 2

**Investigation - Check what was stored**:

```sql
-- Get the raw document content that failed
SELECT
    pjsd.item_id,
    pjsd.status,
    pjsd.data,  -- ← Raw document content
    pjsd.created_at
FROM workflow.pipeline_job_step_data pjsd
WHERE pjsd.job_id = 'exec-abc123'
  AND pjsd.step_id = 'document-parse'
ORDER BY pjsd.created_at;
```

**Check document type**:

```sql
SELECT
    pj.context->>'documentType' as documentType,
    pj.context->>'documentUrl' as documentUrl,
    CASE
        WHEN pj.context->>'documentContent' IS NOT NULL THEN 'inline-content'
        WHEN pj.context->>'documentUrl' IS NOT NULL THEN 'external-url'
        ELSE 'unknown'
    END as storage_type
FROM workflow.pipeline_job pj
WHERE pj.id = 'exec-abc123';
```

**Solutions**:

- If document is base64: Check encoding is valid `echo "base64-string" | base64 -d | file -`
- If document is URL: Verify S3 URL is accessible `curl -I "s3://bucket/file.pdf"`
- Check logs for parse errors: `grep "document-parse" /var/log/fhir4java/harmonizer.log`
- Try simpler document format (plain text vs PDF)

---

### **Issue 3: Low Extraction Confidence**

**Symptom**: Extracted entities have confidence < 0.7; entities being skipped

**Investigation - Find low-confidence extractions**:

```sql
-- Show all low-confidence extractions
SELECT
    pjsd.item_id,
    pjsd.data->>'entity_type' as entity_type,
    pjsd.data->>'display_text' as display_text,
    pjsd.confidence,
    pjsd.created_at,
    pjsd.status
FROM workflow.pipeline_job_step_data pjsd
WHERE pjsd.job_id = 'exec-abc123'
  AND pjsd.step_id = 'llm-analyze'
  AND pjsd.confidence < 0.7
ORDER BY pjsd.confidence ASC;
```

**Check LLM model used**:

```sql
-- See which LLM was used and its cost
SELECT
    pct.provider,
    pct.model,
    pct.input_tokens,
    pct.output_tokens,
    pct.total_cost_usd,
    pct.step_name
FROM workflow.pipeline_cost_tracking pct
WHERE pct.execution_id = 'exec-abc123'
ORDER BY pct.step_name;
```

**Solutions**:

- **Option 1**: Lower confidence threshold in YAML: `confidenceThreshold: 0.6`
- **Option 2**: Use more capable LLM: Switch from claude-3-5-sonnet to claude-3-opus
- **Option 3**: Check if document text is clear (OCR vs native PDF)
- **Option 4**: Add context: Include patient's previous visit data in llm-analyze step

---

### **Issue 4: FHIR Resource Creation Failed**

**Symptom**: Step 5 (FHIR-WRITE) failed; resources not created in FHIR server

**Investigation - Check what resource was attempted**:

```sql
-- See the FHIR resource that failed to persist
SELECT
    pjsd.item_id,
    pjsd.data,  -- ← Full FHIR resource JSON
    pjsd.status,
    pjsd.created_at
FROM workflow.pipeline_job_step_data pjsd
WHERE pjsd.job_id = 'exec-abc123'
  AND pjsd.step_id = 'fhir-write'
ORDER BY pjsd.created_at;
```

**Check validation errors**:

```sql
SELECT
    pjsf.item_id,
    pjsf.error_detail,
    pjsf.context_data->>'validation_error' as validation_error
FROM workflow.pipeline_job_step_failure pjsf
WHERE pjsf.job_id = 'exec-abc123'
  AND pjsf.step_id = 'fhir-write';
```

**Check if patient exists in FHIR server**:

```bash
# Query FHIR server for patient
curl -X GET "http://localhost:8080/fhir/r5/Patient?identifier=MRN|123" \
  -H "Accept: application/fhir+json"
```

**Solutions**:

- **Verify patient exists**: Create patient first if missing
- **Check code system bindings**:
  - Conditions → `http://snomed.info/sct`
  - Observations (labs) → `http://loinc.org`
  - Medications → `http://www.nlm.nih.gov/research/umls/rxnorm`
- **Validate dates**: Ensure ISO 8601 format `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`
- **Check references**: All referenced resources must exist before writing
- **Check for duplicate IDs**: Ensure no resource ID conflicts

---

### **Issue 5: Risk Flags Detected - Manual Review Needed**

**Symptom**: High-severity risk flags; output marked for clinician review

**Investigation - List all risk flags**:

```sql
SELECT
    prf.flag_type,
    prf.severity,
    prf.message,
    prf.remediation_hint,
    prf.step_name,
    prf.entity_reference,
    prf.created_at
FROM workflow.pipeline_risk_flags prf
WHERE prf.execution_id = 'exec-abc123'
ORDER BY prf.severity DESC, prf.created_at DESC;
```

**Examples**:

```
flag_type: DOSAGE_EXCEED
severity: ERROR
message: "Metoprolol dosage 500mg daily exceeds recommended max of 190mg daily"
remediation: "Verify with pharmacist; may need dosage adjustment"

flag_type: LOW_CONFIDENCE
severity: WARNING
message: "Medication extraction confidence 0.62 < 0.7 threshold"
remediation: "Clinician should verify medication name and dosage"

flag_type: CONFLICT
severity: ERROR
message: "Patient has 2 conflicting blood pressure values: 140/90 and 160/100"
remediation: "Determine which reading is current; retract invalid one"
```

**Solutions**:

- Create review queue: Flag entries with severity=ERROR for clinician review
- Adjust thresholds: Update `confidenceThreshold` if too strict
- Improve extraction: Add more context/examples to LLM prompts
- Verify source data: Check original document for accuracy

---

### **Issue 6: Performance Degradation - Slow Processing**

**Symptom**: Pipeline takes > 10 seconds; slow steps identified

**Investigation - Get step timings**:

```sql
SELECT
    pjs.step_id,
    pjs.step_sequence,
    (EXTRACT(EPOCH FROM (pjs.completed_at - pjs.started_at)))::int as duration_sec,
    pjs.processed_items,
    pjs.failed_items
FROM workflow.pipeline_job_step pjs
WHERE pjs.job_id = 'exec-abc123'
ORDER BY pjs.step_sequence;
```

**Get LLM token usage by step**:

```sql
SELECT
    step_name,
    COUNT(*) as call_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_cost_usd)::decimal(10,4) as total_cost
FROM workflow.pipeline_cost_tracking
WHERE execution_id = 'exec-abc123'
GROUP BY step_name
ORDER BY total_cost DESC;
```

**Solutions**:

- **LLM slowness** (step 3, 4): Use faster model (gpt-4o vs claude-3-opus)
- **Token budget exceeded**: Reduce document size or use shorter prompts
- **Database slowness**: Check partition distribution `SELECT count(*), job_id % 4 FROM pipeline_job_step_data GROUP BY 2`
- **Network latency**: Check LLM provider response times

---

### **Issue 7: Multi-Tenant Data Isolation**

**Symptom**: Need to verify data isolation between tenants

**Investigation - Check isolation**:

```sql
-- Verify executions are properly isolated by tenant
SELECT
    pj.tenant_id,
    COUNT(*) as execution_count,
    COUNT(CASE WHEN pj.status = 'COMPLETED' THEN 1 END) as completed,
    COUNT(CASE WHEN pj.status = 'FAILED' THEN 1 END) as failed
FROM workflow.pipeline_job pj
WHERE pj.pipeline_id = 'clinical-note-harmonizer'
GROUP BY pj.tenant_id
ORDER BY pj.tenant_id;

-- Query one tenant's data
SELECT *
FROM workflow.pipeline_job pj
WHERE pj.tenant_id = 'tenant-123'
  AND pj.pipeline_id = 'clinical-note-harmonizer';
```

---

### **Issue 8: Job Stops at `awaiting_review` / Nothing Written**

**Symptom**: `$status` stays `awaiting_review`; the patient chart shows no new records.

**Cause**: Expected behaviour. Review before save is on (`review.enabled: true`), and records are written only after approval.

**Solutions**:

- Review and approve: `GET …/$review?job=`, then `PATCH /api/agent/AgentInterventionRequest/{interventionId}` `{"decision":"approve"}` (or `POST …/$approve?job=`).
- Find waiting jobs: `GET …/$missions?status=awaiting_review`.
- For unattended imports, submit with `"reviewRequired": false`.
- A review older than `review.expiresAfter` (7d) returns `410 review-expired`. Re-submit the document.

---

### **Issue 9: `403` on `$execute` (Pre-Flight Permission Check)**

**Symptom**: `{"status":"forbidden","reason":"insufficient-permission","missing":[{"resourceType":"Procedure","operation":"create"}, …]}`, or `reason: user-identity-required`.

**Solutions**:

- Grant the user's role the missing SMART scopes (e.g. `user/*.cruds`), or assign a role that has them (`rbac_user_role` / `rbac_role_scope`).
- `user-identity-required`: the call used an API key or service token. Call with the signed-in user's Bearer token.
- Check up front with `GET …/$can-execute`.

---

### **Issue 10: A Generated Record Is Missing After Approval**

**Investigation**: `GET …/$mission-output?job=` and look at the record's `outcome`:

| Outcome                | Meaning                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SKIPPED_DUPLICATE`    | Exact duplicate of an existing record (`duplicateOf` gives its id). Without review it was removed before write (`dedup-check` log: `N removed`). |
| `EXCLUDED_BY_REVIEWER` | The reviewer excluded it (valid record, not wanted right now)                                                                                    |
| `IGNORED_BY_REVIEWER`  | The reviewer marked it as an LLM error or irrelevant (`ignoreReason` in the record view)                                                         |
| `FAILED`               | Write error in `error`                                                                                                                           |

A duplicate that should have been kept: re-submit with review on and resolve it with `$resolve-duplicate` `CREATE_NEW`.

---

### **Issue 11: Procedure Dates or Encounter Class Missing on Written Resources**

**Symptom**: Server log shows `LenientErrorHandler: Unknown element 'performedDateTime' / 'system' found while parsing`.

**Cause**: The LLM produced R4-shaped JSON (`Procedure.performed[x]`, `Encounter.class` as a Coding), which the R5 parser drops.

**Solution**: Fixed in the pipeline. `R5ResourceShapeNormalizer` in `llm-transform` rewrites these to R5. If you see the warning on another persona, check that its transform step runs the current build, and that its prompt asks for R5 elements.

---

### **Issue 12: `llm-fhir-mapping` Fails with Bedrock "Read timed out"**

**Symptom**: `BedrockLlmProvider: Bedrock API call failed after 120661ms: Unable to execute HTTP request: Read timed out (SDK Attempt Count: 4)`

**Cause**: Large transform prompts (e.g. ~47 KB, mostly existing patient context) take longer than the HTTP client's read timeout.

**Solutions**: Raise the Bedrock read / API-call timeout. Reduce the patient context sent to the transform (bulk-query `limit`, `_count`). The pipeline retry usually succeeds on the second attempt.

---

### **Dashboard Queries for Monitoring**

**Overall Pipeline Health**:

```sql
SELECT
    DATE(pj.created_at) as execution_date,
    pj.pipeline_id,
    pj.status,
    COUNT(*) as count,
    ROUND(AVG(EXTRACT(EPOCH FROM (pj.completed_at - pj.created_at))))::int as avg_duration_sec,
    ROUND(AVG(EXTRACT(EPOCH FROM (pj.completed_at - pj.created_at))), 2)::decimal(10,2) as avg_duration_sec_precise
FROM workflow.pipeline_job pj
GROUP BY DATE(pj.created_at), pj.pipeline_id, pj.status
ORDER BY execution_date DESC, pj.pipeline_id;
```

**Cost Breakdown by Provider**:

```sql
SELECT
    DATE(pct.created_at) as execution_date,
    pct.provider,
    pct.model,
    COUNT(*) as usage_count,
    SUM(pct.total_tokens) as total_tokens,
    SUM(pct.total_cost_usd)::decimal(10,4) as total_cost
FROM workflow.pipeline_cost_tracking pct
WHERE pct.created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(pct.created_at), pct.provider, pct.model
ORDER BY execution_date DESC, total_cost DESC;
```

---

## FAQ & Best Practices

### FAQ

**Q: How long does harmonization take?**

A: Typical end-to-end time:

- Simple text note (< 500 words): 2–4 seconds
- Complex PDF (10+ pages): 5–10 seconds
- Multi-page scan requiring OCR: 15–30 seconds

Limit via `timeout: 600s` in configuration.

**Q: Can I use local Ollama instead of OpenAI?**

A: Yes, for cost-saving in development:

```yaml
fhir4java:
  llm:
    provider: ollama
    ollama:
      base-url: http://localhost:11434
      model: neural-chat
```

Production use OpenAI/Claude for quality.

**Q: What if the document is in another language?**

A: LLM handles translation automatically. Update extraction prompt:

```yaml
steps:
  - step: llm-analyze
    extractionPromptRef: classpath:fhir-config/prompts/harmonizer/spanish.md
```

**Q: Can I reprocess a document to fix extraction errors?**

A: Yes, submit same patientId + document again. New jobId created; old job preserved in audit. With the docs harmonizer:

- Prefer **request-changes** during review (`{"decision":"request-changes","notes":"…"}`). It re-generates with your notes, keeps records you edited, and nothing is written in between.
- A re-submitted identical document is reported in `previousImports`. Its records are flagged as exact duplicates of the first import.

**Q: How does a user find imports they submitted earlier, or ones waiting for review?**

A: Use these endpoints:

- `GET /api/persona/DataPipelinePersona/{personaId}/$missions`: the caller's own missions, newest first. Filter with `status`, `patient`, `from`/`to`, `_count`/`_offset`.
- `…/$missions?status=awaiting_review`: jobs waiting for review.
- `submittedBy=any`: every mission of the persona. Needs read permission on the resource types the persona writes.
- `…/$mission-output?job=`: details of one mission. It stays available after step data expires.

**Q: How do I tell AI-generated records apart in the FHIR store?**

A: By `meta.tag` code `ai-generated` (system `http://fhir4java.org/CodeSystem/data-origin`), and the `ai-generation-provenance` extension. Its `missionId` links back to `$mission-output?job=`.

**Q: How do I integrate with Epic/Cerner EHR?**

A: Use their FHIR APIs to fetch documents:

```bash
curl https://epic.hospital.org/api/FHIR/R4/DocumentReference \
  -H "Authorization: Bearer <epic-token>" \
  -H "Accept: application/fhir+json" | jq '.entry[].resource.content[].attachment.data'
```

Then submit to harmonizer.

### Best Practices

#### For Healthcare IT Teams

1. **Start with small pilot**
   - Test with 100 documents before production
   - Monitor accuracy, confidence scores
   - Gather clinician feedback on summaries

2. **Use review before save** _(implemented: `clinical-docs-harmonizer`, `review.enabled: true`)_
   - Clinicians review, edit and approve records before the FHIR commit; the per-record `confidence` and duplicate flags show where to look first
   - Use `request-changes` notes as the feedback loop; the instruction history is kept for prompt tuning
   - Use `"reviewRequired": false` only for trusted, unattended batch imports

3. **Document storage strategy**
   - Keep raw documents (7-year retention for compliance)
   - Archive after 1 year to cheaper storage
   - Enable audit logging for all access

#### For Clinical Leadership

1. **Establish approval process**
   - Define scope: What data can harmonizer extract? (e.g., "diagnoses only, not medication adjustments")
   - Governance: Who reviews high-risk flags?
   - SLA: "90% of notes harmonized within 1 hour"

2. **Monitor quality metrics**
   - Weekly: % of notes requiring clinician review
   - Monthly: Extraction accuracy vs. gold standard (manual review)
   - Quarterly: Impact on downstream workflows (e.g., care gap detection)

3. **Plan for scaling**
   - Batch processing for end-of-day note imports
   - Real-time processing for urgent encounters
   - Cost optimization: Local LLM for routine notes, cloud LLM for complex cases

#### For Integration Engineers

1. **Error handling strategy**
   - Synchronous for < 5MB documents (response time < 10s)
   - Asynchronous for > 5MB (via SQS queue + webhooks)
   - Retry policy: Exponential backoff (1s, 2s, 4s, 8s)

2. **Performance optimization**
   - Cache extracted entities for 24h (same document may be uploaded twice)
   - Batch API calls: 10 documents per batch request
   - Use local Ollama for non-critical extractions

3. **Monitoring & alerting**
   - Alert if processing time > 60s (LLM provider issue)
   - Alert if write failure rate > 1% (database issue)
   - Daily health check: Parse test document, write test resource

---

## Appendix: Example Configurations

### Minimal Configuration (Development)

```yaml
# application-dev.yml
spring:
  datasource:
    url: jdbc:h2:mem:testdb

fhir4java:
  pipeline:
    harmonizer:
      enabled: true
      llm:
        provider: ollama
        model: neural-chat
        ollama:
          base-url: http://localhost:11434
      document-storage:
        type: local
        local:
          path: /tmp/documents
```

### Production Configuration (Multi-Tenant)

```yaml
# application-prod.yml
spring:
  datasource:
    url: jdbc:postgresql://postgres-prod.internal:5432/fhir4java
    hikari:
      maximum-pool-size: 50

fhir4java:
  pipeline:
    harmonizer:
      enabled: true
      steps:
        llm-analyze:
          timeout: 300s
          fallbackAction: SKIP
        fhir-write:
          timeout: 60s
          fallbackAction: FAIL

      llm:
        provider: openai
        model: gpt-4-turbo
        openai:
          api-key: ${OPENAI_API_KEY}

      document-storage:
        type: s3
        s3:
          bucket: clinical-documents-prod
          region: us-east-1
          encryption:
            enabled: true
            kms-key-id: ${AWS_KMS_KEY_ID}

      retention:
        retentionDays: 2555 # 7 years HIPAA
        archiveAfterDays: 365
        archiveLocation: s3-glacier

  monitoring:
    prometheus-enabled: true
    alert-thresholds:
      processing-time-p99: 30s
      extraction-confidence-min: 0.7
      write-error-rate-max: 0.001
```

---

## Implementation Status & References

### Phase 3 Implementation (2026-06-23)

This guide documents the **Phase 3 reference implementation** of Clinical Notes Harmonizer as a DataPipelinePersona. Key implementation details:

| Component                                                             | Location                                                                                              | Status                             | Reference                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ |
| Persona YAML                                                          | `fhir-config/personas/clinical-notes-harmonizer.yml`                                                  | ✅ Implemented                     | IMPL-GAP-3               |
| LLM Prompts                                                           | `fhir-config/prompts/clinical-notes-harmonizer/`                                                      | ✅ Implemented                     | GAP 23 (model aliases)   |
| Resource Bindings                                                     | `fhir-config/bindings/*.yml`                                                                          | ✅ Implemented                     | GAP 3.5                  |
| Pipeline Job Persistence                                              | `workflow` schema tables                                                                              | ✅ Implemented                     | GAP 22                   |
| LLM Model Aliases                                                     | Provider-specific config                                                                              | ✅ Implemented                     | GAP 23                   |
| Vision Model Performance                                              | Image size-based strategy                                                                             | ✅ Implemented                     | GAP 24                   |
| Review before save, dedup, provenance, pre-flight RBAC                | `clinical-docs-harmonizer.yml`; `pipeline/review/*` (api); `review-gate` / `dedup-check` steps (core) | ✅ Implemented (2026-09-27)        | Spec 2026-09-26 §4.1–4.8 |
| Source-document audit                                                 | `workflow.pipeline_job.document_*` (V135), `$source-document`                                         | ✅ Implemented                     | Spec §4.9                |
| `pipeline-review` interventions, `$missions`, mission output snapshot | `AgentInterventionRequest`, V136                                                                      | ✅ Implemented                     | Spec §4.10               |
| Terminology validation (SNOMED / LOINC / RxNorm)                      | `TerminologyValidator` SPI (no-op)                                                                    | 🟡 P2 — needs a terminology server | Spec §4.6                |

### Related Documentation

- **MASTER Implementation Plan**: `docs/MASTER-Persona-Audit-Implementation-Gaps-Recommendations.md`
  - GAP 3: Reference DataPipelinePersona implementations
  - GAP 3.5: FHIR resource write + normalization/binding framework
  - GAP 22: Pipeline job/step persistence (complete implementation)
  - GAP 23: LLM step model aliases (dynamic resolution)
  - GAP 24: Vision model performance (size-based hybrid strategy)

- **Related Specifications**:
  - `docs/superpowers/plans/2026-06-20-pipeline-job-step-persistence-complete-implementation.md` — Job persistence details
  - `docs/superpowers/specs/2026-06-15-datapipeline-persona-design.md` — DataPipelinePersona architecture
  - `docs/superpowers/specs/2026-09-26-docs-harmonizer-review-dedup-terminology-design.md` — Review before save, duplicate checks, provenance, pre-flight RBAC, source-document audit, interventions and mission list
  - `docs/AI-Persona-Design-User-Guide.md` → "DataPipelinePersona Review Before Save, Missions & Audit"

### Configuration Migration Checklist

When deploying Clinical Notes Harmonizer to production:

- [ ] Remove `fhir4java.document-parsing` section from application.yml
- [ ] Remove `fhir4java.normalization.status-mappings` section from application.yml
- [ ] Keep `fhir4java.ai.models.providers` configuration for LLM provider selection
- [ ] Verify `fhir-config/personas/clinical-notes-harmonizer.yml` is in classpath
- [ ] Verify `fhir-config/prompts/` and `fhir-config/bindings/` directories exist
- [ ] Run database migrations (V39, V112, V113) for pipeline infrastructure
- [ ] Run the review / audit migrations: V134 (review staging), V135 (source document), V136 (mission output snapshot + list indexes)
- [ ] Check the users' roles grant create on every type the harmonizer writes (`$can-execute`)
- [ ] Decide `review.enabled` per persona and whether batch callers send `"reviewRequired": false`
- [ ] Test end-to-end with sample document (see Testing section)

---

**Document End**

For questions or updates, contact: fhir4java-support@yourhealthcare.org
