# Security Assessment and Remediation Recommendations

**Application:** `fhirweb-spa`

**Assessment date:** 2026-09-12, second review

**Source baseline:** `bd4cf34`, branch `feature/smart-on-fhir`

**Status:** Findings and recommendations only; no application or dependency fixes applied.

## 1. Executive assessment

The second review identified application security weaknesses that dependency updates alone will not address: client-only demo authentication, insecure Azure transport configuration, browser-distributed API credentials, incomplete logout cleanup, and sensitive console logging.

**Do not rely on the current login, role selection, or browser-supplied tenant/patient context as authorization boundaries.** Backend authorization and the live deployment were not assessed. Consequently, this report does not establish unauthorized access to a real patient's records, a cross-tenant compromise, or remote code execution.

The fresh full dependency audit reports **62 vulnerable-package entries: 2 critical, 35 high, 23 moderate, and 2 low**. These are not 62 independently exploitable application vulnerabilities. The critical entries relate to legacy Expo and XML dependencies; browser exploitability was not demonstrated.

This revision supersedes the earlier remediation advice. In particular, storing a `VITE_API_KEY` in a secret manager does not protect it once compiled into browser JavaScript, several previously recommended upgrade targets are already installed and still flagged, and the proposed unscoped `xmldom@^0.8.10` override is invalid.

## 2. Scope, evidence and limitations

Review covered static searches across 59 TypeScript/TSX files and manual tracing of authentication, roles, patient context, SMART integration, requests, logout, logging, rendering, upload polling, and Azure deployment. Dependency work included the lockfile, selected installed SDK internals, npm dependency ancestry, full/production audits, and an existing build sourcemap.

All source references below are relative to `fhirweb-spa/` and refer to the baseline above. Confidence expresses confidence in the described source/configuration behavior, not proof that a live service is exploitable.

| Evidence | Recorded value |
|---|---|
| Node / npm | `v22.20.0` / `10.9.3` |
| Audit inventory timestamp | `2026-09-12T05:46:57Z` |
| `package-lock.json` SHA-256 | `41dca8bce9afc2427aba0485ec2f68e5752bf3c845b1cddf5e6c5a6a48638a11` |
| Audit commands | `npm audit --json`; `npm audit --omit=dev --json` |
| Registry scope | Resolved dependency entries use the public npm registry; no private package metadata was submitted |
| Supplemental evidence | Raw audits, complete advisory/node inventory, and source findings retained as `second-security-{full,prod,inventory,evidence}.json` in the assessment session's `files/` directory; these are not repository files |

No backend implementation was available to establish API enforcement. No deployed API/cloud account was contacted, no credentials were tested, and no exploitation, installation, dependency repair, build, or deployment was performed. This is a source/configuration and dependency assessment, not a penetration test, compliance certification, or exhaustive line-by-line verification. Secret values are deliberately omitted.

## 3. Application findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| APP-01 | 🟠 HIGH | `src/pages/LoginPage.tsx`; `src/store/slices/authSlice.ts` | 13-29; 15-24 | Client-only demo login and trusted browser auth state bypass the UI gate | 10/10 |
| APP-02 | 🟠 HIGH | `.env.azure`; `infra-azure/main.bicep` | 4, 7, 13; 15-17 | Azure configuration permits cleartext traffic and legacy TLS | 10/10 |
| APP-03 | 🟡 MEDIUM | `src/services/fhir/client.ts`; `src/hooks/useSSESubscription.ts` | 17, 49-55; 70-76 | Shared API key exposed to browser and SSE URL/logs | 10/10 |
| APP-04 | 🟡 MEDIUM | `src/components/common/Header.tsx`; `src/store/slices/authSlice.ts` | 17-21; 83-87 | Logout retains SMART credentials/client and patient caches | 9/10 |
| APP-05 | 🟡 MEDIUM | `src/pages/crud/PatientCrudPage.tsx`; `src/services/fhir/smartClient.ts` | 361-366; 10-11 | Sensitive patient input and OAuth context logged | 10/10 |

### APP-01: Client-only authentication

**Evidence:** `LoginPage.tsx:13-29` compares a hardcoded credential pair and creates a mock token without an identity-provider/server exchange. `authSlice.ts:15-24` restores the authenticated flag from editable `localStorage.auth_state`. `src/routes.tsx:35-51` trusts that flag. Non-SMART requests instead use the configured shared API key (`src/services/fhir/client.ts:39-56`).

**Precondition and impact:** Any visitor can inspect distributed code or change their own browser storage and enter protected frontend functions. The UI user identity can be impersonated. Actual API reads/writes still depend on backend authentication and authorization, which were not verified; the mock token itself does not prove server acceptance.

**Recommended fix:** Replace demo login with a trusted OIDC/SMART authorization-code session. Derive session state from a validated identity/session rather than treating browser persistence as evidence of authentication. Enforce authentication at every API independently. Remove demo credentials/mock login from release builds, or isolate them in an explicitly non-production build with no real data or privileged credentials.

**Acceptance:** Modified browser auth state cannot create a valid API session; missing, expired and forged credentials receive `401`; production artifacts contain no reusable login credential or functional mock-login path.

### APP-02: Insecure Azure transport configuration

**Evidence:** The locally available `.env.azure:4,7,13` selects HTTP FHIR, agent and SSE endpoints. `infra-azure/deploy.sh:41-54` builds that profile and uploads `dist` to Blob static hosting; lines 60-65 print an HTTP endpoint. `infra-azure/main.bicep:15-17` sets `supportsHttpsTrafficOnly=false` and `minimumTlsVersion=TLS1_0`. The production profile separately uses HTTPS; that does not protect a deployment built using the Azure profile.

**Precondition and impact:** If this configuration is deployed and traffic traverses HTTP, an on-path observer/attacker can observe or modify patient data, API credentials or delivered JavaScript. With an HTTPS SPA origin, HTTP API requests may instead fail because of mixed-content restrictions. Actual deployment state was not established.

**Recommended fix:** Require HTTPS for the SPA and every API/SSE endpoint, enforce modern TLS (at least TLS 1.2) at the actual host/edge, and configure HTTPS redirection and appropriate HSTS. Reject non-loopback HTTP URLs during release configuration validation. Retain localhost HTTP only for isolated development.

**Acceptance:** Every supported release profile uses HTTPS end-to-end, infrastructure disallows insecure transport, and authorized deployment checks confirm redirects, TLS policy and absence of mixed content.

### APP-03: Browser API-key disclosure and SSE credential logging

**Evidence:** `src/services/fhir/client.ts:17,49-55` and `src/services/fhir/webhookService.ts:5,52-58` use a build-time `VITE_API_KEY` in browser requests. `src/services/agentMissionService.ts:99-103` falls back to this key without a SMART access token. `src/hooks/useSSESubscription.ts:70-76` appends it as `apiKey` to the EventSource URL and logs the complete URL. The reviewed tracked development profile contains a configured value; Azure/production profiles were local ignored/untracked files. Credential validity and privilege were not tested.

**Precondition and impact:** A configured key is observable by anyone receiving the build or its requests, independent of SPA login. URL-based credentials can additionally be retained in URL-processing infrastructure and console captures. Abuse depends on the privileges the backend grants the value. SSE requests are not assumed to appear in browser navigation history.

**Recommended fix:** Treat all client-referenced `VITE_*` values as public configuration. Keep privileged service keys on a backend-for-frontend (BFF) that authenticates and authorizes users, or use short-lived, user-bound, appropriately scoped OAuth access. Use an authenticated fetch stream or a suitable same-origin cookie/BFF design for SSE; account for cookie security and CSRF where applicable. Never place durable credentials in URLs or logs. Rotate genuinely secret exposed keys after removing their client use, and assess old bundles/logs.

**Acceptance:** Public bundles/maps and browser requests contain no privileged shared service secret; no durable token/key appears in URLs or console output; old credentials are rejected and event streams enforce caller/tenant/patient scope.

### APP-04: Incomplete logout and principal change cleanup

**Evidence:** `Header.tsx:17-21` dispatches only logout/role cleanup and navigates. `authSlice.ts:83-87` clears Redux auth and `auth_state`; `src/store/slices/uiSlice.ts:55-57` clears `userRole`. `src/main.tsx:12-29` keeps the query client/FHIR provider mounted above routes; `src/store/index.ts:6-17` retains the RTK Query store. No API-cache reset or query-client cleanup was found. `src/services/fhir/smartClient.ts:17-31,47-65` can rediscover remaining SMART state and credentials. Patient/tenant context is stored independently.

**Precondition and impact:** After a prior SMART session or patient query, the same browser tab is reused before token/cache expiry. Sensitive state remains after apparent logout, and a subsequent session may reuse the prior SMART authority. RTK Query's patient caches are the concrete clinical cache concern; clinical data in TanStack Query was not established. Server token revocation/expiry behavior is unknown.

**Recommended fix:** Centralize logout/principal-switch cleanup: remove app-owned SMART session state and retained clients, clear patient/tenant context, reset RTK Query and applicable TanStack caches, cancel in-flight operations/streams, and prevent late responses from repopulating caches. Invoke supported server/IdP logout or revocation as appropriate; do not indiscriminately erase unrelated origin storage.

**Acceptance:** Same-tab logout/relogin never displays the previous principal's cached PHI or sends their token; app-owned SMART/patient context is cleared and invalidated credentials fail server-side.

### APP-05: Sensitive logging

**Evidence:** `src/pages/crud/PatientCrudPage.tsx:361-366` logs changed field names/values. `src/services/fhir/smartClient.ts:10-11` logs the current URL, which may contain OAuth code/state before SDK processing. `src/hooks/useSSESubscription.ts:88,108` and `src/pages/EventMonitorPage.tsx:22` log event details containing tenant/resource context. The key-bearing SSE URL is separately covered by APP-03.

**Precondition and impact:** Real patient or OAuth data passes through these paths, and an unauthorized party obtains console captures, support artifacts or telemetry that includes them. Unnecessary disclosure to console is established; a remote telemetry collector or remote log compromise is not.

**Recommended fix:** Remove raw patient-field/event/OAuth logging; use structured allowlisted operational events with appropriate redaction. Review logging access, retention and historical exports. Production log suppression alone does not remediate a secret still distributed in JavaScript.

**Acceptance:** Synthetic PHI, keys and OAuth code/state markers never appear in release console/telemetry captures; retained operational fields have approved sensitivity/access rules.

## 4. Conditional risks and required backend assurance

These items require further evidence before reporting a confirmed exploitable vulnerability. They are not additional confirmed critical/high findings.

| Area | Source evidence | Assessment and recommended action |
|---|---|---|
| Role, tenant and patient authorization | `src/pages/RoleSelectionPage.tsx:37-39,49-73`; `src/store/slices/uiSlice.ts:20,51-53`; `src/components/common/RoleGuard.tsx:12-23`; `src/routes.tsx:57-60,124-128,152-184` | Roles are freely selected and SMART callbacks assign clinician locally; some mutation/admin routes lack role guards. These are UI controls, not proof of backend privilege escalation. Derive authoritative entitlements server-side and reflect them in the UI. |
| Patient selection / cross-tenant access | `src/pages/PatientPortalPage.tsx:30-44,146-149`; `src/pages/PatientRecordsPage.tsx:1433,2007-2080`; `src/services/agentMissionService.ts:39-103` | Client searches/selects patients and supplies tenant/patient hints from storage/path. Require backend identity-derived patient/tenant/action enforcement; never trust these headers as authorization. No BOLA/IDOR or tenant escape was demonstrated. |
| SMART trust and PKCE | `src/pages/LaunchPage.tsx:14-23`; installed `fhirclient/lib/smart.js:156-160,241-253,306-320` | URL launch/issuer overrides and SDK open-server paths need a deployment-specific trust policy. Require trusted HTTPS issuers/discovery endpoints and supported S256 PKCE; reject inappropriate overrides/open-server flows in production. Account for intentional multi-EHR support rather than blindly restricting to one issuer. No account takeover proven. |
| Credential-bearing polling destinations | `src/pages/PatientRecordsPage.tsx:1610-1638,1745,1771,1975-1980` | Backend-provided absolute `pollUrl` can be fetched with original auth/context headers. Attacker control of that response was not established. Construct URLs from a trusted API origin plus job ID, or validate origin/scheme before attaching credentials. Cross-origin delivery also depends on browser CORS. This is not server-side SSRF. |
| Security headers / hosting mismatch | `public/staticwebapp.config.json:6-9`; `infra-azure/deploy.sh:47-54` | Static Web Apps configuration includes no-store/nosniff/frame protection but does not establish Blob-hosting response headers. Configure a supported edge/host with tailored CSP, Referrer-Policy, transport and framing controls. Allow only intended EHR embedding origins; do not blindly impose a policy that breaks SMART embedding. |
| Public sourcemaps | `vite.config.ts:35-37`; `infra-azure/deploy.sh:47-54` | Sourcemaps with source content are generated and all `dist` is uploaded. Prefer private diagnostic maps or exclude maps from publication. Map removal does not hide browser credentials and is not itself an authorization fix. |
| Webhooks, uploads and AI operations | `src/services/fhir/webhookService.ts:91-100`; `src/pages/PatientRecordsPage.tsx:1880-1925` | Backend callback filtering, file size/content limits, scanning, tool authorization, approvals, audit trails and PHI retention remain unreviewed. Do not infer SSRF, RCE or prompt-injection exploitation merely from these frontend features. |

**Required negative authorization matrix:** Patient A cannot list/read/change Patient B; tenant A cannot access tenant B by altering headers, path or body; a patient cannot invoke clinician/webhook administration; anonymous, forged, expired or unscoped requests fail even after bypassing UI controls.

**Positive evidence:** No raw HTML/eval-style sink was found in the source search; `AgentResponseFormatter` renders external content as React text. No application XSS was confirmed. The SDK does validate stored OAuth state (`fhirclient/lib/smart.js:393-395,464`) and supports S256; it is incorrect to claim absent OAuth state validation. These observations are not proof that every rendering or OAuth path is safe.

## 5. Dependency assessment

### 5.1 Counts and interpretation

| Snapshot | Critical | High | Moderate | Low | Package entries | Unique GHSA advisories |
|---|---:|---:|---:|---:|---:|---:|
| Original user-provided install output | 2 | 43 | 24 | 7 | 76 | Not supplied |
| Second review: full audit | 2 | 35 | 23 | 2 | 62 | 54 |
| Second review: `--omit=dev` | 2 | 29 | 21 | 1 | 53 | 49 |

The original 76 is historical, not a fresh result. The count change is **not evidence of remediation**: no dependencies were changed in this review, and the original lockfile/registry response was not preserved sufficiently to attribute the difference.

npm counts vulnerable packages and inherited dependency findings; multiple packages can refer to the same advisory. Production-graph membership includes optional/peer mobile tooling and is **not** proof that vulnerable code ships to, or executes in, the browser. Build tools can still matter when processing attacker-controlled inputs or running in privileged CI.

### 5.2 Root cause and runtime reachability

The observed dependency ancestry includes:

```text
fhirclient 2.6.3
  -> isomorphic-webcrypto 2.3.8
  -> optional expo-random 14.0.1
  -> peer expo 54.0.20
  -> @expo/cli 54.0.13
  -> @expo/prebuild-config 54.0.9
  -> peer expo 40.0.1
```

The older Expo ecosystem brings XML, image, HTTP, native and legacy build dependencies. Dependency ancestry is not the physical disk nesting: the observed old Expo instance is at `node_modules/expo`, and old `@expo/plist` under `expo-constants` requires `xmldom ~0.5.0`.

The existing sourcemap contains browser `isomorphic-webcrypto`, `fhirclient`, `fhir-kit-client`, decoder and router sources, but no Expo/xmldom/node-fetch/phin sources. **That build is stale:** 40 of 54 compared application sources differ from current source. It cannot prove current release/deployed reachability or justify blanket "unused dead code" dismissals. A fresh candidate release must be inspected separately.

### 5.3 Advisory groups and remediation decisions

| Group | Evidence / advisory | Exposure and recommendation |
|---|---|---|
| Critical legacy Expo | `expo 40.0.1`; [GHSA-wr5g-q49g-548w](https://github.com/advisories/GHSA-wr5g-q49g-548w), affected `<48.0.0` | Requires affected Expo OAuth functionality; not demonstrated in this web SPA. `expo 54.0.20` inherits package-level findings but is outside this specific OAuth range. Remove/upgrade the upstream legacy dependency path rather than treating all Expo versions as directly OAuth-vulnerable. |
| XML parser/serializer | `xmldom 0.5.0`, scoped `@xmldom/xmldom 0.8.13`; [multiple roots](https://github.com/advisories/GHSA-crh6-fp67-6883), [CDATA injection](https://github.com/advisories/GHSA-wh4c-j3r5-mjhp), [fragment injection](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) | XML interpretation/injection and resource exhaustion require relevant untrusted XML paths; no browser exploit or general RCE established. Upgrade/replace the owning XML/Expo packages with maintained compatible dependencies. |
| Router | `react-router-dom/react-router 6.30.4`; [redirect](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2), [backslash bypass](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [SSR hydration](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | Browser redirect risk depends on attacker-controlled navigation. SSR-specific conditions were not found in this client SPA. Resolve to an advisory-cleared supported version and review actual navigation inputs; do not claim `^6.30.0` fixes this installation. |
| PostCSS | Root `8.5.19`, nested `8.4.49`; [source-map incomplete fix](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [file read](https://github.com/advisories/GHSA-6g55-p6wh-862q), [stringify XSS](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Root package is a direct **devDependency** and retains a moderate advisory with range `<=8.5.22`; older nested copy explains aggregate high severity. Not every high advisory applies to root `8.5.19`. Upgrade both owning paths; isolate untrusted CSS/source-map processing. |
| HTTP clients | `node-fetch 1.7.3`, `phin 2.9.3`; [node-fetch header forwarding](https://github.com/advisories/GHSA-r683-j2x4-v87g), [phin redirects](https://github.com/advisories/GHSA-x565-32qp-m3vf) | Requires affected library execution plus credential-bearing redirect requests. Do not conflate these Node/legacy paths with the browser's native fetch. Upgrade/remove owning packages and restrict credential destinations. |
| FHIR query decoder | `fhir-kit-client 1.9.2 -> query-string 7.1.3 -> decode-uri-component 0.2.2`; [decoder DoS](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Decoder is present in the old bundle, but inspected FHIR client calls use `stringify`, not `parse`; attacker-controlled decoding was not demonstrated. npm proposes `fhir-kit-client 2.0.3`, explicitly a major migration requiring API/type/runtime review. |
| Lint/test tools | `@typescript-eslint/* 6.21.0 -> minimatch 9.0.3`; `vitest/@vitest/mocker 4.1.10`; [minimatch ReDoS](https://github.com/advisories/GHSA-23c5-xmqv-rm74), [mocker file read](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Tooling inputs/exposure matter, not a deployed browser service by default. Upgrade compatible ESLint/parser/plugin and Vitest sets, restrict runner exposure and CI permissions. `>=4.1.0` is not a safe Vitest minimum here. |
| Other transitive families | Inventory below: image-size, js-yaml, brace-expansion, browserslist, semver, nanoid, tar, lodash.pick, qs, undici, uuid, XML and parent packages | Includes DoS, prototype pollution, parsing/injection and HTTP handling advisories. Prioritize by actual input/execution boundary; remediate through maintained upstream owners. A parent finding is not necessarily a separate defect in the parent. |

### 5.4 Complete vulnerable-package inventory

These are affected lockfile instances reported by the fresh full audit, not necessarily every installed version of a package. Severity is npm's aggregate, not assessed browser exploitability. `Prod` means also present in the omit-dev audit. `D` means a direct manifest dependency (including devDependencies); all others are transitive.

For every row npm returns `fixAvailable: true`, **except** the three `*` rows for which it proposes the major `fhir-kit-client 2.0.3` migration. `true` is not a tested version recommendation, a guarantee of compatibility, or a guarantee that all findings will disappear.

| Package | Affected locked version(s) | npm severity | Direct | Prod |
|---|---|---|---|---|
| @babel/core | 7.9.0 | low | - | yes |
| @expo/cli | 54.0.13 | high | - | yes |
| @expo/config | 12.0.14, 3.3.43 | high | - | yes |
| @expo/config-plugins | 1.0.33, 54.0.5 | high | - | yes |
| @expo/configure-splash-screen | 0.4.0 | moderate | - | yes |
| @expo/image-utils | 0.3.14 | high | - | yes |
| @expo/metro | 54.1.0 | high | - | yes |
| @expo/metro-config | 54.0.7 | high | - | yes |
| @expo/plist | 0.0.13 | moderate | - | yes |
| @expo/prebuild-config | 54.0.9 | moderate | - | yes |
| @expo/vector-icons | 12.0.5 | high | - | yes |
| @jimp/core | 0.12.1 | moderate | - | yes |
| @jimp/custom | 0.12.1 | moderate | - | yes |
| @typescript-eslint/eslint-plugin | 6.21.0 | high | D | no |
| @typescript-eslint/parser | 6.21.0 | high | D | no |
| @typescript-eslint/type-utils | 6.21.0 | high | - | no |
| @typescript-eslint/typescript-estree | 6.21.0 | high | - | no |
| @typescript-eslint/utils | 6.21.0 | high | - | no |
| @unimodules/react-native-adapter | 5.7.0 | high | - | yes |
| @vitest/mocker | 4.1.10 | moderate | - | no |
| @xmldom/xmldom | 0.8.13 | high | - | yes |
| baseline-browser-mapping | 2.10.43 | moderate | - | yes |
| brace-expansion | 1.1.16, 2.1.2, 5.0.7 | high | - | yes |
| browserslist | 4.28.6 | high | - | yes |
| decode-uri-component * | 0.2.2 | moderate | - | yes |
| expo | 40.0.1, 54.0.20 | critical | - | yes |
| expo-asset | 12.0.13 | moderate | - | yes |
| expo-constants | 18.0.13, 9.3.5 | high | - | yes |
| expo-error-recovery | 1.4.0 | high | - | yes |
| expo-file-system | 9.3.0 | moderate | - | yes |
| expo-font | 8.4.0 | high | - | yes |
| expo-linking | 2.0.1 | moderate | - | yes |
| fbemitter | 2.1.1 | high | - | yes |
| fbjs | 0.8.18, 1.0.0 | high | - | yes |
| fhir-kit-client * | 1.9.2 | moderate | D | yes |
| image-size | 1.2.1 | high | - | yes |
| isomorphic-fetch | 2.2.1 | high | - | yes |
| jimp | 0.12.1 | moderate | - | yes |
| js-yaml | 3.15.0, 4.3.0 | high | - | yes |
| lodash.pick | 4.4.0 | high | - | yes |
| metro | 0.83.2, 0.84.4 | high | - | yes |
| metro-config | 0.83.2, 0.84.4 | high | - | yes |
| metro-transform-worker | 0.83.2, 0.84.4 | high | - | yes |
| minimatch | 9.0.3 | high | - | no |
| nanoid | 3.3.16 | high | - | yes |
| node-fetch | 1.7.3 | high | - | yes |
| phin | 2.9.3 | moderate | - | yes |
| postcss | 8.4.49, 8.5.19 | high | D | yes |
| postcss-selector-parser | 6.1.2 | low | - | no |
| qs | 6.15.3 | moderate | - | yes |
| query-string * | 7.1.3 | moderate | - | yes |
| react-native-web | 0.13.18 | high | - | yes |
| react-router | 6.30.4 | moderate | - | yes |
| react-router-dom | 6.30.4 | moderate | D | yes |
| semver | 7.3.2 | high | - | yes |
| tar | 7.5.20 | high | - | yes |
| undici | 6.27.0 | moderate | - | yes |
| uuid | 3.4.0, 7.0.3 | moderate | - | yes |
| vitest | 4.1.10 | moderate | D | no |
| xcode | 3.0.1 | moderate | - | yes |
| xml2js | 0.4.23 | moderate | - | yes |
| xmldom | 0.5.0 | critical | - | yes |

### 5.5 Deprecations are not automatically vulnerabilities

The reviewed lockfile contains **39 deprecated entries across 31 unique package names**. No new install was performed; the earlier claim of exactly 38 installation warnings is not a freshly reproduced measurement. Repeated warning lines, package instances, unique names and security advisories are different counts.

| Family | Assessment and action |
|---|---|
| Babel proposal plugins / Metro preset | Maintenance debt; proposals have standardized and maintained transform/preset replacements exist. Upgrade owning presets rather than swapping unrelated nested packages blindly. |
| Expo/unimodules/react-native-web/expo-random | Legacy cross-platform ancestry in a browser application. Evaluate a supported web-only dependency path or compatible upstream migration. |
| ESLint 8 / humanwhocodes packages | Unsupported tooling; coordinate ESLint, TypeScript plugin/parser and configuration migration. |
| glob/rimraf/inflight | Unsupported versions and inflight memory-leak warning warrant owner upgrades. A deprecation message alone does not establish remotely triggerable DoS. |
| core-js 1/2 | Unsupported compatibility/performance paths; replace through owners and inspect the actual release bundle. |
| phin, lodash utilities, deep-assign, uuid | Maintenance and some advisory overlap. Upgrade/remove through owners; select browser-compatible replacements. A Node-only helper is not automatically suitable for browser code. |

### 5.6 Corrections to the first report

Do **not** apply the previous overrides or version recommendations as a ready-to-run fix:

1. `react-router-dom 6.30.4`, `postcss 8.5.19`, `vitest 4.1.10` and `vite 7.3.6` are already installed/locked. The earlier lower minimums do not remediate the current findings. Vite itself is not a separate entry in this audit.
2. Published unscoped `xmldom` versions stop at `0.6.0`; `xmldom: "^0.8.10"` does not exist. Scoped `@xmldom/xmldom` is a different package, and several current advisories still affect versions through `0.8.14`. Do not assume a rename or broad semver range is a compatible fix.
3. Blanket major overrides for glob, node-fetch, brace-expansion or other nested packages may break consumers and may still select vulnerable versions. Prefer upstream upgrades; use narrowly scoped overrides only with advisory and compatibility evidence.
4. A Vite alias affects module resolution/bundle contents, not npm's installation graph. `npm dedupe` cannot remove a genuinely required dependency. Do not replace cryptographic/native dependencies with fabricated stubs.
5. Evaluate supported web-only SDK alternatives or optional-dependency omission in isolated CI only after establishing which functionality is needed. Do not promise elimination of all Expo findings or deprecations before resolving and inspecting the resulting graph.
6. Neither `npm audit fix` nor `npm audit fix --force` is a verified non-breaking remediation. Never apply `--force` as a blanket recommendation; review manifest/lock changes and major migrations.
7. Secret-manager injection protects source storage, not a value shipped to the browser. No general RCE or confirmed browser XML/Expo exploit was established.

## 6. Prioritized remediation and acceptance plan

| Priority | Owner | Work | Acceptance evidence |
|---|---|---|---|
| P0: before real PHI exposure | Identity/API owners + frontend | Replace demo auth; establish backend role/tenant/patient enforcement; remove privileged browser keys and rotate genuinely exposed credentials | API negative authorization matrix passes independently of browser state; no privileged shared credentials in public artifacts |
| P0: before insecure Azure deployment | Infrastructure owner | HTTPS-only profiles/hosting/API/SSE and modern TLS; confirm actual hosting product and policies | Authorized live transport/header checks; release profile policy rejects non-loopback HTTP |
| P1 | Frontend + identity owners | Unified logout/principal switching; clear SMART state/client and patient caches; remove sensitive logs | Same-tab cross-user regression coverage and synthetic secret/PHI log checks |
| P1 | Dependency/build owners | Resolve router/decoder and tooling advisories; migrate legacy SDK dependency ancestry; review every affected installed instance | Reviewed manifest/lock diff, fresh full/omit-dev audits, exact candidate bundle inventory and compatibility results |
| P1 | Frontend/API owners | Constrain polling credential destinations and SMART trust/PKCE behavior | Untrusted origin/HTTP polling rejected; unsupported PKCE/invalid state/issuer rejected according to trust policy |
| P2 | Infrastructure/security owners | Actual-host CSP/framing/referrer controls, private maps, CI audit/update policy, backend upload/webhook/AI review | Published artifact/header evidence; owned, time-bound exceptions and follow-up backend assessment |

For a dependency-remediation change, use the existing `npm run build`, `npm run lint` and `npm run test` scripts, adding targeted regression coverage where needed. No source `*.test.*`/`*.spec.*` files were found during this review; the presence of a test script is not evidence of security test coverage. Exercise SMART launch/callback, standalone authentication, FHIR CRUD, role/patient switching, logout, uploads, agent operations and SSE against an authorized test environment.

Record the exact lock hash, audit JSON and production artifact for each candidate release. Select patched versions using the current advisory ranges and owning-package compatibility requirements, not an unbounded "latest" claim. The closure target is no unaccepted exploitable high/critical release risks; remaining dependency findings require documented applicability, compensating controls, an owner and an expiry/review date. A lower audit count alone is not closure.

## 7. Reference guidance

- [npm audit command and remediation semantics](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [Vite environment variables: client exposure](https://vite.dev/guide/env-and-mode)
- [Azure Blob static website limitations and hosting behavior](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website)
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

Advisory links in section 5 identify the primary dependency evidence. The package inventory preserves the complete package-level snapshot; underlying advisories and fix availability are time-sensitive and must be refreshed when implementing remediation.
