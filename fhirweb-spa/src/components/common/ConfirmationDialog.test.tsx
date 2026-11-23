import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

afterEach(cleanup);

describe('ConfirmationDialog', () => {
  it('shows an accessible custom confirmation with explicit actions', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        title="Enter sandbox?"
        message="This action moves the persona into evaluation."
        confirmLabel="Approve and enter sandbox"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(
      screen.getByText('This action moves the persona into evaluation.'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and enter sandbox' }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('allows the user to cancel without confirming', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        title="Delete item?"
        message="This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
