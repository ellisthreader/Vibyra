import { useCallback, useRef } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { draftBlocker } from "../../lib/reportDraft";
import { useReportStore } from "../../state/reportStore";
import { CheckIcon, CloseIcon } from "../common/Icons";
import { ReportAttachments } from "./ReportAttachments";
import { ReportFields } from "./ReportFields";

/** The report dialog.
 *
 * Unmounts itself while a screenshot is being taken rather than hiding with
 * CSS: the capture is of the real screen, so a dialog that merely went
 * transparent would still be in the picture. */
export function ReportModal() {
  const open = useReportStore((state) => state.open);
  const capturing = useReportStore((state) => state.capturing);
  const draft = useReportStore((state) => state.draft);
  const surroundings = useReportStore((state) => state.surroundings);
  const status = useReportStore((state) => state.status);
  const error = useReportStore((state) => state.error);
  const sentId = useReportStore((state) => state.sentId);
  const close = useReportStore((state) => state.close);
  const patch = useReportStore((state) => state.patch);
  const submit = useReportStore((state) => state.submit);
  const addScreenshot = useReportStore((state) => state.addScreenshot);
  const addImages = useReportStore((state) => state.addImages);
  const pasteImage = useReportStore((state) => state.pasteImage);
  const removeImage = useReportStore((state) => state.removeImage);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, open && !capturing, close);

  // Ctrl+V attaches an image from the clipboard — but only when the clipboard
  // holds one. A text paste has to reach the field the user is typing in, so
  // this never calls preventDefault before it knows what it is pasting.
  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (event.clipboardData.types.includes("text/plain")) return;
      void pasteImage();
    },
    [pasteImage],
  );

  if (!open || capturing) return null;

  const blocker = draft ? draftBlocker(draft) : "Collecting a few details…";
  const sending = status === "sending";

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
        onPaste={onPaste}
      >
        <header className="report__header">
          <div className="report__heading">
            <h2>{status === "sent" ? "Thanks — that helps" : "Report a bug"}</h2>
            <p>
              {status === "sent"
                ? "Your report went straight to the Vibyra team."
                : "Tell us what went wrong. It only takes a moment."}
            </p>
          </div>
          <button className="icon-btn" onClick={close} title="Close">
            <CloseIcon size={15} />
          </button>
        </header>

        {status === "sent" ? (
          <div className="report__done">
            <span className="report__done-mark" aria-hidden="true">
              <CheckIcon size={30} />
            </span>
            <p className="report__done-id">{sentId}</p>
            <p className="report__done-hint">
              Quote that reference if you follow it up — it points at your report and everything
              attached to it.
            </p>
            <button className="btn btn--primary" onClick={close}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="report__body">
              {draft && surroundings ? (
                <>
                  <ReportFields draft={draft} patch={patch} />
                  <ReportAttachments
                    draft={draft}
                    patch={patch}
                    surroundings={surroundings}
                    onScreenshot={() => void addScreenshot()}
                    onAddImages={() => void addImages()}
                    onRemoveImage={removeImage}
                  />
                </>
              ) : (
                <p className="report__loading">Collecting a few details about where you are…</p>
              )}
            </div>
            <footer className="report__footer">
              <span className="report__status" role="status">
                {error ? (
                  <span className="report__error">{error}</span>
                ) : blocker ? (
                  <span className="report__blocker">{blocker}</span>
                ) : (
                  <span className="report__ready">Ready to send</span>
                )}
              </span>
              <button
                className="btn btn--primary"
                disabled={Boolean(blocker) || sending}
                onClick={() => void submit()}
              >
                {sending ? "Sending…" : "Send report"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
