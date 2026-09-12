# Security Findings and Recommendation Assessment Report
## Application: `fhirweb-spa` (FHIR Single Page Application)

**Date**: September 12, 2026  
**Target Repository**: `AgenticFHIR/fhirweb-spa`  
**Assessment Tool**: `npm audit` & Manual Dependency Analysis  
**Branch**: `feature/smart-on-fhir`  

---

## 1. Executive Summary

A comprehensive security dependency audit and static architecture assessment were conducted on the **`fhirweb-spa`** frontend application. 

The initial dependency audit identified **76 total package vulnerabilities**:
- **Critical**: 2
- **High**: 43
- **Moderate**: 24
- **Low**: 7

Key findings reveal that the most severe vulnerabilities and deprecated package warnings originate from **deeply nested indirect dependencies** pulled in by `@expo/cli` and legacy `@expo` packages, which are brought in transitively through `fhirclient` -> `isomorphic-webcrypto` -> `expo-random` -> `expo@54.0.20` -> `@expo/prebuild-config` -> legacy `expo@40.0.1`.

In addition, several direct runtime dependencies (`postcss`, `react-router-dom`, `fhir-kit-client`) and key dev dependencies (`vitest`, `@typescript-eslint/eslint-plugin`) require updates to resolve active High and Moderate security advisories.

This report summarizes all security findings, categorizes them by severity and source, evaluates the operational risk to `fhirweb-spa`, and provides detailed, prioritized remediation recommendations.

---

## 2. Vulnerability Breakdown & Categorization

Below is the summary breakdown of vulnerabilities identified in the dependency tree:

| Severity | Count | Primary Impact Areas | Key Affected Component/Package |
| :--- | :---: | :--- | :--- |
| **Critical** | 2 | XML Injection, OAuth Vulnerability, RCE/DoS | `xmldom`, `expo` (legacy transitives) |
| **High** | 43 | Prototype Pollution, ReDoS, Path Traversal, Header Leakage | `postcss`, `browserslist`, `@typescript-eslint`, `minimatch`, `node-fetch`, `lodash.pick`, `image-size`, `brace-expansion`, `js-yaml` |
| **Moderate** | 24 | Open Redirect, SSR Hydration Injection, Desync, DoS | `react-router-dom` / `react-router`, `undici`, `qs`, `phin`, `uuid`, `vitest` |
| **Low** | 7 | File Read via Source Map Comments, AST Recursion | `@babel/core`, `postcss-selector-parser` |
| **Total** | **76** | | |

---

## 3. Detailed Analysis of Findings

### 3.1 Critical Findings (Severity: CRITICAL)

#### 1. `xmldom` (and `@xmldom/xmldom` legacy instances)
- **Advisories**: Multiple advisories including GHSA-crh6-fp67-6883, GHSA-wh4c-j3r5-mjhp, GHSA-6gmq-8vp8-gcm6, GHSA-w2rr-34g9-rvrj, GHSA-4w3w-2rp5-g8jm.
- **Vulnerability**: XML node/fragment injection via unvalidated CDATA, processing instructions, and attributes, plus quadratic-time/memory DoS during malformed XML parsing.
- **Dependency Path**: Transitive via `@expo/plist` -> `xmldom@0.5.0` (in legacy `@expo/prebuild-config` -> `expo@40.0.1`).
- **Risk Level**: **Critical**. Unsanitized XML parsing could lead to XML injection attacks or client-side denial of service if malformed XML is parsed.

#### 2. Legacy `expo` OAuth Vulnerability
- **Advisory**: GHSA-wr5g-q49g-548w
- **Vulnerability**: Expo SDK OAuth flow vulnerability in older Expo versions (`expo@40.0.1` nested inside `@expo/prebuild-config`).
- **Dependency Path**: `fhirclient` -> `isomorphic-webcrypto` -> `expo-random` -> `expo` -> `@expo/cli` -> `@expo/prebuild-config` -> `expo@40.0.1`.
- **Risk Level**: **Critical** (in mobile/Expo apps; Low in `fhirweb-spa` browser environment, but poses audit compliance risk).

---

### 3.2 High Severity Findings (Severity: HIGH)

#### 1. `postcss` (Direct DevDependency: `^8.4.32`)
- **Advisories**: GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849.
- **Vulnerability**: XSS via unescaped `</style>` in CSS Stringify Output; Arbitrary File Read & Path Traversal via attacker-controlled `sourceMappingURL` in CSS comments.
- **Risk Level**: **High**. Impact during CSS build/compilation step.

#### 2. `@typescript-eslint/eslint-plugin` & `@typescript-eslint/parser` (Direct DevDependencies: `^6.10.0`)
- **Advisories**: GHSA-23c5-xmqv-rm74, GHSA-7r86-cg39-jmmj, GHSA-3ppc-4f35-3m26 (via transitive `minimatch`).
- **Vulnerability**: Regular Expression Denial of Service (ReDoS) via catastrophic backtracking in `minimatch` wildcard patterns.
- **Risk Level**: **High** for developer environment and CI build pipeline execution.

#### 3. `browserslist`
- **Advisories**: GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g.
- **Vulnerability**: Unbounded memory growth (no cache eviction) leading to DoS/OOM; Uncaught crash/prototype write via untrusted stats.
- **Risk Level**: **High** during Vite bundling and CSS processing.

#### 4. `node-fetch` / `isomorphic-fetch` / `phin`
- **Advisories**: GHSA-r683-j2x4-v87g, GHSA-x565-32qp-m3vf.
- **Vulnerability**: Forwarding secure HTTP headers (e.g. `Authorization` / `x-api-key`) to untrusted third-party sites following HTTP 3xx redirects.
- **Risk Level**: **High** if API calls follow cross-domain redirects while attaching authorization tokens or API keys.

#### 5. `lodash.pick`
- **Advisories**: GHSA-p6mc-m468-83gw.
- **Vulnerability**: Prototype Pollution in legacy standalone lodash utility methods.
- **Dependency Path**: `@expo/vector-icons` -> `lodash.pick`.
- **Risk Level**: **High**.

---

### 3.3 Moderate Severity Findings (Severity: MODERATE)

#### 1. `react-router-dom` / `react-router` (Direct Dependency: `^6.20.1`)
- **Advisories**: GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg, GHSA-jjmj-jmhj-qwj2.
- **Vulnerability**: Open redirect leading to potential Cross-Site Scripting (XSS) via backslashes in `<Link>` or `useNavigate()`; Arbitrary Constructor Injection during SSR hydration.
- **Risk Level**: **Moderate** for client-side SPA navigation.

#### 2. `vitest` (Direct DevDependency: `^4.0.17`)
- **Advisories**: GHSA-82fw-gwwq-j7x9 (via `@vitest/mocker`).
- **Vulnerability**: Path Traversal / Arbitrary File Read via `@vitest/mocker` redirect mock.
- **Risk Level**: **Moderate** (restricted to test runner environment).

#### 3. `undici`
- **Advisories**: GHSA-8xcm-r25x-g524, GHSA-m8rv-5g2x-5cg5, GHSA-v3r7-h72x-cjcm.
- **Vulnerability**: Downstream response desynchronization, CRLF injection, and cookie attribute injection.
- **Risk Level**: **Moderate**.

#### 4. `query-string` / `decode-uri-component`
- **Advisories**: GHSA-vcc3-ghjq-m6fr.
- **Vulnerability**: Denial of Service via exponential decoding of malformed percent-encoded input.
- **Dependency Path**: `fhir-kit-client` -> `query-string` -> `decode-uri-component`.
- **Risk Level**: **Moderate**.

---

## 4. Assessment of Deprecated Packages Warnings

The `npm install` output reported **38 deprecated package warnings**. Analysis shows these fall into 4 distinct groups:

| Deprecated Package | Deprecation Reason / Warning | Source / Context in Project | Impact & Assessment |
| :--- | :--- | :--- | :--- |
| **`@babel/plugin-proposal-*`** (12 plugins) | Merged into ECMAScript standard; replaced by `@babel/plugin-transform-*`. | Transitive dev dependencies from Expo/Metro build chain. | Low. Polyfills/transforms are standard; no runtime risk for modern ES. |
| **`uuid` (v3.4.0, v7.0.3)** | Versions <= 10 unsupported. ESM requires uuid@11+, CJS requires uuid@11. | Transitive dependency via `expo-constants`, `expo-file-system`, `xcode`. | Low runtime risk; API bounds check issue fixed in v10+. |
| **`glob` (v7.1.6, v7.2.3)**, **`rimraf` (v3.0.2)**, **`inflight` (v1.0.6)** | Glob v7/v8 unsupported & contain memory leaks / ReDoS; rimraf v3 unsupported. | Transitive dependency from ESLint v8, file-entry-cache, Expo config plugins. | Moderate DoS risk in build/lint scripts. |
| **`@unimodules/core` & `@unimodules/react-native-adapter`** | Replaced by unified `expo` package infrastructure. | Nested inside legacy `expo@40.0.1` inside `@expo/prebuild-config`. | High technical debt indicator; unused in web bundle. |
| **`core-js` (v1.2.7, v2.6.12)** | Core-js < 3.23.3 unmaintained; V8 feature detection performance slowdown up to 100x. | Nested inside `fbemitter` / `fbjs` transitive chains. | Moderate runtime performance impact if loaded in old polyfill paths. |
| **`phin` (v2.9.3, v3.7.1)** | Package unsupported; header leakage vulnerability in redirects. | Transitive via `jimp` -> `@jimp/core` -> `load-bmfont`. | Low exposure unless processing remote image fonts via HTTP. |
| **`eslint` (v8.57.1)** | ESLint 8 is End-Of-Life (EOL). | Direct DevDependency (`^8.53.0`). | Medium build-tooling maintenance risk. |
| **`react-native-web` (v0.13.18)** | Versions < 0.16.0 no longer supported. | Nested inside legacy `expo@40.0.1` transitive tree. | Dead code path for web-only build. |

---

## 5. Root Cause & Architectural Risk Context

### 5.1 Why is `fhirweb-spa` dragging React Native / Expo dependencies?
`fhirweb-spa` is a **pure React (Vite) Web SPA**. However, `package.json` includes `fhirclient` (`^2.6.3`). 
`fhirclient` imports `isomorphic-webcrypto`, which lists `expo-random` as a fallback dependency for mobile React Native environments. `expo-random` pulls in the entire `expo` framework (`@expo/cli`, `@expo/metro-config`, `@expo/prebuild-config`), bringing in hundreds of legacy mobile React Native dependencies (like `react-native-web@0.13`, `xmldom@0.5.0`, `glob@7`).

Since `fhirweb-spa` runs exclusively in standard web browsers, modern browsers natively support standard Web Crypto API (`window.crypto.subtle`), making the Expo Native bridging libraries **completely unused dead code in browser runtime execution**, yet present in `node_modules` and causing audit noise and potential build-time security risk.

---

## 6. Recommended Action Plan & Remediation Roadmap

### Phase 1: Immediate Remediation (Non-Breaking In-Place Updates)

Execute `npm audit fix` and target updates for direct packages in `fhirweb-spa/package.json`:

1. **Update Direct Runtime Dependencies**:
   - `react-router-dom`: Update to `^6.30.0` or `^7.x` (Fixes Open Redirect & Hydration Injection).
   - `postcss`: Update to `>=8.5.0` (Fixes XSS and `sourceMappingURL` Path Traversal).
   - `vite`: Update to `>=7.3.6` (Ensures safe PostCSS handling).

2. **Update Direct DevDependencies**:
   - `@typescript-eslint/eslint-plugin` & `@typescript-eslint/parser`: Update to `>=7.0.0` or latest `v8.x` (Fixes ReDoS in `minimatch`).
   - `vitest`: Update to `>=4.1.0` (Fixes Path Traversal in `@vitest/mocker`).
   - `tailwindcss` & `autoprefixer`: Ensure clean dependency resolution for `postcss@8.5.x`.

3. **Package Overrides / Resolution (in `package.json`)**:
   Add NPM `overrides` to force resolution of critical transitive vulnerabilities to patched versions:

```json
"overrides": {
  "xmldom": "^0.8.10",
  "@xmldom/xmldom": "^0.8.10",
  "node-fetch": "^2.7.0",
  "glob": "^10.4.5",
  "brace-expansion": "^2.0.1",
  "browserslist": "^4.24.4",
  "qs": "^6.14.0"
}
```

---

### Phase 2: Structural Clean-up (Eliminate Expo Transitive Bloat)

To permanently resolve 50+ vulnerabilities and all 38 deprecation warnings originating from Expo:

1. **Evaluate `fhirclient` Dependency**:
   Replace or configure bundler aliasing for `isomorphic-webcrypto` so Vite bundles standard `crypto.subtle` instead of `expo-random`.
2. **Prune React Native Transitives**:
   Use `npm dedupe` or explicit override stubs in `package.json` to prevent legacy `expo@40` from being installed.

---

### Phase 3: Developer & Operational Security Guidelines

1. **Environment Variables Security**:
   - Ensure production `.env` credentials (such as `VITE_API_KEY`) are managed via secret managers (Azure Key Vault / GitHub Secrets) rather than hardcoded in `.env.azure`.
   - Never commit sensitive production keys to git repositories.

2. **Automated CI Security Scans**:
   - Integrate `npm audit --audit-level=high` in CI pipeline.
   - Configure Dependabot or Renovate for automated vulnerability alerts and minor updates.

---

## 7. Verification Plan

After applying Phase 1 fixes:
1. Run `npm audit` to confirm zero **Critical** or **High** vulnerabilities.
2. Run build verification:
   ```bash
   npm run build
   ```
3. Run test suite:
   ```bash
   npm run test
   ```
4. Perform end-to-end sanity check on SMART-on-FHIR authorization flow and FHIR API integrations.
