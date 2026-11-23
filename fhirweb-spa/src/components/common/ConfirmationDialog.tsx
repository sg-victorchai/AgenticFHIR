import React from 'react';

export interface ConfirmationDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}
  >
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-message"
      className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-cyan-100 text-cyan-800'}`}
        >
          {tone === 'danger' ? '!' : 'i'}
        </span>
        <div>
          <h2
            id="confirmation-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {title}
          </h2>
          <p
            id="confirmation-dialog-message"
            className="mt-2 text-sm leading-relaxed text-slate-600"
          >
            {message}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onConfirm()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 ${tone === 'danger' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-cyan-700 hover:bg-cyan-800'}`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </section>
  </div>
);

export default ConfirmationDialog;
