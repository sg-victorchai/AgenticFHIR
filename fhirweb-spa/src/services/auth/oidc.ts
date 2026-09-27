import {
  User,
  UserManager,
  UserManagerSettings,
  WebStorageStateStore,
} from 'oidc-client-ts';
import { isSMARTContext } from '../fhir/smartClient';

const origin = window.location.origin;

export const oidcSettings: UserManagerSettings = {
  authority:
    import.meta.env.VITE_OIDC_AUTHORITY ||
    'http://localhost:8180/realms/default',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID || 'fhir4java-web',
  redirect_uri:
    import.meta.env.VITE_OIDC_REDIRECT_URI || `${origin}/smartapp/callback`,
  silent_redirect_uri:
    import.meta.env.VITE_OIDC_SILENT_REDIRECT_URI ||
    `${origin}/smartapp/silent-renew`,
  post_logout_redirect_uri:
    import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ||
    `${origin}/smartapp/login`,
  scope: import.meta.env.VITE_OIDC_SCOPE || 'openid profile email',
  response_type: 'code',
  automaticSilentRenew: true,
  loadUserInfo: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
};

export const oidcUserManager = new UserManager(oidcSettings);

export const getOidcUser = (): Promise<User | null> =>
  oidcUserManager.getUser();

const isAccessTokenExpired = (accessToken: string): boolean => {
  try {
    const payload = accessToken.split('.')[1];
    const claims = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return !claims.exp || claims.exp <= Math.floor(Date.now() / 1000) + 30;
  } catch {
    return true;
  }
};

// Guards against redirecting more than once when several requests hit an
// invalid session around the same time.
let isRedirectingToLogin = false;

// Routes that are public and already show/handle sign-in; redirecting to
// login while already on one of these would just reload it in a loop.
const PUBLIC_AUTH_PATHS = ['/login', '/callback', '/silent-renew', '/launch'];

const isOnPublicAuthRoute = (): boolean =>
  PUBLIC_AUTH_PATHS.some((path) => window.location.pathname.endsWith(path));

const forceReauthentication = () => {
  if (isRedirectingToLogin || isOnPublicAuthRoute()) return;
  isRedirectingToLogin = true;
  window.location.assign(
    oidcSettings.post_logout_redirect_uri || `${origin}/smartapp/login`,
  );
};

export const getAuthenticatedHeaders = async (
  headers: Record<string, string> = {},
): Promise<Record<string, string>> => {
  let user = await oidcUserManager.getUser();

  if (user && (user.expired || isAccessTokenExpired(user.access_token))) {
    try {
      user = await oidcUserManager.signinSilent();
    } catch (error) {
      console.warn('Unable to silently renew the OIDC session:', error);
      await oidcUserManager.removeUser();
      forceReauthentication();
      throw new Error('OIDC session expired. Please sign in again.');
    }
  }

  if (user && !user.expired) {
    const authenticatedHeaders = { ...headers };
    delete authenticatedHeaders['x-api-key'];
    return {
      ...authenticatedHeaders,
      Authorization: `Bearer ${user.access_token}`,
    };
  }

  if (user?.expired) {
    await oidcUserManager.removeUser();
    forceReauthentication();
    throw new Error('OIDC session expired. Please sign in again.');
  }

  // No OIDC user at all. A SMART on FHIR EHR launch authenticates through
  // its own SMART token and never creates one, so only force re-login
  // outside of that context.
  if (!isSMARTContext()) {
    forceReauthentication();
    throw new Error('Not signed in. Redirecting to login.');
  }

  return headers;
};

export const signIn = () => oidcUserManager.signinRedirect();

export const signOut = () => oidcUserManager.signoutRedirect();

export const getOidcUserName = (user: User): string =>
  String(
    user.profile.name ||
      user.profile.preferred_username ||
      user.profile.email ||
      'User',
  );

// Identity providers may expose the FHIR patient reference as `fhirUser` or
// `patient`; both claims are issued by the supported local/Azure realms.
export const getUserFhirUserReference = (user: User | null): string | null => {
  const profile = user?.profile as
    | { fhirUser?: string; patient?: string }
    | undefined;
  let tokenPatient: string | undefined;
  try {
    const payload = user?.access_token?.split('.')[1];
    if (payload) {
      const claims = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { patient?: string };
      tokenPatient = claims.patient;
    }
  } catch {
    tokenPatient = undefined;
  }

  const reference = profile?.fhirUser || profile?.patient || tokenPatient;
  if (!reference) return null;
  return reference.includes('/') ? reference : `Patient/${reference}`;
};

// True when the signed-in user's own FHIR identity is a Patient resource.
export const isPatientFhirUser = (user: User | null): boolean =>
  getUserFhirUserReference(user)?.startsWith('Patient/') ?? false;

// The caller's own FHIR Patient id, resolved from the `fhirUser` claim.
export const getOwnPatientFhirId = (user: User | null): string | null => {
  const fhirUser = getUserFhirUserReference(user);
  return fhirUser?.startsWith('Patient/') ? fhirUser.split('/')[1] : null;
};
