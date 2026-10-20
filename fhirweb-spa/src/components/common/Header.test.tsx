import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { name: 'Tester' },
  token: 'test',
}));
const allowed = vi.hoisted(() => ({ value: false }));
vi.mock('react-redux', () => ({
  useSelector: (select: (state: unknown) => unknown) => select({ auth }),
  useDispatch: () => vi.fn(),
}));
vi.mock('../../services/auth/oidc', () => ({
  hasRealmRole: (_token: string, role: string) =>
    allowed.value && role === 'agentbuilder',
  signOut: vi.fn(),
}));
afterEach(cleanup);

describe('catalog navigation authorization', () => {
  it.each([false, true])(
    'shows catalog links only when agentbuilder is %s',
    (canUse) => {
      allowed.value = canUse;
      render(
        <MemoryRouter>
          <Header />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByTitle('Menu'));
      expect(
        screen.queryAllByRole('link', { name: 'Service Catalogue' }),
      ).toHaveLength(canUse ? 2 : 0);
    },
  );
});
