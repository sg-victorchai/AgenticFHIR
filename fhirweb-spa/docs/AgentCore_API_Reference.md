# AgentCore API Reference

Platform-level API for submitting, monitoring, and resolving AgentPersona missions and
intervention requests. All endpoints are verified against the current controller
implementations (`AgentMissionController`, `AgentInterventionController`).

> **Tenant isolation**: every list/search endpoint filters by the `X-Tenant-ID` header.
> Omitting the header uses `default` as the tenant ID.

---

## Contents

1. [Discover persona parameters](#1-discover-persona-parameters)
2. [Submit a mission](#2-submit-a-mission)
3. [Get a single mission](#3-get-a-single-mission)
4. [List missions](#4-list-missions)
5. [Stream mission events (SSE)](#5-stream-mission-events-sse)
6. [Cancel a mission](#6-cancel-a-mission)
7. [Execution traces](#7-execution-traces)
8. [List intervention requests](#8-list-intervention-requests)
9. [Resolve an intervention request](#9-resolve-an-intervention-request)
10. [Stream intervention events (SSE)](#10-stream-intervention-events-sse)
11. [Mission status values](#11-mission-status-values)

---

## 1. Discover persona parameters

```
GET /api/agent/AgentPersona/{id}/$parameters
```

Returns the full schema the frontend needs to render a mission submission form: what
typed parameters the persona accepts, which context keys are required, and what
execution modes are available. Call this before rendering the submit-mission UI.

### Headers

| Header        | Required | Notes                 |
| ------------- | -------- | --------------------- |
| `X-Tenant-ID` | No       | Defaults to `default` |

### Response — 200 OK

```json
{
  "personaId": "diabetic-care-assessment-manager",
  "personaName": "Diabetic Care Assessment Manager",
  "description": "Finds diabetic patients missing an HbA1c test, drafts care-gap notes, and routes for sign-off.",
  "intendedUserRole": "CARE_COORDINATOR",
  "intendedChannels": ["ehr-widget", "api-only"],
  "executionModes": ["background", "foreground"],
  "requiredContext": [
    {
      "key": "delegatedBy",
      "label": "Delegated by (user ID)",
      "type": "string",
      "required": true,
      "description": "User ID of the care coordinator submitting this mission"
    }
  ],
  "params": [
    {
      "id": "minAge",
      "label": "Minimum patient age",
      "type": "integer",
      "default": 45,
      "min": 18,
      "max": 100,
      "required": false,
      "description": "Only include patients at or above this age"
    },
    {
      "id": "lookbackMonths",
      "label": "HbA1c lookback window (months)",
      "type": "integer",
      "default": 6,
      "min": 1,
      "max": 24,
      "required": false,
      "description": "Patients missing HbA1c within this window are flagged"
    },
    {
      "id": "includePoorControl",
      "label": "Include patients with poor diabetes control",
      "type": "boolean",
      "default": false,
      "required": false,
      "description": "Also include patients with a recent HbA1c above the poor-control threshold"
    },
    {
      "id": "poorControlThreshold",
      "label": "Poor control HbA1c threshold (%)",
      "type": "number",
      "default": 9.0,
      "min": 7.0,
      "max": 15.0,
      "required": false,
      "dependsOn": { "param": "includePoorControl", "value": true },
      "description": "HbA1c above this value is considered poor control"
    },
    {
      "id": "locationFilter",
      "label": "Restrict to patients in location",
      "type": "location-group",
      "required": false,
      "description": "Optional geographic filter applied to the patient panel",
      "fields": [
        { "id": "addressCity", "label": "City", "type": "string" },
        { "id": "addressState", "label": "State", "type": "string" },
        { "id": "addressPostalCode", "label": "Postal code", "type": "string" }
      ]
    }
  ]
}
```

### Field reference

**`requiredContext`** — keys the caller must include in `context` when submitting the
mission. Derived automatically from the persona YAML:

| Persona YAML field                  | Derived `requiredContext` key                                |
| ----------------------------------- | ------------------------------------------------------------ |
| `metadata.requiresDelegation: true` | `delegatedBy` — user ID of the person delegating the mission |
| `scope: patient`                    | `patientId` — FHIR Patient resource ID                       |
| `scope: practitioner`               | `practitionerId` — FHIR Practitioner resource ID             |

Multiple rules may apply simultaneously.

**`params`** — typed, defaulted parameters the frontend renders as form fields.
All param types:

| `type`           | Frontend widget   | Supports                      |
| ---------------- | ----------------- | ----------------------------- |
| `integer`        | Number stepper    | `min`, `max`                  |
| `number`         | Decimal input     | `min`, `max`                  |
| `boolean`        | Toggle / checkbox | —                             |
| `string`         | Text input        | —                             |
| `select`         | Dropdown          | `options: [{value, label}]`   |
| `location-group` | Composite group   | `fields: [{id, label, type}]` |

`dependsOn: { param, value }` is a rendering hint — the frontend shows or hides the
field based on whether the named param equals the given value. The backend does not
enforce conditional presence; only explicit `required: true` params are validated at
submission.

**`executionModes`** — always `["background", "foreground"]` for all AgentPersonas.

### Examples — personas with no params

**Patient-scoped (digital-twin):**

```json
{
  "personaId": "digital-twin",
  "executionModes": ["background", "foreground"],
  "requiredContext": [
    {
      "key": "patientId",
      "label": "Patient ID",
      "type": "string",
      "required": true
    }
  ],
  "params": []
}
```

**Practitioner-scoped with a `select` param:**

```json
{
  "personaId": "panel-care-gap-overview",
  "executionModes": ["background", "foreground"],
  "requiredContext": [
    {
      "key": "practitionerId",
      "label": "Practitioner ID",
      "type": "string",
      "required": true
    },
    {
      "key": "delegatedBy",
      "label": "Delegated by (user ID)",
      "type": "string",
      "required": true
    }
  ],
  "params": [
    {
      "id": "measureCategory",
      "label": "Care gap category",
      "type": "select",
      "default": "all",
      "required": false,
      "options": [
        { "value": "all", "label": "All care gaps" },
        { "value": "diabetes", "label": "Diabetes care" },
        { "value": "preventive", "label": "Preventive care" }
      ]
    }
  ]
}
```

### Error responses

| Status | Reason            |
| ------ | ----------------- |
| 404    | Persona not found |

---

## 2. Submit a mission

```
POST /api/agent/AgentPersona/{personaId}/AgentMission
```

### Headers

| Header         | Required | Notes                                                      |
| -------------- | -------- | ---------------------------------------------------------- |
| `Content-Type` | Yes      | `application/json`                                         |
| `X-Tenant-ID`  | No       | Defaults to `default`                                      |
| `Accept`       | No       | Set to `text/event-stream` for foreground (live) execution |
| `X-Dev-Mode`   | No       | `true` auto-populates test delegation context              |

### Body

```json
{
  "goal": "Run the diabetic care gap assessment for patients 60 and older",
  "context": {
    "delegatedBy": "care-manager-abc-123",
    "minAge": 60,
    "lookbackMonths": 3,
    "addressCity": "Boston",
    "addressState": "MA"
  }
}
```

**`context` keys:**

- `delegatedBy` (or `delegatorRef` / `delegatingActor`) — required for any persona with
  `metadata.requiresDelegation: true`. The call is rejected with **403** if omitted.
- **Mission params** — any key declared in the persona's `params:` block, passed flat at
  the top level of `context`. `location-group` sub-fields (e.g. `addressCity`,
  `addressState`, `addressPostalCode`) are also passed as flat top-level keys — not nested
  under the group name.
- `notification.channels` — optional; sets the sign-off notification channel:
  ```json
  "context": {
    "delegatedBy": "<user-id>",
    "notification": {"channels": ["sse"]}
  }
  ```

### Default injection

The platform automatically injects defaults for any `params:` key the caller omits.
The caller does not need to supply defaults. Example for `diabetic-care-assessment-manager`:

| Param                  | Default  | Injected when omitted?                                |
| ---------------------- | -------- | ----------------------------------------------------- |
| `minAge`               | `45`     | Yes                                                   |
| `lookbackMonths`       | `6`      | Yes                                                   |
| `includePoorControl`   | `false`  | Yes                                                   |
| `poorControlThreshold` | `9.0`    | Yes                                                   |
| `addressCity`          | _(none)_ | No — absent means the FHIR filter is omitted entirely |

`location-group` sub-fields have no defaults. Submitting `"addressCity": ""` (empty string)
is **not** the same as omitting the key — the empty string is passed through to the LLM and
will reach the FHIR query unchanged.

### Param validation

Checked in order after default injection; first failure returns **422**:

| Rule                                  | Error body (`OperationOutcome`)                             |
| ------------------------------------- | ----------------------------------------------------------- |
| Required param missing                | `diagnostics: "param 'X' is required"`                      |
| Integer/number below min              | `diagnostics: "param 'X' value 15 is below minimum 18"`     |
| Integer/number above max              | `diagnostics: "param 'X' value 200 is above maximum 100"`   |
| Boolean value not `true`/`false`      | `diagnostics: "param 'X' must be true or false, got: yes"`  |
| Select value not in options           | `diagnostics: "param 'X' value 'foo' is not one of: [...]"` |
| Non-numeric string for integer/number | `diagnostics: "param 'X' must be numeric, got: abc"`        |

String `"45"` sent for an `integer` param is coerced to a number automatically. The
coerced value is written back to context so the LLM always receives a `Number`, not a
string.

### Responses

**Background (default — no `Accept: text/event-stream` header)**

```
201 Created
{
  "missionId": "<uuid>",
  "status": "PENDING"
}
```

The platform's scheduler picks up PENDING missions asynchronously.

**Foreground (`Accept: text/event-stream` or `"executionMode": "foreground"` in context)**

```
200 OK
Content-Type: text/event-stream

data: {"event": "STARTED", ...}
data: {"event": "TOOL_CALL", ...}
data: {"event": "AWAITING_INTERVENTION", ...}
...
```

The response IS the event stream — it stays open and emits each step as the mission
runs, until it completes, fails, or pauses for sign-off.

### Errors

| Status | Reason                                                                           |
| ------ | -------------------------------------------------------------------------------- |
| 403    | `requiresDelegation: true` but no delegation key in context                      |
| 404    | Persona not found in registry                                                    |
| 422    | Param validation failure (required missing, out of bounds, invalid select value) |
| 429    | Tenant concurrency limit exceeded                                                |

---

## 3. Get a single mission

```
GET /api/agent/AgentMission/{missionId}
```

Returns the mission entity. Key fields:

| Field                                     | Description                                            |
| ----------------------------------------- | ------------------------------------------------------ |
| `id`                                      | Mission UUID                                           |
| `personaId`                               | Persona that owns this mission                         |
| `status`                                  | Current status (see §11)                               |
| `goal`                                    | The goal string submitted                              |
| `result`                                  | Populated when COMPLETED — success summary and outputs |
| `failureReason`                           | Populated when FAILED or CANCELLED                     |
| `createdAt` / `startedAt` / `completedAt` | Timestamps                                             |

```bash
curl http://localhost:8080/api/agent/AgentMission/{missionId} \
  -H "X-Tenant-ID: <tenant-guid>"
```

---

## 4. List missions

```
GET /api/agent/AgentMission
```

All variants require `X-Tenant-ID` and filter to that tenant only.

### Query parameters (mutually exclusive — use one per call)

| Parameter    | Example                                       | Notes                                       |
| ------------ | --------------------------------------------- | ------------------------------------------- |
| `personaId`  | `?personaId=diabetic-care-assessment-manager` | All missions for this persona in the tenant |
| `status`     | `?status=AWAITING_INTERVENTION`               | All missions in this status for the tenant  |
| `scheduleId` | `?scheduleId=<id>`                            | Missions belonging to a specific schedule   |
| _(none)_     | —                                             | All missions for the tenant                 |

```bash
# All missions for a persona
curl "http://localhost:8080/api/agent/AgentMission?personaId=diabetic-care-assessment-manager" \
  -H "X-Tenant-ID: <tenant-guid>"

# Missions currently waiting for sign-off
curl "http://localhost:8080/api/agent/AgentMission?status=AWAITING_INTERVENTION" \
  -H "X-Tenant-ID: <tenant-guid>"
```

---

## 5. Stream mission events (SSE)

```
GET /api/agent/AgentMission/{missionId}/events
```

Reattach to a background mission's live event stream, or resume a dropped foreground
connection. Use the `Last-Event-Id` header to replay from the last received event.

```bash
curl -N "http://localhost:8080/api/agent/AgentMission/{missionId}/events" \
  -H "Accept: text/event-stream" \
  -H "Last-Event-Id: <last-seen-event-id>"
```

---

## 6. Cancel a mission

```
DELETE /api/agent/AgentMission/{missionId}/$cancel
```

Cancels a PENDING or RUNNING mission. Returns **400** if the mission is already
COMPLETED or FAILED.

```
200 OK
{"missionId": "<uuid>", "status": "CANCELLED"}
```

---

## 7. Execution traces

```
GET /api/agent/ExecutionTrace?mission={missionId}
```

Returns episodic memory traces for a mission (empty list if episodic memory is disabled
for the persona). Useful for debugging what the agent reasoned through step by step.

---

## 8. List intervention requests

```
GET /api/agent/AgentInterventionRequest
GET /api/agent/AgentInterventionRequest?status=PENDING
```

Returns a FHIR `Bundle` (searchset). Filtered to the `X-Tenant-ID` tenant.

### Response fields per entry

| Field                     | Description                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                      | Intervention UUID                                                                                                                                                              |
| `missionId`               | Mission this intervention belongs to                                                                                                                                           |
| `type`                    | `approval` \| `clarification` \| `checkpoint` \| `terminology-confirmation`                                                                                                    |
| `status`                  | `PENDING` \| `ANSWERED` \| `TIMED_OUT`                                                                                                                                         |
| `question`                | The question or summary the agent presented                                                                                                                                    |
| `options`                 | Array of valid response values (e.g. `["approve","request-changes","reject"]`)                                                                                                 |
| `assignee`                | Role expected to resolve (e.g. `care_manager`)                                                                                                                                 |
| `timeoutAction`           | `FAIL` — intervention marked `TIMED_OUT`; **mission stays `AWAITING_INTERVENTION`** (offline review still accepted). `PROCEED` / `SKIP` — mission auto-resumes as if approved. |
| `createdAt` / `expiresAt` | Timestamps. After `expiresAt`, the intervention is `TIMED_OUT` but the mission can still be resumed by submitting a decision.                                                  |
| `context`                 | For `approval` type: contains `proposedPlan.steps` if preceded by `propose_plan`                                                                                               |

```bash
# All pending sign-offs in this tenant
curl "http://localhost:8080/api/agent/AgentInterventionRequest?status=PENDING" \
  -H "X-Tenant-ID: <tenant-guid>"
```

---

## 9. Resolve an intervention request

```
PATCH /api/agent/AgentInterventionRequest/{id}
Content-Type: application/json
```

The body has no fixed schema — the entire body is stored as the assignee's response and
fed back to the resumed mission as plain-language context. The mission resumes
automatically once the intervention is resolved.

### Common body shapes

**Approval / rejection (most AgentPersona sign-off interventions)**

```json
{"decision": "approve"}

{"decision": "request-changes", "notes": "Please add medication context for patient X before drafting."}

{"decision": "reject", "notes": "Cohort scope is too broad for this review cycle."}
```

**Terminology confirmation** (type `terminology-confirmation`)

```json
{
  "decision": "confirm",
  "conceptName": "diabetic patients",
  "resourceType": "Condition",
  "codes": [{ "system": "http://snomed.info/sct", "code": "73211009" }],
  "tier": "HUMAN_OVERRIDE",
  "confirmedBy": "care-manager-user-id"
}
```

Supported `decision` values for terminology confirmation: `confirm`, `edit`,
`add-alternative`, `unmappable`.

### Response

Returns the updated intervention entity (same fields as §8). The associated mission resumes asynchronously after this call commits:

- `approve` → agent executes the approved plan steps → `COMPLETED`
- `request-changes` → agent revises and re-proposes a new plan → back to `AWAITING_INTERVENTION`
- `reject` → agent revokes any drafted CarePlans (via `fhir_mutate`) → `COMPLETED`

**Note**: If the mission is in `FAILED` status (e.g., set by an older sweeper version before the timeout fix), submitting a decision re-activates it to `AWAITING_INTERVENTION` first, then resumes normally.

---

## 10. Stream intervention events (SSE)

```
GET /api/events/stream?topics=AgentInterventionRequest
```

Pushes a server-sent event whenever an `AgentInterventionRequest` resource is created
or updated. A client subscribed here receives real-time notice when a mission pauses for
sign-off — without polling.

Every intervention is also mirrored as a real FHIR resource via `EventPublisher`, so
this stream fires independently of any per-channel notification adapter.

```bash
curl -N "http://localhost:8080/api/events/stream?topics=AgentInterventionRequest" \
  -H "Accept: text/event-stream" \
  -H "X-Tenant-ID: <tenant-guid>"
```

---

## 11. Mission status values

| Status                  | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `PENDING`               | Submitted; not yet picked up by the scheduler                        |
| `RUNNING`               | Actively executing                                                   |
| `AWAITING_INTERVENTION` | Paused; waiting for a human to resolve an `AgentInterventionRequest` |
| `COMPLETED`             | Mission finished successfully; `result` field is populated           |
| `FAILED`                | Mission ended with an error or timeout; `failureReason` is populated |
| `CANCELLED`             | Cancelled via `DELETE /$cancel`                                      |

---

## Quick reference

```bash
# Discover persona parameters (call before rendering submit form)
curl http://localhost:8080/api/agent/AgentPersona/<personaId>/\$parameters \
  -H "X-Tenant-ID: <tenant-guid>"

# Submit (background, with mission params)
curl -X POST http://localhost:8080/api/agent/AgentPersona/<personaId>/AgentMission \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <tenant-guid>" \
  -d '{
    "goal": "<goal>",
    "context": {
      "delegatedBy": "<user-id>",
      "minAge": 60,
      "lookbackMonths": 3
    }
  }'

# Submit (foreground / live stream)
curl -N -X POST http://localhost:8080/api/agent/AgentPersona/<personaId>/AgentMission \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "X-Tenant-ID: <tenant-guid>" \
  -d '{"goal": "<goal>", "context": {"delegatedBy": "<user-id>"}}'

# Check status
curl http://localhost:8080/api/agent/AgentMission/<missionId> \
  -H "X-Tenant-ID: <tenant-guid>"

# List missions waiting for sign-off
curl "http://localhost:8080/api/agent/AgentMission?status=AWAITING_INTERVENTION" \
  -H "X-Tenant-ID: <tenant-guid>"

# List pending intervention requests
curl "http://localhost:8080/api/agent/AgentInterventionRequest?status=PENDING" \
  -H "X-Tenant-ID: <tenant-guid>"

# Approve a sign-off
curl -X PATCH http://localhost:8080/api/agent/AgentInterventionRequest/<id> \
  -H "Content-Type: application/json" \
  -d '{"decision": "approve"}'

# Cancel a mission
curl -X DELETE http://localhost:8080/api/agent/AgentMission/<missionId>/\$cancel \
  -H "X-Tenant-ID: <tenant-guid>"

# Watch intervention events live
curl -N "http://localhost:8080/api/events/stream?topics=AgentInterventionRequest" \
  -H "Accept: text/event-stream" \
  -H "X-Tenant-ID: <tenant-guid>"
```
