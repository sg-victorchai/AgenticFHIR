import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { clearRole } from '../../store/slices/uiSlice';
import { oidcUserManager, signOut } from '../../services/auth/oidc';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const WARNING_BEFORE_MS = 60 * 1000;
export const LAST_ACTIVITY_KEY = 'agenticfhir.session.lastActivity';

const CHECK_INTERVAL_MS = 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5000;
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
] as const;

const readLastActivity = (): number => {
  const stored = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
};

const writeLastActivity = (timestamp: number) => {
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
};

/**
 * Sliding-window session: the user is signed out only after IDLE_TIMEOUT_MS
 * without activity. Activity is shared across tabs through localStorage.
 * A warning dialog appears WARNING_BEFORE_MS before the timeout.
 */
const SessionTimeoutManager: React.FC = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [continuing, setContinuing] = useState(false);
  const warningShownRef = useRef(false);
  const lastWriteRef = useRef(0);
  const signingOutRef = useRef(false);

  const recordActivity = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
      return;
    }
    lastWriteRef.current = now;
    writeLastActivity(now);
  }, []);

  const handleSignOut = useCallback(() => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSecondsLeft(null);
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    dispatch(logout());
    dispatch(clearRole());
    void oidcUserManager
      .removeUser()
      .catch(() => undefined)
      .then(() => signOut())
      .catch((error) => {
        console.error('Unable to start OIDC sign-out:', error);
        window.location.assign('/smartapp/login');
      });
  }, [dispatch]);

  const handleContinue = useCallback(async () => {
    setContinuing(true);
    recordActivity(true);
    try {
      // Refresh tokens so the identity provider session is extended too.
      await oidcUserManager.signinSilent();
      warningShownRef.current = false;
      setSecondsLeft(null);
    } catch (error) {
      console.error('Unable to extend the session:', error);
      handleSignOut();
    } finally {
      setContinuing(false);
    }
  }, [handleSignOut, recordActivity]);

  useEffect(() => {
    if (!isAuthenticated) return;
    signingOutRef.current = false;
    warningShownRef.current = false;
    recordActivity(true);

    const onActivity = () => {
      // Once the warning is shown, only the explicit "Continue" action counts.
      if (!warningShownRef.current) recordActivity();
    };

    const check = () => {
      const idleMs = Date.now() - readLastActivity();
      if (idleMs >= IDLE_TIMEOUT_MS) {
        handleSignOut();
        return;
      }
      if (idleMs >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
        warningShownRef.current = true;
        setSecondsLeft(Math.ceil((IDLE_TIMEOUT_MS - idleMs) / 1000));
      } else if (warningShownRef.current) {
        // Another tab extended the session.
        warningShownRef.current = false;
        setSecondsLeft(null);
      }
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      );
      window.clearInterval(interval);
    };
  }, [isAuthenticated, handleSignOut, recordActivity]);

  if (!isAuthenticated || secondsLeft === null) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-message"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2
          id="session-timeout-title"
          className="text-lg font-semibold text-gray-900"
        >
          Your session is about to expire
        </h2>
        <p id="session-timeout-message" className="mt-2 text-sm text-gray-600">
          You have been inactive for a while. For your security you will be
          signed out in{' '}
          <span className="font-semibold text-gray-900">
            {secondsLeft} second{secondsLeft === 1 ? '' : 's'}
          </span>
          .
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={continuing}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={continuing}
            autoFocus
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {continuing ? 'Continuing…' : 'Continue session'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutManager;
