import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentBuilderRoute } from './routes';

const auth = vi.hoisted(() => ({ isAuthenticated: true, token: 'allowed' }));
vi.mock('react-redux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-redux')>()),
  useSelector: (select: (state: unknown) => unknown) => select({ auth }),
}));
vi.mock('./services/auth/oidc', () => ({
  hasRealmRole: (token: string, role: string) =>
    token === 'allowed' && role === 'agentbuilder',
}));
afterEach(cleanup);

describe('catalog route authorization', () => {
  it.each([
    [true, 'allowed', true],
    [true, 'other-role', false],
    [false, 'allowed', false],
  ])(
    'checks authenticated=%s and token role=%s',
    (isAuthenticated, token, allowed) => {
      auth.isAuthenticated = isAuthenticated;
      auth.token = token;
      render(
        <MemoryRouter initialEntries={['/data-assets']}>
          <Routes>
            <Route
              path="/data-assets"
              element={
                <AgentBuilderRoute>
                  <p>Protected catalog</p>
                </AgentBuilderRoute>
              }
            />
            <Route path="/" element={<p>Home destination</p>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByText('Protected catalog') !== null).toBe(allowed);
      expect(screen.queryByText('Home destination') !== null).toBe(!allowed);
    },
  );
});
