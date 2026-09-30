import { useEffect, useState } from "react";
import { usePhoneStore } from "../../state/phoneStore";
import { EyeIcon, TerminalIcon } from "../common/Icons";

/** The whole point of the connection: a phone asks, this Mac answers. It is
 * mounted in the workspace rather than inside Settings because the request can
 * arrive at any moment and expires in under two minutes. */
export function PhoneApprovalModal() {
  // Selectors return stored references only: a fresh array per render would
  // make the store look like it changed on every snapshot read.
  const status = usePhoneStore((state) => state.status);
  const busy = usePhoneStore((state) => state.busy);
  const answer = usePhoneStore((state) => state.answer);
  const request = status?.pending[0];
  const [previewAuto, setPreviewAuto] = useState(false);
  useEffect(() => setPreviewAuto(false), [request?.id]);
  if (!request) return null;
  // The promise made here has to match what the phone will be able to do the
  // moment it is allowed, so it follows the typing switch.
  const typing = status?.typing === true;
  return (
    <div className="modal-backdrop">
      <section
        className="modal phone-approval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-approval-title"
      >
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title" id="phone-approval-title">
              {request.name} wants to connect
            </h2>
            <p className="modal__subtitle">Allow it only if this is your phone, in your hand.</p>
          </div>
        </header>
        <div className="phone-approval__body">
          <span className="phone-approval__mark" aria-hidden="true">
            {typing ? <TerminalIcon size={16} /> : <EyeIcon size={16} />}
          </span>
          <div>
            <strong>{typing
              ? "It can view and interact with your shared work."
              : "It can view your terminals."}</strong>
            <p>
              {typing
                ? "All terminal conversations and output, now and later. This phone can type, send agent instructions and answer agent permission requests. Agents can change files when instructed."
                : "All terminal conversations and output, now and later, including anything printed there. Sending messages and responding to agent requests is off."}
            </p>
            <p className="phone-approval__key">Device key {request.id.slice(0, 16)}…</p>
          </div>
        </div>
        {status?.previewAutoAvailable && typing && <label className="phone-approval__preview">
          <input type="checkbox" checked={previewAuto} disabled={busy}
            onChange={(event) => setPreviewAuto(event.target.checked)} />
          <span><strong>Allow one-tap website Preview</strong>
            <small>This phone can open websites running from your project folders, including signed-in pages and cookies. You can turn this off in Phone settings.</small>
          </span>
        </label>}
        <footer className="phone-approval__actions">
          <button className="btn" type="button" disabled={busy}
            onClick={() => void answer(request.id, false)}>
            Deny
          </button>
          <button className="btn btn--primary" type="button" disabled={busy}
            onClick={() => void answer(request.id, true, previewAuto)}>
            {typing ? "Allow" : "Allow viewing"}
          </button>
        </footer>
      </section>
    </div>
  );
}
