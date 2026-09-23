import { platformName } from "../../lib/platform";
import { useEffect, useRef } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { CloseIcon } from "../common/Icons";
import { entryFor, formatDate } from "../../lib/changelog";
import { useModalFocus } from "../../lib/useModalFocus";
import { useWhatsNewStore } from "../../state/whatsNewStore";

/**
 * The window shown once after an upgrade: what changed, in the build that
 * changed it. Deliberately a reading surface — no settings, no actions beyond
 * closing it — so it can be dismissed in one keystroke and never blocks work.
 */
export function WhatsNew({ deferred = false }: { deferred?: boolean }) {
  const showing = useWhatsNewStore((s) => s.showing);
  const close = useWhatsNewStore((s) => s.close);
  const modalRef = useRef<HTMLElement>(null);
  useModalFocus(modalRef, showing !== "" && !deferred, close);

  useEffect(() => {
    // The running version, not the feed's: this describes the build that is
    // executing right now, which after a restart is the one just installed.
    getVersion()
      .then((version) => useWhatsNewStore.getState().arrived(version))
      .catch(() => {
        // Outside Tauri there is no version to compare, so nothing opens.
      });
  }, []);

  const entry = showing === "" ? undefined : entryFor(showing);
  if (!entry || deferred) return null;

  return (
    <div className="modal-backdrop whatsnew-backdrop" onClick={close}>
      <section
        ref={modalRef}
        className="modal whatsnew"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="whatsnew__hero" aria-hidden="true">
          {entry.image
            ? <img className="whatsnew__hero-art" src={entry.image} alt="" />
            : (
              <span className="whatsnew__hero-fallback">
                <span className="whatsnew__hero-version">{entry.version}</span>
                <span className="whatsnew__hero-label">Vibyra for {platformName}</span>
              </span>
            )}
        </div>

        <button
          type="button"
          className="whatsnew__close"
          aria-label="Close what's new"
          title="Close"
          onClick={close}
        >
          <CloseIcon size={14} />
        </button>

        <div className="whatsnew__scroll">
          <header className="whatsnew__head">
            <h2 className="whatsnew__title" id="whatsnew-title">What&rsquo;s New</h2>
            <p className="whatsnew__date">{formatDate(entry.date)}</p>
          </header>

          {entry.summary && <p className="whatsnew__summary">{entry.summary}</p>}

          {entry.sections.map((section) => (
            <article className="whatsnew__section" key={section.heading}>
              <h3 className="whatsnew__heading">{section.heading}</h3>
              <p className="whatsnew__body">{section.body}</p>
            </article>
          ))}
        </div>

        <footer className="whatsnew__footer">
          <span className="whatsnew__footer-version">Vibyra {entry.version}</span>
          <button type="button" className="btn btn--primary" onClick={close}>
            Get started
          </button>
        </footer>
      </section>
    </div>
  );
}
