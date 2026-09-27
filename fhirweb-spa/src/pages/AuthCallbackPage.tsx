import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginFailure, loginSuccess } from '../store/slices/authSlice';
import { getOidcUserName, oidcUserManager } from '../services/auth/oidc';

let callbackExchangePromise: ReturnType<
  typeof oidcUserManager.signinCallback
> | null = null;

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (callbackExchangePromise) return;

    const callbackUrl = window.location.href;
    const callbackParams = new URL(callbackUrl).searchParams;
    if (!callbackParams.has('code') && !callbackParams.has('error')) return;

    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${window.location.hash}`,
    );

    callbackExchangePromise = oidcUserManager.signinCallback(callbackUrl);
    const completeSignIn = async () => {
      try {
        const user = await callbackExchangePromise;
        if (!user) {
          throw new Error('OIDC callback did not return a user session');
        }
        dispatch(
          loginSuccess({
            token: user.access_token,
            user: {
              id: user.profile.sub,
              name: getOidcUserName(user),
            },
          }),
        );
        navigate('/', { replace: true });
      } catch (callbackError) {
        console.error('OIDC callback failed:', callbackError);
        dispatch(loginFailure('Sign-in failed. Please try again.'));
        if (mounted) setError('Sign-in failed. Please try again.');
      }
    };

    void completeSignIn().finally(() => {
      callbackExchangePromise = null;
    });
    return () => {
      mounted = false;
    };
  }, [dispatch, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
              Return to sign in
            </button>
          </>
        ) : (
          <p className="text-gray-600">Completing sign in…</p>
        )}
      </div>
    </div>
  );
};

export default AuthCallbackPage;
