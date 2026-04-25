import { useState } from 'react';

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

function ConfirmDialog({
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? 'confirm-ok confirm-ok--danger' : 'confirm-ok'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [pending, setPending] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = (opts: ConfirmOptions | string): Promise<boolean> =>
    new Promise(resolve => {
      const normalized = typeof opts === 'string' ? { message: opts } : opts;
      setPending({ opts: normalized, resolve });
    });

  const handleConfirm = () => { pending?.resolve(true);  setPending(null); };
  const handleCancel  = () => { pending?.resolve(false); setPending(null); };

  const modal = pending ? (
    <ConfirmDialog
      {...pending.opts}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, modal };
}
