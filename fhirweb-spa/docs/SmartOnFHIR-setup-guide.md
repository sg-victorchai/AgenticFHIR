# SMART on FHIR — Setup and Web App Integration Guide

## Overview

This guide covers:

1. **Backend setup** — enabling SMART on FHIR authentication, provisioning roles and users
2. **First-party web app integration** — how a React/SPA connects to the secured backend

The stack uses **Keycloak 25** as the authorization server and **fhir4java** as the FHIR resource server.

---

## Architecture: Two Independent Systems

Understanding the split between Keycloak and fhir4java is essential before provisioning anything.

### Roles

| System        | Where                                     | Purpose                                                                                                      |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **fhir4java** | `fhir.rbac_role` + `fhir.rbac_role_scope` | **Authoritative** — defines what SMART scopes a role grants; enforced on every FHIR request                  |
| **Keycloak**  | Realm roles                               | **Cosmetic only** — appear as `realm_access.roles` in the JWT; fhir4java never reads them for access control |

fhir4java determines what a user can access from its own `fhir.rbac_user_role` assignment table, not from Keycloak realm roles. You do not need to create matching Keycloak realm roles for access control to work. The provisioning script creates them as optional UI badges (e.g. so the frontend can display "Clinician").

### Users

| System        | Where                | Purpose                                                                                                            |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Keycloak**  | Keycloak user store  | **Authentication** — issues JWTs; without this the user cannot log in                                              |
| **fhir4java** | `fhir.fhir_app_user` | **Identity anchor** — links the JWT subject to RBAC role grants, ABAC attributes, audit trail, and patient FHIR id |

Neither system automatically creates a record in the other. Creating a Keycloak user does not create a `fhir_app_user` row, and vice versa. Both must be provisioned. The `scripts/smartonfhir-provision.sh` script handles both in one command.

### Patient Identity

For patient-role users, the Keycloak `patient_id` user attribute is mapped to a `launch` claim in the JWT. fhir4java reads this claim at login time and persists the value in `fhir_app_user.patient_fhir_id` (added by migration V127), so downstream services can resolve patient identity from the database without requiring a live token.

---

## Part 1 — Enabling SMART on FHIR on the Backend

### 1.1 Feature Flags

In `fhir4java-server/src/main/resources/application.yml`:

```yaml
fhir4java:
  security:
    oauth2:
      enabled: true # validates Bearer JWT on every protected endpoint
      multi-issuer:
        enabled: true # accept tokens from Keycloak AND Azure Entra simultaneously

  smartapp:
    enabled: true # exposes /.well-known/smart-configuration discovery endpoint
```

Set `oauth2.enabled: false` only during local development without an identity provider.

### 1.2 Keycloak Connection

| Env var                    | Purpose                                                | Dev default                                                         |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `OAUTH2_ISSUER_URI`        | JWT issuer claim validation                            | `http://localhost:8180/realms/default`                              |
| `OAUTH2_PUBLIC_ISSUER_URI` | Expected `iss` in browser-issued JWTs (see note below) | `http://localhost:8180/realms/default`                              |
| `KEYCLOAK_ISSUER_URI`      | SMART discovery document `issuer`                      | `http://keycloak:8080/realms/default`                               |
| `KEYCLOAK_AUTH_ENDPOINT`   | Authorization endpoint                                 | `http://keycloak:8080/realms/default/protocol/openid-connect/auth`  |
| `KEYCLOAK_TOKEN_ENDPOINT`  | Token endpoint                                         | `http://keycloak:8080/realms/default/protocol/openid-connect/token` |
| `KEYCLOAK_JWK_SET_URI`     | Public keys for JWT verification                       | `http://keycloak:8080/realms/default/protocol/openid-connect/certs` |

For local Docker Compose development these are pre-configured; no extra env vars needed.

#### Docker hostname split — why `OAUTH2_PUBLIC_ISSUER_URI` exists

In Docker Compose, there is an unavoidable hostname split:

| Who talks to Keycloak    | URL used                                          | Keycloak returns as `iss`              |
| ------------------------ | ------------------------------------------------- | -------------------------------------- |
| FHIR backend (JWK fetch) | `http://keycloak:8080` (internal Docker hostname) | `http://keycloak:8080/realms/default`  |
| Browser (token endpoint) | `http://localhost:8180` (host-mapped port)        | `http://localhost:8180/realms/default` |

Keycloak's `start-dev` mode dynamically derives its hostname from each incoming HTTP request. This means the OIDC discovery document returns a different `issuer` value depending on who fetches it — the backend always gets the internal Docker hostname, while browser-issued JWTs always carry the external `localhost:8180` URL. These never match, producing a `401 Issuer mismatch` on every token validation.

**`KC_HOSTNAME_URL` does not fix this** in `start-dev` mode — the env var is ignored in favour of dynamic resolution.

**The fix**: `fhir4java.security.oauth2.public-issuer-uri` (env: `OAUTH2_PUBLIC_ISSUER_URI`) tells `TenantAwareJwtValidator` which issuer to expect in incoming JWTs, decoupled from the URL used to fetch JWKs. The docker profile sets this to `http://localhost:8180/realms/default` by default.

```yaml
# application-docker.yml (applied automatically by the docker profile)
fhir4java:
  security:
    oauth2:
      public-issuer-uri: ${OAUTH2_PUBLIC_ISSUER_URI:http://localhost:8180/realms/default}
```

Override `OAUTH2_PUBLIC_ISSUER_URI` when running behind a reverse proxy or on a remote host where the public Keycloak URL differs from `localhost:8180`.

### 1.3 Starting Keycloak (local dev)

```bash
docker compose up -d
```

Keycloak starts on **port 8180** and auto-imports the realm from `docker/keycloak/realm-export.json`.

The imported realm (`default`) includes:

- Protocol mappers that inject `scope` and `launch` context claims into access tokens
- Three OAuth2 clients (see table below)
- Two sample users (`alice-patient`, `dr-bob`)

Admin console: `http://localhost:8180` — login `admin` / `admin`

#### Keycloak Clients

| Client ID               | Type       | Flow                           | Purpose                                                    |
| ----------------------- | ---------- | ------------------------------ | ---------------------------------------------------------- |
| `fhir4java-web`         | **Public** | Authorization Code + PKCE      | First-party web app (SPA)                                  |
| `diabetes-dashboard`    | Public     | Authorization Code + PKCE only | Sample third-party SMART app — **no Direct Access Grants** |
| `fhir4java-provisioner` | Public     | Direct Access Grants (ROPC)    | Dev/admin CLI use only — not for end-user apps             |

> **Why `fhir4java-web` must be Public (not Confidential):** Browser-based SPAs cannot securely store a client secret — it would be visible in the JavaScript bundle. A confidential client requires the frontend to present `client_secret` when exchanging the auth code for tokens; Keycloak rejects the exchange with `invalid_client_credentials` if the secret is missing or wrong. Public client + PKCE replaces the secret: the `code_verifier`/`code_challenge` pair proves the token request came from the same browser session that initiated the login.

> **Why `diabetes-dashboard` cannot be used for ROPC:** It is a sample SMART app with `directAccessGrantsEnabled: false`. If the provisioning script (or any CLI) tries to use it with `grant_type=password`, Keycloak returns `"Client not allowed for direct access grants"`. The dedicated `fhir4java-provisioner` client exists for that purpose, though the provisioning script no longer uses ROPC at all — it pre-provisions users directly via the admin API.

#### Disabling the Verify Profile Required Action

Keycloak enables **Verify Profile** as a default required action for new realms. For pre-provisioned users this causes an unexpected profile-update redirect after the first login. It is disabled in the realm export:

```json
"requiredActions": [
  { "alias": "VERIFY_PROFILE", "defaultAction": false, ... }
]
```

And cleared on each seed user with `"requiredActions": []`. If you are working against an already-running Keycloak instance (the realm export is only applied on first start), disable it manually:

1. Admin console → **Authentication** → **Required actions** tab
2. **Verify Profile** → toggle **Set as default action** to **OFF** → Save
3. For any user already stuck in the redirect: **Users** → select user → **Details** → remove `Verify Profile` from **Required user actions** → Save

### 1.4 SMART Discovery Endpoint

```
GET /.well-known/smart-configuration
```

Returns (no auth required):

```json
{
  "issuer": "http://keycloak:8080/realms/default",
  "authorization_endpoint": "http://keycloak:8080/realms/default/protocol/openid-connect/auth",
  "token_endpoint": "http://keycloak:8080/realms/default/protocol/openid-connect/token",
  "jwks_uri": "http://keycloak:8080/realms/default/protocol/openid-connect/certs",
  "scopes_supported": [
    "openid",
    "profile",
    "email",
    "fhirUser",
    "patient/Patient.read",
    "patient/Observation.read",
    "user/Patient.*",
    "user/Observation.*",
    "system/*.*",
    "launch/patient",
    "launch/encounter"
  ],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "capabilities": [
    "launch-standalone",
    "launch-ehr",
    "client-public",
    "client-confidential-symmetric",
    "sso-openid-connect",
    "context-ehr-patient",
    "context-ehr-encounter",
    "permission-patient",
    "permission-user",
    "permission-v1",
    "permission-v2"
  ]
}
```

### 1.5 Built-in Roles and Their SMART Scopes

Seeded by Flyway migration V126. Present in every new deployment, **no Keycloak configuration required** for them to work:

| Role code   | SMART scopes                                                         | Intended user            |
| ----------- | -------------------------------------------------------------------- | ------------------------ |
| `admin`     | `system/*.*`                                                         | Platform administrator   |
| `clinician` | `user/Patient.*`, `user/Observation.*`                               | Physician / specialist   |
| `nurse`     | `user/Patient.read`, `user/Observation.*`                            | Nursing staff            |
| `patient`   | `patient/Patient.read`, `patient/Observation.read`, `launch/patient` | Patient (portal access)  |
| `auditor`   | `system/*.read`                                                      | Compliance / audit staff |

`psa` and `care-manager` are not seeded — create them via the admin API (section 1.7).

### 1.6 User Provisioning

#### Recommended: pre-provision before first login

Use `POST /api/admin/users` to create the `fhir_app_user` row in advance. This is the correct approach for any organisation-managed setup — users are known before they log in.

```bash
curl -X POST http://localhost:8080/api/admin/users \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "oauthIssuer": "http://localhost:8180/realms/default",
    "oauthSub": "<keycloak-user-uuid>",
    "username": "dr-sarah",
    "email": "sarah@clinic.example.com",
    "displayName": "Sarah Chen"
  }'
```

- `oauthSub` is the Keycloak user UUID (visible in the Keycloak admin console or returned by the admin API after user creation)
- Returns `201` when newly created, `200` when the row already exists (idempotent)
- For patient-role users, include `"patientFhirId": "Patient/abc-123"` — this is persisted in `fhir_app_user.patient_fhir_id` so ABAC and audit can resolve patient identity without a live token

#### Fallback: just-in-time provisioning on first login

If `fhir_app_user` does not exist when a user logs in, `UserProvisioningFilter` creates it automatically from the JWT claims. Subsequent logins update `last_login_at` and sync `patient_fhir_id` if it has changed in Keycloak.

#### JWT claim sources for `patient_fhir_id`

Keycloak maps the `patient_id` user attribute to the `launch` JWT claim (String type). fhir4java reads the following claim locations in order:

1. `launch` claim as a String — `"Patient/abc-123"` (Keycloak default)
2. `launch` claim as an object — `{"patient": "Patient/abc-123"}` (EHR launchers)
3. `patient_id` claim as a list or string (raw attribute fall-through)

### 1.7 Creating Custom Roles

All admin endpoints accept `x-api-key: <key>` or `Authorization: Bearer <admin-jwt>` and optionally `X-Tenant-ID: <tenant>` (defaults to `default`).

**Create PSA role:**

```bash
curl -X POST http://localhost:8080/api/admin/roles \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "psa",
    "name": "Patient Services Associate",
    "description": "Front-desk staff: scheduling, registration, patient communication"
  }'

curl -X PUT http://localhost:8080/api/admin/roles/psa/scopes \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scopes": ["user/Patient.read", "user/Patient.write", "user/Appointment.read", "user/Appointment.write"]}'
```

**Create care-manager role:**

```bash
curl -X POST http://localhost:8080/api/admin/roles \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "care-manager",
    "name": "Care Manager",
    "description": "Coordinates care plans across care team and patient"
  }'

curl -X PUT http://localhost:8080/api/admin/roles/care-manager/scopes \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scopes": ["user/Patient.*", "user/Observation.read", "user/CarePlan.*", "user/CareTeam.*", "user/Goal.*"]}'
```

### 1.8 Provisioning Users End-to-End

The recommended sequence for provisioning a new user:

```
1. Create Keycloak user  →  get Keycloak UUID
2. POST /api/admin/users  →  create fhir_app_user with oauthSub = Keycloak UUID
3. POST /api/admin/users/{id}/roles  →  grant fhir4java RBAC role
```

**Step 1 — Create Keycloak user:**

```bash
KEYCLOAK_ADMIN_TOKEN=$(curl -s -X POST \
  http://localhost:8180/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=admin" \
  | jq -r .access_token)

curl -s -X POST http://localhost:8180/admin/realms/default/users \
  -H "Authorization: Bearer $KEYCLOAK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dr-sarah",
    "email": "sarah@clinic.example.com",
    "firstName": "Sarah", "lastName": "Chen",
    "enabled": true,
    "attributes": {"fhir_scopes": ["user/Patient.* user/Observation.*"]},
    "credentials": [{"type": "password", "value": "changeme123", "temporary": true}]
  }'

# Get the UUID back
KC_UUID=$(curl -s http://localhost:8180/admin/realms/default/users?username=dr-sarah&exact=true \
  -H "Authorization: Bearer $KEYCLOAK_ADMIN_TOKEN" | jq -r '.[0].id')
```

**Step 2 — Pre-provision fhir_app_user:**

```bash
APP_USER_ID=$(curl -s -X POST http://localhost:8080/api/admin/users \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"oauthIssuer\":\"http://localhost:8180/realms/default\",
       \"oauthSub\":\"$KC_UUID\",
       \"username\":\"dr-sarah\",
       \"email\":\"sarah@clinic.example.com\",
       \"displayName\":\"Sarah Chen\"}" \
  | jq -r '.id')
```

**Step 3 — Grant RBAC role:**

```bash
curl -X POST http://localhost:8080/api/admin/users/$APP_USER_ID/roles \
  -H "x-api-key: $FHIR4JAVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"roleCode": "clinician", "grantedBy": "admin"}'
```

**For a patient-role user**, include `patient_id` in the Keycloak attributes and `patientFhirId` in step 2:

```bash
# Keycloak user with patient_id attribute (drives the launch JWT claim)
-d '{"username":"alice","attributes":{"patient_id":["Patient/test-patient-001"],
     "fhir_scopes":["patient/Patient.read patient/Observation.read launch/patient"]},...}'

# fhir_app_user with persisted patientFhirId
-d '{"oauthSub":"...","patientFhirId":"Patient/test-patient-001",...}'
```

#### Using the provisioning script (recommended for dev/demo)

`scripts/smartonfhir-provision.sh` automates all three steps:

```bash
# Create roles first (one-time)
./scripts/smartonfhir-provision.sh create-role \
  --code psa --name "Patient Services Associate" \
  --scopes "user/Patient.read,user/Patient.write,user/Appointment.read"

# Create clinician
./scripts/smartonfhir-provision.sh create-user \
  --username dr-sarah --password 'Str0ngP@ss!' --role clinician \
  --email sarah@clinic.example.com --first-name Sarah --last-name Chen

# Create patient (patient-id required)
./scripts/smartonfhir-provision.sh create-user \
  --username alice --password 'Str0ngP@ss!' --role patient \
  --patient-id Patient/test-patient-001
```

The script handles the Keycloak user creation, `fhir_app_user` pre-provisioning, and role grant in sequence. It is idempotent — safe to re-run.

**Typical team provisioning:**

| User                    | Role           | Patient id          |
| ----------------------- | -------------- | ------------------- |
| Dr. Sarah Chen          | `clinician`    | —                   |
| Nurse Mike Torres       | `nurse`        | —                   |
| Alice Smith             | `patient`      | `Patient/alice-001` |
| Janet Park (front desk) | `psa`          | —                   |
| David Lee               | `care-manager` | —                   |

### 1.9 Protected Endpoints Summary

| Path pattern       | Auth required                   | Notes                       |
| ------------------ | ------------------------------- | --------------------------- |
| `/.well-known/**`  | No                              | SMART discovery, public     |
| `/fhir/metadata`   | No                              | CapabilityStatement, public |
| `/actuator/health` | No                              | Health probe, public        |
| `/fhir/**`         | Yes — Bearer JWT or `x-api-key` | All FHIR CRUD               |
| `/api/mcp/**`      | Yes — Bearer JWT or `x-api-key` | MCP tools                   |
| `/api/admin/**`    | Yes — Bearer JWT or `x-api-key` | Admin APIs                  |

---

## Part 2 — First-Party Web App Integration

### 2.1 OAuth2 Client (`fhir4java-web`)

Pre-configured in the realm export:

| Setting         | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Client ID       | `fhir4java-web`                                                                      |
| Access type     | **Public** (no client secret)                                                        |
| PKCE            | `S256` (required)                                                                    |
| Flow            | Authorization Code + PKCE                                                            |
| Redirect URIs   | `http://localhost:3000/*`, `http://127.0.0.1:3000/*`, `https://app.yourdomain.com/*` |
| Default scopes  | `openid`, `profile`, `email`                                                         |
| Optional scopes | `user/*.*`                                                                           |

Both `localhost` and `127.0.0.1` are registered as redirect origins because browsers and OS configurations differ: some environments resolve the loopback address as `127.0.0.1` even when the app URL shows `localhost`. Keycloak performs an exact string match on the redirect URI — a mismatch returns `invalid_redirect_uri` and the login fails silently in the browser.

> **No client secret needed.** The PKCE `code_verifier`/`code_challenge` pair protects the token exchange. Any attempt to send a `client_secret` in the token request will cause Keycloak to reject the exchange with `invalid_client_credentials`.

### 2.2 Authentication Flow

```
Browser                    Keycloak                    FHIR Backend
   |                           |                            |
   |-- 1. GET /authorize ------>|                            |
   |   (PKCE code_challenge)    |                            |
   |                           |                            |
   |<- 2. Login page -----------|                            |
   |-- 3. POST credentials ---->|                            |
   |<- 4. 302 /callback?code=X -|                            |
   |-- 5. POST /token --------->|                            |
   |   (code + code_verifier)   |                            |
   |<- 6. access_token + -------|                            |
   |   refresh_token            |                            |
   |                           |                            |
   |-- 7. GET /fhir/Patient ----------------------->         |
   |   Authorization: Bearer <token>               |
   |                           |         validate JWT (JWKS) |
   |                           |         sync fhir_app_user  |
   |                           |         check RBAC scopes   |
   |<- 8. 200 Patient Bundle <----------------------         |
```

Step 7 onward: if the `fhir_app_user` row was pre-provisioned (recommended), the filter just updates `last_login_at`. If it was not pre-provisioned, it is JIT-created on this first request.

### 2.3 Recommended Library

```bash
npm install oidc-client-ts react-oidc-context
```

### 2.4 OIDC Configuration

```typescript
// src/auth/oidcConfig.ts
import { UserManagerSettings } from 'oidc-client-ts';

export const oidcConfig: UserManagerSettings = {
  authority: 'http://localhost:8180/realms/default',
  client_id: 'fhir4java-web',
  // Must exactly match one of the Redirect URIs registered in Keycloak.
  // Use the same origin the browser is actually using — localhost and 127.0.0.1
  // are treated as different strings by Keycloak even though they resolve identically.
  redirect_uri: `${window.location.origin}/smartapp/callback`,
  post_logout_redirect_uri: window.location.origin,
  scope: 'openid profile email user/Patient.* user/Observation.*',
  response_type: 'code',
  code_challenge_method: 'S256', // PKCE — no client_secret needed or sent
  automaticSilentRenew: true,
  loadUserInfo: true,
};
```

Using `window.location.origin` for `redirect_uri` ensures the callback URL always matches whatever origin the browser is using (`localhost` or `127.0.0.1`), as long as both are registered in Keycloak. Replace `authority` and the static `window.location.origin` fallback with production values.

### 2.5 Auth Provider (React)

```tsx
// src/main.tsx
import { AuthProvider } from 'react-oidc-context';
import { oidcConfig } from './auth/oidcConfig';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider {...oidcConfig}>
    <App />
  </AuthProvider>,
);
```

### 2.6 OAuth Callback Component — Preventing Double Token Exchange

OIDC authorization codes are **single-use**: Keycloak invalidates the code the moment it is first submitted to the token endpoint, regardless of whether the exchange succeeds. Submitting the same code a second time produces:

```
Code 'xxx' already used for userSession 'yyy'
CODE_TO_TOKEN_ERROR: invalid_code
```

**Root cause — React 18 StrictMode double-invocation.** In development, React StrictMode intentionally mounts → unmounts → remounts every component to surface impure effects. A `useEffect` with no guard fires twice on the initial render. If the code exchange is inside that effect, it runs twice against the same code.

**Fix — ref guard in the callback component:**

```tsx
// src/pages/SmartAppCallback.tsx
import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';

export function SmartAppCallback() {
  const auth = useAuth();
  const navigate = useNavigate();
  const exchangeStarted = useRef(false); // survives StrictMode remount

  useEffect(() => {
    // Guard: run the exchange exactly once regardless of StrictMode double-invoke
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    auth
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((err) => {
        console.error('Token exchange failed', err);
        navigate('/login', { replace: true });
      });
  }, []); // empty deps — run once per mount cycle

  return <div>Completing sign-in…</div>;
}
```

**Alternative — remove the code from the URL before any async work:**

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  // Remove the code from the URL immediately so a StrictMode remount
  // sees no code and skips the exchange.
  window.history.replaceState({}, '', window.location.pathname);

  auth.signinRedirectCallback().then(() => navigate('/', { replace: true }));
}, []);
```

> If you are using `react-oidc-context`'s built-in callback handling via `<AuthProvider>` + `onSigninCallback`, verify that the library itself is not re-triggering the exchange on remount — `oidc-client-ts` v3+ includes its own guard, but older versions may not.

### 2.7 Protecting Routes

```tsx
import { useAuth } from 'react-oidc-context';

function App() {
  const auth = useAuth();
  if (auth.isLoading) return <div>Loading...</div>;
  if (!auth.isAuthenticated) {
    return <button onClick={() => auth.signinRedirect()}>Log in</button>;
  }
  return <Dashboard />;
}
```

### 2.8 Calling the FHIR Backend

```typescript
// src/api/fhirClient.ts
import { useAuth } from 'react-oidc-context';

export function useFhirClient() {
  const auth = useAuth();

  async function get(path: string) {
    const res = await fetch(`http://localhost:8080${path}`, {
      headers: {
        Authorization: `Bearer ${auth.user?.access_token}`,
        Accept: 'application/fhir+json',
      },
    });
    if (!res.ok) throw new Error(`FHIR error ${res.status}`);
    return res.json();
  }

  async function post(path: string, body: object) {
    const res = await fetch(`http://localhost:8080${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.user?.access_token}`,
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`FHIR error ${res.status}`);
    return res.json();
  }

  return { get, post };
}
```

### 2.9 Token Refresh and Logout

#### Token lifespans (local dev defaults)

| Setting                 | Value               | Purpose                                                                                 |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `accessTokenLifespan`   | **1800 s (30 min)** | How long a JWT access token remains valid; FHIR backend rejects expired tokens with 401 |
| `ssoSessionIdleTimeout` | 7200 s (2 h)        | Refresh token expires if no activity                                                    |
| `ssoSessionMaxLifespan` | 36000 s (10 h)      | Absolute session cap                                                                    |

> **Why 30 minutes?** Agent missions (Digital Twin Q&A, care-gap analysis) can run for tens of seconds per LLM call and span many user interactions. Keycloak's 5-minute default causes `Jwt expired` 401s mid-session. 30 minutes covers typical session length while still being short enough to limit exposure from a stolen token.

#### Silent token renewal

`automaticSilentRenew: true` in the OIDC config causes `oidc-client-ts` to request a fresh access token (via a hidden iframe) about one minute before expiry. This requires a silent-callback route:

```typescript
// src/auth/oidcConfig.ts — add silent_redirect_uri
export const oidcConfig: UserManagerSettings = {
  authority: 'http://localhost:8180/realms/default',
  client_id: 'fhir4java-web',
  redirect_uri: `${window.location.origin}/smartapp/callback`,
  silent_redirect_uri: `${window.location.origin}/smartapp/silent-callback`, // ← add this
  post_logout_redirect_uri: window.location.origin,
  scope: 'openid profile email user/Patient.* user/Observation.*',
  response_type: 'code',
  code_challenge_method: 'S256',
  automaticSilentRenew: true,
  loadUserInfo: true,
};
```

Create the silent callback page (loaded inside the hidden iframe — must run the oidc-client-ts callback handler and nothing else):

```tsx
// src/pages/SmartAppSilentCallback.tsx
import { useEffect } from 'react';
import { UserManager } from 'oidc-client-ts';
import { oidcConfig } from '../auth/oidcConfig';

export function SmartAppSilentCallback() {
  useEffect(() => {
    new UserManager(oidcConfig).signinSilentCallback();
  }, []);
  return null;
}
```

Register the route in your router:

```tsx
<Route path="/smartapp/silent-callback" element={<SmartAppSilentCallback />} />
```

Add `http://localhost:3000/smartapp/silent-callback` and `http://127.0.0.1:3000/smartapp/silent-callback` to the Keycloak client's **Valid redirect URIs**.

#### Handling 401 token-expired in API calls

Even with silent renew enabled, a token can expire between the renewal attempt and the API call (e.g. tab was in the background). Add a retry on 401:

```typescript
// src/api/fhirClient.ts
export function useFhirClient() {
  const auth = useAuth();

  async function callApi(
    path: string,
    options: RequestInit,
  ): Promise<Response> {
    let res = await fetch(`http://localhost:8080${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${auth.user?.access_token}`,
      },
    });

    // On 401, attempt a silent token refresh and retry once
    if (res.status === 401) {
      try {
        await auth.signinSilent();
        res = await fetch(`http://localhost:8080${path}`, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${auth.user?.access_token}`,
          },
        });
      } catch {
        auth.signinRedirect(); // Refresh failed — restart full login
      }
    }
    return res;
  }

  // ... get() / post() use callApi()
}
```

#### Logout

```tsx
<button onClick={() => auth.signoutRedirect()}>Log out</button>
```

Redirects to Keycloak's logout endpoint, clears the SSO session, then returns to `post_logout_redirect_uri`.

### 2.10 Role-Based UI

```typescript
// Keycloak realm roles appear in the JWT as realm_access.roles
function getUserRoles(auth: AuthContextProps): string[] {
  return (auth.user?.profile as any)?.realm_access?.roles ?? [];
}

const roles = getUserRoles(auth);
const isClinician = roles.includes('clinician');
const isPatient = roles.includes('patient');
```

These Keycloak realm roles are **for UI presentation only**. Server-side access control is enforced by fhir4java's RBAC engine using the SMART scopes in the token — not the realm role list.

---

## Part 3 — Environment Summary

### Local Development

| Service      | URL                     | Notes                    |
| ------------ | ----------------------- | ------------------------ |
| FHIR backend | `http://localhost:8080` | Spring Boot              |
| Keycloak     | `http://localhost:8180` | Admin: `admin` / `admin` |
| Web app      | `http://localhost:3000` | React dev server         |

CORS is enabled (`fhir4java.security.cors.enabled: true`) for local dev. Disable in production — handled by the API gateway.

### Production Checklist

| Concern                        | Recommendation                                                                |
| ------------------------------ | ----------------------------------------------------------------------------- |
| CORS                           | Disable app-level CORS; configure at AWS API Gateway / Azure APIM             |
| Keycloak                       | Deploy to dedicated VM or Keycloak Operator on Kubernetes                     |
| Token lifespan                 | Dev: access 30 min, session 10 h. Prod: access 5 min + `automaticSilentRenew` |
| HTTPS                          | Enforce SSL at load balancer                                                  |
| Client secrets                 | AWS Secrets Manager / Azure Key Vault; inject via env vars                    |
| `fhir4java-provisioner` client | Disable or restrict to internal network in production                         |

### Key Config Properties

```yaml
fhir4java:
  security:
    oauth2:
      enabled: true # master switch for JWT auth
      # Expected iss claim in browser-issued JWTs. Must be the public-facing Keycloak URL.
      # Required in Docker Compose because start-dev returns different iss values depending
      # on the calling hostname (internal keycloak:8080 vs external localhost:8180).
      public-issuer-uri: http://localhost:8180/realms/default
    cors:
      enabled: true # true for local dev, false for production
      allowed-origins:
        - http://localhost:3000
  smartapp:
    enabled: true # exposes /.well-known/smart-configuration
    registration:
      require-approval: true # third-party apps need admin approval
```

### Migration Reference

| Migration | What it adds                                                                        |
| --------- | ----------------------------------------------------------------------------------- |
| V125      | `fhir.fhir_app_user` table — JIT provisioning, authorship columns                   |
| V126      | RBAC/ABAC tables — roles, scopes, user-role assignments, audit history              |
| V127      | `fhir_app_user.patient_fhir_id` — persisted patient binding from `launch` JWT claim |
