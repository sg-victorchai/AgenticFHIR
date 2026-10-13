import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { loginSuccess } from '../../store/slices/authSlice';
import uiReducer from '../../store/slices/uiSlice';

const mocks = vi.hoisted(() => ({
  signinSilent: vi.fn(),
  removeUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../services/auth/oidc', () => ({
  oidcUserManager: {
    signinSilent: mocks.signinSilent,
    removeUser: mocks.removeUser,
  },
  signOut: mocks.signOut,
}));

import SessionTimeoutManager, {
  IDLE_TIMEOUT_MS,
  WARNING_BEFORE_MS,
} from './SessionTimeoutManager';

const renderSignedIn = () => {
  const store = configureStore({
    reducer: { auth: authReducer, ui: uiReducer },
  });
  store.dispatch(
    loginSuccess({ token: 't', user: { id: 'u1', name: 'User' } }),
  );
  render(
    <Provider store={store}>
      <SessionTimeoutManager />
    </Provider>,
  );
  return store;
};

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  mocks.signinSilent.mockReset().mockResolvedValue({});
  mocks.removeUser.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SessionTimeoutManager', () => {
  it('warns one minute before the idle timeout', () => {
    renderSignedIn();
    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS - 2000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    advance(3000);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/Your session is about to expire/)).toBeTruthy();
  });

  it('signs out after 30 minutes of inactivity', () => {
    const store = renderSignedIn();
    advance(IDLE_TIMEOUT_MS + 1000);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(mocks.removeUser).toHaveBeenCalled();
  });

  it('slides the window on user activity', () => {
    const store = renderSignedIn();
    advance(20 * 60 * 1000);
    act(() => {
      fireEvent.keyDown(window);
    });
    advance(20 * 60 * 1000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('continues the session and refreshes tokens', async () => {
    const store = renderSignedIn();
    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS + 1000);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue session' }));
    });
    expect(mocks.signinSilent).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    advance(WARNING_BEFORE_MS + 5000);
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('ignores passive activity while the warning is shown', () => {
    const store = renderSignedIn();
    advance(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS + 1000);
    act(() => {
      fireEvent.mouseMove(window);
    });
    advance(WARNING_BEFORE_MS);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
