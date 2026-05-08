# fhirweb-spa — Architecture Reference

## Stack

| Concern | Library |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| Routing | React Router DOM v6 |
| Server state / FHIR API | RTK Query (`@reduxjs/toolkit`) |
| Additional async queries | TanStack React Query v5 |
| Global UI state | Redux (`@reduxjs/toolkit`) |
| FHIR client | `fhir-kit-client` |
| SMART on FHIR | `fhirclient` |
| Real-time events | Native `EventSource` (SSE) |
| Testing | Vitest + Testing Library |

---

## Entry Point & Provider Tree

**`main.tsx`** bootstraps the app with this provider nesting (outermost → innermost):

```
<Provider store={store}>                    ← Redux global state
  <BrowserRouter basename="/smartapp">      ← Routing (base: /smartapp)
    <QueryClientProvider>                   ← TanStack React Query
      <FHIRProvider>                        ← FHIR client context
        <App />
      </FHIRProvider>
    </QueryClientProvider>
  </BrowserRouter>
</Provider>
```

TanStack React Query defaults: `staleTime = 5 min`, `refetchOnWindowFocus = false`.

---

## Routing (`routes.tsx`)

```
/launch                                        ← SMART on FHIR launch
/                                              ← Home
/patients                                      ← Patient search
/patient/new                                   ← Create patient (PatientCrudPage)
/patient/:id/details                           ← View/edit patient (PatientCrudPage)
/patient/:id/visit/new                         ← Register a visit (VisitRegistrationPage)
/patient/:id/encounter/:encounterId/consult    ← Clinical consult (ClinicalConsultPage)
/patient/:id/encounter/:encounterId/notes      ← Consult note detail (ConsultNoteDetailPage)
/patient/:id                                   ← Patient overview (PatientPage, nested layout)
  /careplan                                    ← CarePlan list
  /careplan/new                                ← Create CarePlan
  /careplan/crud/:resourceId                   ← View/edit CarePlan
  /observation                                 ← Observation list
  /observation/new                             ← Create Observation
  /observation/crud/:resourceId                ← View/edit Observation
  /medication                                  ← MedicationRequest list
  /medication/new                              ← Create MedicationRequest
  /medication/crud/:resourceId                 ← View/edit MedicationRequest
  /encounter                                   ← Encounter list
  /encounter/new                               ← Create Encounter
  /encounter/crud/:resourceId                  ← View/edit Encounter
/webhooks                                      ← Webhook management
/events                                        ← SSE event monitor
```

---

## State Management

### Redux store (`store/index.ts`)

Three slices registered:

| Slice | Purpose |
|---|---|
| `auth` (`authSlice`) | `isAuthenticated`, `token`, `user`, `loading`, `error` |
| `ui` (`uiSlice`) | `sidebarOpen`, `theme`, `notifications[]` |
| `fhirApi` (RTK Query) | Normalised FHIR resource cache |

### FHIR Context (`contexts/FHIRContext.tsx`)

Provides a `fhir-kit-client` instance app-wide. Initialised once on mount; re-initialisation available via `reinitializeClient()`. Checks for SMART context at startup and uses the appropriate auth strategy.

---

## FHIR API Layer (`services/fhir/client.ts`)

All FHIR communication is centralised here. Pages **never call `fetch` directly** for FHIR operations — they use the RTK Query hooks exported at the bottom of this file.

### Client factory

```ts
createFHIRClient(): Promise<Client>
```

- If `isSMARTContext()` → delegates to `smartClient.ts` (OAuth SMART flow via `fhirclient`)
- Otherwise → creates a `fhir-kit-client` with API-key header (`x-api-key`)
- Called fresh inside **every** RTK Query `queryFn` — no global singleton

### RTK Query endpoint hooks

#### Queries (read / search)

| Hook | FHIR Operation | Notes |
|---|---|---|
| `useGetPatientQuery(id)` | `GET /Patient/:id` | Tagged `Patient` |
| `useSearchPatientsQuery(params)` | `GET /Patient?...` | Supports `_offset` pagination |
| `useGetCarePlansQuery(patientId)` | `GET /CarePlan?patient=...` | 20 per page |
| `useGetObservationsQuery({ patientId, code?, date? })` | `GET /Observation?...` | Optional code/date filters |
| `useGetEncountersQuery(patientId)` | `GET /Encounter?patient=...` | 20 per page |
| `useGetMedicationsQuery(patientId)` | `GET /MedicationRequest?patient=...` | 20 per page |
| `useGetResourceByIdQuery({ resourceType, id })` | `GET /:resourceType/:id` | Generic; used by CRUD pages |
| `useSearchByEncounterQuery({ resourceType, encounterId })` | `GET /:resourceType?encounter=...` | Up to 100 results |
| `useSearchChildEncountersQuery(encounterId)` | `GET /Encounter?part-of=...` | Sub-encounters |
| `useGetPractitionersQuery()` | `GET /Practitioner?_count=100` | Reference lists |
| `useGetOrganizationsQuery()` | `GET /Organization?_count=100` | Reference lists |
| `useGetConditionsQuery({ patientId })` | `GET /Condition?patient=...` | Up to 100 |
| `useGetPractitionerByIdQuery(id)` | `GET /Practitioner/:id` | |
| `useGetLocationsQuery()` | `GET /Location?_count=100` | Reference lists |

#### Mutations (write)

| Hook | FHIR Operation | Cache Invalidation |
|---|---|---|
| `useCreateResourceMutation()` | `POST /:resourceType` | Invalidates `resourceType` tag |
| `useUpdateResourceMutation()` | `PUT /:resourceType/:id` | Invalidates `{ type, id }` |
| `useDeleteResourceMutation()` | `DELETE /:resourceType/:id` | Invalidates `{ type, id }` + type list |
| `useCreatePatientMutation()` | `POST /Patient` | Invalidates `Patient` |
| `useUpdatePatientMutation()` | `PUT /Patient/:id` | Invalidates `{ Patient, id }` |

#### Pagination mutations (use `_offset` / bundle links)

| Hook | Behaviour |
|---|---|
| `useGetNextPageMutation()` | Follows `next` link or increments `_offset` |
| `useGetPreviousPageMutation()` | Follows `previous` link or decrements `_offset` |
| `useGetFirstPageMutation()` | Follows `first` link or sets `_offset=0` |
| `useGetLastPageMutation()` | Follows `last` link or calculates last offset from `total` |
| `useGoToPageMutation()` | Computes `_offset = (page - 1) * _count` |

---

## Page Designs

### `pages/crud/` — Generic resource CRUD pages

All CRUD pages follow the same pattern:

1. **Read**: `useGetResourceByIdQuery` (or resource-specific query) on mount
2. **View/Edit toggle**: local `isEditMode` state; defaults to edit for new resources
3. **Submit**: `useCreateResourceMutation` (no `resourceId`) or `useUpdateResourceMutation` (has `resourceId`)
4. **Delete**: `useDeleteResourceMutation` with `window.confirm` guard
5. **Navigate** back to the list route on success

| Page | Resource Type | Special hooks |
|---|---|---|
| `PatientCrudPage` | `Patient` | `useCreatePatientMutation`, `useUpdatePatientMutation` (Patient-specific) |
| `CarePlanCrudPage` | `CarePlan` | Generic CRUD mutations |
| `ObservationCrudPage` | `Observation` | Generic CRUD mutations |
| `MedicationRequestCrudPage` | `MedicationRequest` | Generic CRUD mutations |
| `EncounterCrudPage` | `Encounter` | Generic CRUD mutations + `useGetPractitionersQuery`, `useGetOrganizationsQuery`, `useGetLocationsQuery`, `useGetConditionsQuery` for reference pickers |

---

### `pages/clinical/VisitRegistrationPage`

Creates a single **`Encounter`** resource for a patient visit:
- Chief complaint → `Encounter.reason[0].value[0].concept.text`
- Visit type (ambulatory / emergency) → `Encounter.class[0].coding`
- On success → navigates to `/patient/:id/encounter/:encounterId/consult`

Uses: `useGetPatientQuery`, `useCreateResourceMutation`

---

### `pages/clinical/ClinicalConsultPage`

Multi-tab clinical documentation UI. Each tab submit fires one or more `useCreateResourceMutation` calls:

| Tab | FHIR Resources Created | Key Codings |
|---|---|---|
| **Vitals** | `Observation` × N (one per non-empty field) | LOINC codes (`8867-4` HR, `8480-6` SBP, etc.); category `vital-signs`; `valueQuantity` with UCUM units |
| **Physical Exam** | `Observation` | SNOMED body system code; category `exam`; interpretation Normal/Abnormal; `valueString` for finding text |
| **Investigations** | `ServiceRequest` | SNOMED investigation category; `status: active`, `intent: order`; priority routine/urgent/stat |
| **Assessment** | `Condition` | SNOMED diagnosis code + severity; `verificationStatus` confirmed/provisional; `clinicalStatus: active` |
| **Management** | `MedicationRequest` + `CarePlan` | SNOMED route code; `intent: order`; dose/frequency as text |
| **Admission** | Child `Encounter` | `partOf: Encounter/:encounterId`; `status: planned`; location + ward |

All resources include `subject: Patient/:id` and `encounter: Encounter/:encounterId` references.

Uses: `useGetPatientQuery`, `useGetResourceByIdQuery`, `useCreateResourceMutation`

---

### `pages/clinical/ConsultNoteDetailPage`

Read-only retrospective view of a completed encounter. Loads all related resources in parallel:

```ts
useGetPatientQuery(patientId)
useGetResourceByIdQuery({ resourceType: 'Encounter', id: encounterId })
useSearchByEncounterQuery({ resourceType: 'Observation', encounterId })
useSearchByEncounterQuery({ resourceType: 'Condition', encounterId })
useSearchByEncounterQuery({ resourceType: 'MedicationRequest', encounterId })
useSearchByEncounterQuery({ resourceType: 'CarePlan', encounterId })
useSearchByEncounterQuery({ resourceType: 'ServiceRequest', encounterId })
useSearchChildEncountersQuery(encounterId)   // admission sub-encounter
```

Observations are partitioned by LOINC code (vitals) vs. SNOMED category (exam findings).

---

## Real-time Events (`hooks/useSSESubscription.ts`)

Custom hook using the native **`EventSource` API** against a separate backend (`VITE_SSE_BASE_URL`).

```
GET {SSE_BASE_URL}/api/events/stream?topics=Patient,Observation&actions=create,update,delete&apiKey=...
```

- API key passed as query param (EventSource does not support custom headers)
- Listens on both `onmessage` and the named `resource-change` event type
- Keeps last 100 events in local state
- Auto-reconnects on topic/action change (via `useEffect` dependency)
- Used by `EventMonitorPage`

---

## Other Services

### `services/fhir/webhookService.ts`

Plain `fetch`-based REST client for the webhook management API (separate from the FHIR server):

```
GET    /api/webhooks
POST   /api/webhooks
GET    /api/webhooks/:id
POST   /api/webhooks/:id/enable
POST   /api/webhooks/:id/disable
DELETE /api/webhooks/:id
```

Auth: `x-api-key` header (same key as FHIR client).

### `services/fhir/smartClient.ts`

SMART on FHIR OAuth flow. `isSMARTContext()` checks for the presence of SMART launch parameters; if true, `createAuthenticatedFHIRClient()` returns an OAuth-authenticated `fhir-kit-client`.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Generic `createResource` / `updateResource` / `deleteResource` hooks | One mutation reused across all clinical resource types; resource type passed as argument |
| `createFHIRClient()` called per `queryFn` | Enables runtime switch between SMART and API-key auth without a global singleton |
| Tag-based cache invalidation | Mutations declare which tags they invalidate; RTK Query automatically triggers refetches on dependent queries |
| Dual data-fetching tools (RTK Query + React Query) | RTK Query is the primary layer for FHIR; TanStack React Query is available globally but not heavily used in current pages |
| SSE via native `EventSource` | Simplest approach; browser reconnects automatically; API key sent as query param to work around EventSource header limitation |

---

## Clinical Section UI Pattern (ConsultNoteDetailPage)

All sidebar sections in `ConsultNoteDetailPage` follow a **consistent table + expandable row** pattern:

### Summary row
```
| <Name> [SNOMED/LOINC xxx] | <Category/Status> | <Date> | ▲/▼ |
```
- Terminology code rendered as `<span className="ml-2 text-xs font-mono text-gray-400">[{code}]</span>`
- Code prefix auto-detected: `SNOMED`, `LOINC`, `RxNorm` from system URL via `codeBadge()` helper

### Expanded row
```tsx
<td colSpan={N} className="bg-blue-50 border-b border-blue-100 px-4 py-3">
  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
    {/* labeled detail fields */}
  </div>
</td>
```
- Expand state managed by `expandedId: string | null` — clicking same row toggles it closed
- `codeBadge(coding[])` helper: returns `"SNOMED 12345"` / `"LOINC 58410-2"` / `"RxNorm xyz"` based on system URL

### Sections and their key columns

| Section | Summary columns | Terminology shown |
|---|---|---|
| Lab Orders | Test `[code]` \| Category \| Priority \| Ordered | SNOMED from `sr.code.concept.coding` |
| Rad Orders | Study `[code]` \| Priority \| Ordered | SNOMED from `sr.code.concept.coding` |
| Lab Results | Test `[code]` \| Category \| Status \| Issued | LOINC + SNOMED from `dr.code.coding` |
| Rad Reports | Study `[code]` \| Category \| Status \| Issued | SNOMED from `dr.code.coding` |
| MedicationRequest/Dispense/Statement | Drug `[code]` \| Status \| Route \| Date | RxNorm/SNOMED from `med.medication.concept.coding` |
| Care Plan | Title `[code]` \| Status \| Intent \| Created | SNOMED from `cp.category[0].coding` |

---

## FHIR Resource Structure Conventions

### ServiceRequest (Lab / Rad Orders)

```json
{
  "category": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "...", "display": "..." }] }],
  "code": { "concept": { "text": "Test name only" } }
}
```

- **Category** (`sr.category[0].coding[0]`) carries the order type code — NOT `sr.code`
- **Code** (`sr.code.concept.text`) carries only the human-readable test/study name
- Lab vs Rad split uses `isRadSR()`: checks `sr.category` first; falls back to `sr.code` for legacy records

**SNOMED codes:**
| Code | Meaning | Used for |
|---|---|---|
| `108252007` | Laboratory procedure | Lab ServiceRequest category |
| `310061009` | Radiology order | Rad ServiceRequest category |
| `394914008` | Radiology specialty | Rad ServiceRequest category (alt) |

### DiagnosticReport (Lab Results / Rad Reports)

```json
{
  "category": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "...", "display": "..." }] }]
}
```

**Lab SNOMED codes (`LAB_SNOMED_CODES`):** `252275004`, `59524001`, `252276003`, `19851009`, `394579002`, `394607009`, `74728003`, `108252007`, `4321000179101`, `15220000`

**Rad SNOMED codes (`RAD_SNOMED_CODES`):** `394914008`, `310061009`

Both ServiceRequest and DiagnosticReport share the same `RAD_SNOMED_CODES` set for consistency.

### Observation (Vitals)

- Category: `vital-signs` (HL7 system `http://terminology.hl7.org/CodeSystem/observation-category`)
- Codes: LOINC (e.g. `8867-4` HR, `8480-6` SBP, `8462-4` DBP, `8310-5` Temp, `59408-5` SpO2, `9279-1` RR)
- **Update mode**: existing observations are PUT (not duplicated); `VITAL_CODE_TO_FIELD` maps LOINC → form field

---

## Patient Queue (`PatientQueuePage`)

### Date filtering — two-layer approach
1. **Server-side**: `date=[ge{from}, le{to}T23:59:59]` sent as array (serialised to `date=ge...&date=le...` by `query-string`)
2. **Client-side guard**: filter by `enc.actualPeriod?.start.split('T')[0]` against `[fromISO, toISO]` — guarantees correctness regardless of server behaviour

### Patient name / identifier resolution
- `getTodayEncounters` includes `_include: 'Encounter:subject'` so Patient resources arrive in the same bundle
- `patientMap: Map<string, Patient>` built from bundle entries (resourceType === 'Patient')
- `resolvePatientName()`: reads `patient.name[0]` (text → prefix+given+family), falls back to `encounter.subject.display`
- `resolvePatientIdentifier()`: uses `identifier.type.text` → `type.coding.display` → last URL path segment of `identifier.system`

### Selection persistence
- `mode`, `fromMonth`, `toMonth` stored in `sessionStorage` (`queue-mode`, `queue-from`, `queue-to`)
- Restored via lazy state initialisers: `useState(() => sessionStorage.getItem(key) || default)`

---

## Role-Based UI Differences

### PSA role
| Context | Behaviour |
|---|---|
| Patient Queue | Shows: Mark Arrived, Cancel, View Patient. No consult actions |
| Patient Search | Shows: Register + **View Visit Summary** → `/patient/:id/encounter` |
| Visit Summary (`EncounterPage`) | **View Notes** only (no Start Consult, no Continue) |
| Top nav | Queue link removed; Patient Search accessible |

### Clinician role
| Context | Behaviour |
|---|---|
| Patient Queue | Shows: Start Consult (pending), Resume Consult (in-progress), View Notes (completed) |
| Patient Search | Shows: **Consult** → `/patient/:id/encounter` |
| Consult wizard | Pre-loads existing FHIR data; tabs with data show view-only mode with edit option |

---

## Consult Wizard Pre-load Pattern (`ClinicalConsultPage`)

On mount, all existing FHIR resources for the encounter are fetched and seeded into wizard state:

```
preloadedRef = useRef(false)   ← prevents re-init on re-renders
useEffect([...loading flags]) → sets all item arrays from FHIR bundle data
isAddingMore: Record<TabId, boolean>  ← per-tab add-new toggle
isEditingVitals: boolean              ← vitals-specific (no "add more", only update)
```

**Vitals update flow:**
1. `prepareVitalsEdit()` fills form fields from `rawVitals: Observation[]`
2. `handleSaveVitals()` builds `existingMap` (loincCode → Observation), PUTs existing, POSTs new
3. After save: `setVitalsItems(created)` replaces list; edit mode closed

**Navigation flow:**
- "Resume Consult" (Queue) → `/notes` (view page) → amber banner link → `/consult` (wizard)
- Tabs already submitted show in view-only mode; "Edit" button re-enables the form

