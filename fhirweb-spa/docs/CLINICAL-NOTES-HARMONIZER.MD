 <!-- @suppress WikiTextMarkupValidation -->

# Clinical Notes Harmonizer: Setup & Integration Guide

**Version**: 1.0  
**Status**: Production-Ready  
**Last Updated**: 2026-06-16  
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

### Key Capabilities

| Capability                     | Description                                       | Example                                                 |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| **Multi-Format Ingestion**     | Parse text, PDF, CDA, HL7v2, HL7 v2.5.1           | Legacy EHR notes, scanned documents, external referrals |
| **Clinical Entity Extraction** | Auto-extract diagnoses, medications, observations | "Patient on metformin" → MedicationRequest + Condition  |
| **Semantic Code Mapping**      | Map clinical text to SNOMED, LOINC, RxNorm        | "High blood pressure" → SNOMED 38341003 (Hypertension)  |
| **FHIR Bundle Generation**     | Create atomic transaction bundles                 | All extracted entities bundled for single commit        |
| **Quality Metrics**            | Extraction confidence, success rates              | "Confidence: 0.92 (high); 5 entities extracted"         |
| **Risk Flagging**              | Identify data anomalies, conflicts                | "Medication dosage exceeds max; review required"        |
| **Fixed-DAG Execution**        | No replanning; deterministic pipeline             | Same input always produces same output                  |

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

**IMPORTANT**: Clinical Notes Harmonizer uses **generic DataPipelinePersona infrastructure** (GAP 19-21) shared by all pipelines.

The Flyway migration `V35__pipeline_staging.sql` creates these tables in the `workflow` schema:

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
  # Harmonizer-specific config
  pipeline:
    harmonizer:
      enabled: true
      # Step timeouts
      steps:
        bulk-query:
          timeout: 30s
        document-parse:
          timeout: 60s
        llm-analyze:
          timeout: 300s
          max-retries: 2
        llm-transform:
          timeout: 300s
        fhir-write:
          timeout: 60s
        aggregate:
          timeout: 30s

      # Overall pipeline
      total-timeout: 600s # 10 minutes
      max-tokens: 100000
      fallback-actions:
        document-parse: FAIL # Must succeed
        llm-analyze: SKIP # Skip on low confidence
        llm-transform: FAIL
        fhir-write: FAIL # Atomic; cannot skip

      # Storage
      document-storage:
        type: s3
        s3:
          bucket: clinical-documents
          region: us-east-1
          access-key: ${AWS_ACCESS_KEY_ID}
          secret-key: ${AWS_SECRET_ACCESS_KEY}
          # OR local filesystem:
          # type: local
          # local:
          #   path: /data/documents

  # LLM provider
  llm:
    provider: openai # or anthropic, ollama
    model: gpt-4-turbo
    openai:
      api-key: ${OPENAI_API_KEY}
      timeout: 60s
      retry-count: 2
    extraction-temperature: 0.1 # Low = deterministic extraction
    transform-temperature: 0.3

  # Multi-tenancy
  tenant:
    enabled: true

logging:
  level:
    org.fhirframework.core.pipeline: INFO
    org.fhirframework.core.harmonizer: DEBUG
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

---

## Configuration Guide

### Harmonizer Persona YAML Definition

**Location**: `fhir-config/personas/harmonizer.yml`

```yaml
# Core identity
resourceType: DataPipelinePersona
id: clinical-note-harmonizer
version: 1.0.0
description: |
  Clinical Notes Harmonizer ingests medical documents and transforms them
  into FHIR-compliant resources through a 6-step fixed-DAG pipeline.

# Scope & organizational context
scope: domain
domainCode: endocrinology # Or general-medicine, cardiology, etc.
requiresDelegation: true
runtime: fixed-dag # Not agent runtime; deterministic pipeline

# Status
status: active

# Pipeline definition
steps:
  - step: bulk-query
    description: Load patient context (existing conditions, medications)
    timeout: 30s
    fallbackAction: FAIL # Cannot proceed without context

  - step: document-parse
    description: Extract text from PDF/CDA/HL7v2
    timeout: 60s
    fallbackAction: RETRY # Retry on parse failure
    retryPolicy:
      maxRetries: 3
      backoffMs: 1000

  - step: llm-analyze
    description: Extract clinical entities (diagnoses, meds, labs)
    timeout: 300s
    fallbackAction: SKIP # Skip low-confidence entities
    confidenceThreshold: 0.7

  - step: llm-transform
    description: Map entities to FHIR resources
    timeout: 300s
    fallbackAction: FAIL # Cannot skip; validation needed

  - step: fhir-write
    description: Persist FHIR Bundle atomically
    timeout: 60s
    fallbackAction: FAIL # Atomic transaction; no skipping

  - step: aggregate
    description: Calculate metrics & generate summary
    timeout: 30s
    fallbackAction: SKIP # Summary is best-effort

# Completion criteria
completionCriteria:
  strategy: ALL_STEPS_COMPLETE
  timeout: 600s # 10 minutes total
  fallbackAction: FAIL

# Performance budgets
budget:
  timeout: 600s
  maxTokens: 100000
  maxLlmCalls: 20
  maxToolCalls: 100

# Document handling
documentFormats:
  - type: text
    mimeType: text/plain
  - type: pdf
    mimeType: application/pdf
  - type: cda
    mimeType: text/xml
  - type: hl7v2
    mimeType: application/hl7-v2

# LLM configuration
llmConfig:
  provider: openai # or anthropic, ollama
  model: gpt-4-turbo
  extractionTemperature: 0.1 # Deterministic
  transformTemperature: 0.3
  timeoutSeconds: 60
  retryCount: 2

# Storage
storage:
  documentBucket: clinical-documents
  retentionDays: 2555 # 7 years for compliance

# Audit & logging
audit:
  logAllSteps: true
  logRiskFlags: true
  logExtractedEntities: true
```

### Domain-Scoped Configuration Example

For **cardiology** harmonizer:

```yaml
resourceType: DataPipelinePersona
id: clinical-note-harmonizer-cardiology
domainCode: cardiology

# Cardiology-specific entity extractors
steps:
  - step: llm-analyze
    # Focus on cardiac entities
    extractionPromptRef: classpath:fhir-config/prompts/harmonizer/cardiology.md
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

### POST /api/agent/DataPipelinePersona/{personaId}/$invoke

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
  "executionId": "exec-abc123",
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

### POST /api/agent/DataPipelinePersona/{personaId}/$invoke (Asynchronous)

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

**Response (202 Accepted)**:

```json
{
  "executionId": "exec-async-456",
  "status": "QUEUED",
  "estimatedWaitSeconds": 30,
  "pollUrl": "/api/agent/DataPipelinePersona/clinical-note-harmonizer/execution/exec-async-456"
}
```

---

### GET /api/agent/DataPipelinePersona/{personaId}/execution/{executionId}

**Description**: Poll execution status (sync-like behavior for async jobs)

**Response (while RUNNING)**:

```json
{
  "executionId": "exec-async-456",
  "status": "RUNNING",
  "currentStep": "llm-analyze",
  "progress": {
    "completedSteps": 2,
    "totalSteps": 6,
    "percentComplete": 33
  }
}
```

**Response (after COMPLETED)**:

```json
{
  "executionId": "exec-async-456",
  "status": "COMPLETED",
  "duration": "4.2s",
  "steps": [ ... ],
  "outputs": { ... },
  "riskFlags": [ ... ]
}
```

---

### Deprecated Endpoints (Legacy - Still Functional)

```
POST /api/personas/clinical-notes-harmonizer/import          → forwards to /api/agent/DataPipelinePersona/clinical-note-harmonizer/$invoke
POST /api/personas/clinical-notes-harmonizer/import-async    → forwards to /api/agent/DataPipelinePersona/clinical-note-harmonizer/$invoke (mode: async)
GET /api/personas/clinical-notes-harmonizer/jobs/{jobId}     → forwards to /api/agent/DataPipelinePersona/clinical-note-harmonizer/execution/{jobId}
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

When you invoke `/api/agent/DataPipelinePersona/clinical-note-harmonizer/$invoke`, the response includes an `executionId`. Use this to query the execution state directly:

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

A: Yes, submit same patientId + document again. New jobId created; old job preserved in audit.

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

2. **Implement human review queue**
   - Flag high-risk extractions (confidence < 0.7 or risk flags)
   - Clinician review before FHIR commit
   - Feedback loop to improve LLM prompts

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

**Document End**

For questions or updates, contact: fhir4java-support@yourhealthcare.org
