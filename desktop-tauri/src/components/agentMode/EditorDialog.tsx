import { useRef, type ReactNode } from "react";

import { CloseIcon } from "../common/Icons";
import { useModalFocus } from "../../lib/useModalFocus";

/**
 * The one dialog frame Agent Mode's forms share.
 *
 * New teammate, new routine and new skill used to be three differently shaped
 * boxes — one a modal with its own scrim class, two inline cards that pushed
 * the list down while open. They are the same gesture: a short form, a way
 * out, one thing to do. The shape comes from modals.css, the same frame as
 * Settings and the terminal adder, so a dialog here looks like a dialog
 * anywhere else in the product.
 *
 * The frame is the form. Enter in a single-line field submits, Escape closes,
 * and focus is held inside until one of those happens.
 */
export function EditorDialog({
  title,
  lede,
  submitLabel,
  busy = false,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  lede?: string;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const shell = useRef<HTMLFormElement>(null);
  useModalFocus(shell, true, onClose);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal modal--narrow"
        ref={shell}
        role="dialog"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <header className="modal__header">
          <div className="modal__heading">
            <div className="modal__title">{title}</div>
          </div>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </header>
        <div className="modal__body">
          {lede && <p className="modal__lede">{lede}</p>}
          {children}
        </div>
        <footer className="modal__foot">
          {error && <p className="modal__error">{error}</p>}
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
