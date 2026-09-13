import {
  User,
  UserManager,
  UserManagerSettings,
  WebStorageStateStore,
} from 'oidc-client-ts';

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
    throw new Error('OIDC session expired. Please sign in again.');
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
