import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ExpandableIntro from './ExpandableIntro';

afterEach(cleanup);

describe('ExpandableIntro', () => {
  it('shows a compact preview and expands on request', () => {
    render(
      <ExpandableIntro>
        A detailed description that explains the catalogue and its purpose for
        teams and AI agents.
      </ExpandableIntro>,
    );

    const paragraph = screen.getByText(/A detailed description/);
    expect(paragraph.className).toContain('line-clamp-3');

    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(paragraph.className).not.toContain('line-clamp-3');
    expect(
      screen
        .getByRole('button', { name: 'Show less' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
