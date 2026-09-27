import { useRunConfirmStore } from "../../state/runConfirmStore";
import { useDialogFocus } from "../teammates/useDialogFocus";
import "./runConfirm.css";

/**
 * The gate in front of a command a model wrote. It shows every line verbatim
 * and selectable, because reading the thing is the entire point — and offers
 * no "don't ask again", which on a gate whose input is LLM-authored would only
 * turn the next reply into a one-click shell.
 */
export function RunConfirmModal() {
  const pending = useRunConfirmStore((state) => state.pending);
  const cancel = () => pending?.cancel();
  const dialog = useDialogFocus(Boolean(pending), cancel);
  if (!pending) return null;

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <section
        ref={(node) => {
          dialog.current = node;
        }}
        className="modal run-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-confirm-title"
        aria-describedby="run-confirm-command"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="run-confirm__header">
          <h2 id="run-confirm-title">Run this command?</h2>
          <p className="run-confirm__where">{pending.destination}</p>
        </header>
        <div className="run-confirm__body">
          <pre id="run-confirm-command" className="run-confirm__command">
            {pending.lines.join("\n")}
          </pre>
          <ul className="run-confirm__reasons">
            {pending.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <footer className="run-confirm__actions">
          {/* Cancel first in the DOM, so it is what `useDialogFocus` focuses. */}
          <button className="btn" type="button" onClick={cancel}>
            Cancel
          </button>
          <button className="btn btn--danger" type="button" onClick={pending.confirm}>
            Run anyway
          </button>
        </footer>
      </section>
    </div>
  );
}
