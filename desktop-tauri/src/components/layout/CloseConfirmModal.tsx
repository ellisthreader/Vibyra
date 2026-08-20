import { useCloseGuardStore } from "../../state/closeGuardStore";
import { CloseIcon } from "../common/Icons";

/** Shown when the window is closed while terminals are still running. */
export function CloseConfirmModal() {
  const prompting = useCloseGuardStore((state) => state.prompting);
  const closing = useCloseGuardStore((state) => state.closing);
  const confirm = useCloseGuardStore((state) => state.confirm);
  const cancel = useCloseGuardStore((state) => state.cancel);

  if (prompting.length === 0) return null;
  const count = `${prompting.length} terminal${prompting.length === 1 ? "" : "s"}`;

  return (
    <div className="modal-backdrop" onClick={() => !closing && cancel()}>
      <section
        className="modal close-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title" id="close-confirm-title">
              Close Vibyra?
            </h2>
            <p className="modal__subtitle">{count} still running</p>
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
          <ul className="close-confirm__list">
            {prompting.map((title, index) => (
              <li key={`${title}-${index}`}>{title}</li>
            ))}
          </ul>
          <p>
            These processes will stop. Your layout and their output are saved, so they come back
            ready to resume next time you open Vibyra.
          </p>
        </div>
        <footer className="close-confirm__actions">
          <button className="btn" type="button" disabled={closing} onClick={cancel}>
            Keep working
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={closing}
            onClick={() => void confirm()}
          >
            {closing ? "Saving…" : "Save and close"}
          </button>
        </footer>
      </section>
    </div>
  );
}
