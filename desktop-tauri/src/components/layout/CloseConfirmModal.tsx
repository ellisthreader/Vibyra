import { useCloseGuardStore } from "../../state/closeGuardStore";
import { CloseIcon, TerminalIcon } from "../common/Icons";

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
  const count = `${prompting.length} session${prompting.length === 1 ? "" : "s"}`;

  return (
    <div className="modal-backdrop" onClick={() => !closing && cancel()}>
      <section
        ref={modalRef}
        className="modal decision close-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="decision__top">
          <span className="decision__mark">
            <span className="decision__mark-icon"><TerminalIcon size={14} /></span>
            {prompting.length > 0 ? count + " still running" : "Saving your workspace"}
          </span>
          <button className="icon-btn" type="button" title="Keep working" aria-label="Keep working" disabled={closing} onClick={cancel}>
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="decision__content">
          <h2 className="decision__title" id="close-confirm-title">
            {error ? "Workspace not saved" : isMac ? "Quit Vibyra?" : "Close Vibyra?"}
          </h2>
          <p className="decision__lead">
            Your running processes will stop. Vibyra saves your open chats and layout so you can return to them next time.
          </p>
          {prompting.length > 0 && <div className="decision__card close-confirm__list">
            {prompting.map((title, index) => (
              <div className="decision__row" key={`${title}-${index}`}>
                <span className="close-confirm__live" aria-hidden="true" />
                <span>{title}</span>
              </div>
            ))}
          </div>}
          {error && <p role="alert" className="decision__error">{error}</p>}
        </div>
        <footer className="decision__actions">
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
