import { useRunConfirmStore } from "../../state/runConfirmStore";
import { useDialogFocus } from "../teammates/useDialogFocus";
import { TerminalIcon } from "../common/Icons";

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
        className="modal decision decision--danger decision--wide run-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-confirm-title"
        aria-describedby="run-confirm-command"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="decision__top">
          <span className="decision__mark">
            <span className="decision__mark-icon"><TerminalIcon size={14} /></span>
            Check before running
          </span>
        </div>
        <div className="decision__content">
          <h2 className="decision__title" id="run-confirm-title">Run this command?</h2>
          <p className="decision__lead">{pending.destination}</p>
          <div className="decision__card">
            <pre id="run-confirm-command" className="decision__pre">
              {pending.lines.join("\n")}
            </pre>
            {pending.reasons.map((reason) => (
              <div className="decision__row" key={reason}>
                <span className="decision__tick decision__tick--warn" aria-hidden="true">!</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
        <footer className="decision__actions">
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
