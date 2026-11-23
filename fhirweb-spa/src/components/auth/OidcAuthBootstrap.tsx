import React, { useEffect } from 'react';
import { User } from 'oidc-client-ts';
import { useDispatch } from 'react-redux';
import {
  loginFailure,
  loginStart,
  loginSuccess,
} from '../../store/slices/authSlice';
import { getOidcUserName, oidcUserManager } from '../../services/auth/oidc';
import SessionTimeoutManager from './SessionTimeoutManager';

const OidcAuthBootstrap: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const dispatch = useDispatch();

  useEffect(() => {
    let mounted = true;
    dispatch(loginStart());

    const syncUser = async () => {
      try {
        const user = await oidcUserManager.getUser();
        if (!mounted) return;
        if (user && !user.expired) {
          dispatch(
            loginSuccess({
              token: user.access_token,
              user: {
                id: user.profile.sub,
                name: getOidcUserName(user),
              },
            }),
          );
        } else {
          dispatch(loginFailure('Not authenticated'));
        }
      } catch (error) {
        console.error('OIDC session initialization failed:', error);
        if (mounted)
          dispatch(loginFailure('Unable to restore sign-in session'));
      }
    };

    void syncUser();

    const handleUserLoaded = (user: User) => {
      if (!mounted) return;
      dispatch(
        loginSuccess({
          token: user.access_token,
          user: {
            id: user.profile.sub,
            name: getOidcUserName(user),
          },
        }),
      );
    };
    const handleUserUnloaded = () => {
      if (mounted) dispatch(loginFailure('Not authenticated'));
    };
    const forceLogout = () => {
      void oidcUserManager.removeUser();
      if (mounted) {
        dispatch(loginFailure('Session expired. Please sign in again.'));
        window.location.assign('/smartapp/login');
      }
    };
    // Inactivity sign-out is handled by SessionTimeoutManager. A token expiry
    // or a failed background renewal while the user is active should retry
    // renewal and only sign out if the identity provider session is gone.
    let renewing = false;
    const retryRenewal = async () => {
      if (renewing) return;
      renewing = true;
      try {
        await oidcUserManager.signinSilent();
      } catch (error) {
        console.error('OIDC session renewal failed:', error);
        forceLogout();
      } finally {
        renewing = false;
      }
    };
    const handleTokenExpired = () => {
      void retryRenewal();
    };
    const handleSilentRenewError = (error: Error) => {
      console.warn('OIDC background renewal failed, retrying:', error);
      void retryRenewal();
    };

    oidcUserManager.events.addUserLoaded(handleUserLoaded);
    oidcUserManager.events.addUserUnloaded(handleUserUnloaded);
    oidcUserManager.events.addUserSignedOut(handleUserUnloaded);
    oidcUserManager.events.addAccessTokenExpired(handleTokenExpired);
    oidcUserManager.events.addSilentRenewError(handleSilentRenewError);

    return () => {
      mounted = false;
      oidcUserManager.events.removeUserLoaded(handleUserLoaded);
      oidcUserManager.events.removeUserUnloaded(handleUserUnloaded);
      oidcUserManager.events.removeUserSignedOut(handleUserUnloaded);
      oidcUserManager.events.removeAccessTokenExpired(handleTokenExpired);
      oidcUserManager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, [dispatch]);

  return (
    <>
      {children}
      <SessionTimeoutManager />
    </>
  );
};

export default OidcAuthBootstrap;
