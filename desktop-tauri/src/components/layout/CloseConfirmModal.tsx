import { useCloseGuardStore } from "../../state/closeGuardStore";
import { CloseIcon } from "../common/Icons";

/** Shown when the window is closed while terminals are still running. */
export function CloseConfirmModal() {
  const prompting = useCloseGuardStore((state) => state.prompting);
  const closing = useCloseGuardStore((state) => state.closing);
  const confirm = useCloseGuardStore((state) => state.confirm);
  const cancel = useCloseGuardStore((state) => state.cancel);
  const error = useCloseGuardStore((state) => state.error);
  const forceClose = useCloseGuardStore((state) => state.forceClose);
  const modalRef = useRef<HTMLElement>(null);
  const dismiss = useCallback(() => { if (!closing) cancel(); }, [closing, cancel]);
  useModalFocus(modalRef, prompting.length > 0 || Boolean(error), dismiss);

  if (prompting.length === 0 && !error) return null;
  const count = `${prompting.length} terminal${prompting.length === 1 ? "" : "s"}`;

  return (
    <div className="modal-backdrop" onClick={() => !closing && cancel()}>
      <section
        ref={modalRef}
        className="modal close-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title" id="close-confirm-title">
              {error ? "Workspace not saved" : isMac ? "Quit Vibyra?" : "Close Vibyra?"}
            </h2>
            {prompting.length > 0 && <p className="modal__subtitle">{count} still running</p>}
          </div>
          <button
            className="icon-btn"
            type="button"
            title="Keep working"
            disabled={closing}
            onClick={cancel}
          >
            <CloseIcon size={15} />
          </button>
        </header>
        <div className="close-confirm__body">
          {error && <p role="alert" className="close-confirm__error">{error}</p>}
          <ul className="close-confirm__list">
            {prompting.map((title, index) => (
              <li key={`${title}-${index}`}>{title}</li>
            ))}
          </ul>
          <p>
            Your running processes will stop. Vibyra saves your open chats and layout so you can return to them next time.
          </p>
        </div>
        <footer className="close-confirm__actions">
          <button className="btn" type="button" disabled={closing} onClick={cancel}>
            Keep working
          </button>
          {error && <button className="btn" disabled={closing} onClick={() => void forceClose()}>Quit without saving</button>}
          <button
            className="btn btn--primary"
            type="button"
            disabled={closing}
            onClick={() => void confirm()}
          >
            {closing ? "Saving…" : error ? "Try saving again" : isMac ? "Save and quit" : "Save and close"}
          </button>
        </footer>
      </section>
    </div>
  );
}
import { useCallback, useRef } from "react";
import { useModalFocus } from "../../lib/useModalFocus";
import { isMac } from "../../lib/platform";
