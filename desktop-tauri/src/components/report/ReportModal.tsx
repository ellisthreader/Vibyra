import { useCallback, useEffect, useRef, useState } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { draftBlocker } from "../../lib/reportDraft";
import { useReportStore } from "../../state/reportStore";
import { CheckIcon, CloseIcon } from "../common/Icons";
import { ReportAttachments } from "./ReportAttachments";
import { ReportExtraFields } from "./ReportExtraFields";
import { ReportFields } from "./ReportFields";
import { ReportScreenshot } from "./ReportScreenshot";

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
  const recentErrors = useReportStore((state) => state.recentErrors);
  const status = useReportStore((state) => state.status);
  const error = useReportStore((state) => state.error);
  const sentId = useReportStore((state) => state.sentId);
  const channelReady = useReportStore((state) => state.channelReady);
  const close = useReportStore((state) => state.close);
  const patch = useReportStore((state) => state.patch);
  const submit = useReportStore((state) => state.submit);
  const addScreenshot = useReportStore((state) => state.addScreenshot);
  const addImages = useReportStore((state) => state.addImages);
  const pasteImage = useReportStore((state) => state.pasteImage);
  const removeImage = useReportStore((state) => state.removeImage);
  const modalRef = useRef<HTMLDivElement>(null);
  const initialFocusDone = useRef(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useModalFocus(modalRef, open && !capturing, close);
  const draftReady = Boolean(draft);
  useEffect(() => {
    if (!open || capturing || !draftReady || initialFocusDone.current) return;
    const summary = modalRef.current?.querySelector<HTMLInputElement>(".report__primary input");
    if (summary) {
      summary.focus();
      initialFocusDone.current = true;
    }
  }, [open, capturing, draftReady]);

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

  const hasExtras = Boolean(draft && (
    draft.kind !== "bug" || draft.severity !== "normal" || draft.error || draft.steps ||
    draft.expected || draft.images.length || draft.includeTerminal || draft.contact
  ));
  useEffect(() => {
    if (hasExtras) setMoreOpen(true);
  }, [hasExtras]);

  if (!open || capturing) return null;

  const blocker = draft ? draftBlocker(draft) : "Collecting a few details…";
  const sending = status === "sending";

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem"
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
        onPaste={onPaste}
      >
        <header className="report__header">
          <div className="report__heading">
            <h2>{status === "sent" ? "Thanks — that helps" : "Report a problem"}</h2>
            <p>
              {status === "sent"
                ? "Your report reached the Vibyra team."
                : "Your name, email, platform, hardware, request IP and available project and graphics details go to Vibyra’s Discord report channel."}
            </p>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close report" title="Close">
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
                  <ReportScreenshot screenshot={draft.screenshot}
                    onCapture={() => void addScreenshot()}
                    onSelect={() => void addScreenshot(true)}
                    onRemove={() => patch({ screenshot: null })} />
                  <p className="report__identity">
                    Reporting as <strong>{surroundings.context.reporter || "your signed-in account"}</strong>
                    {" · "}{surroundings.context.platform}
                  </p>
                  <details className="report__more" open={moreOpen}
                    onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
                    <summary>Add an error or more details <span>optional</span></summary>
                    <div className="report__more-body">
                      <ReportExtraFields draft={draft} patch={patch} recentErrors={recentErrors} />
                      <ReportAttachments draft={draft} patch={patch} surroundings={surroundings}
                        onAddImages={() => void addImages()} onRemoveImage={removeImage} />
                    </div>
                  </details>
                </>
              ) : (
                <p className="report__loading">Collecting a few details about where you are…</p>
              )}
            </div>
            <footer className="report__footer">
              <span className="report__status" role="status">
                {error ? (
                  <span className="report__error">{error}</span>
                ) : channelReady === false ? (
                  <span className="report__warn">
                    Reporting is not connected on this build — sending will fail.
                  </span>
                ) : blocker ? (
                  <span className="report__blocker">{blocker}</span>
                ) : (
                  <span className="report__ready">Ready to send</span>
                )}
              </span>
              <button className="btn" onClick={close}>
                Cancel
              </button>
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
