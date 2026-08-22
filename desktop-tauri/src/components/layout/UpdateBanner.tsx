import type { CSSProperties } from "react";

import { CloseIcon } from "../common/Icons";
import { bannerCopy } from "../../lib/updatePolicy";
import { useUpdateStore } from "../../state/updateStore";

/**
 * The whole user-facing surface of the updater: one card, one button. It
 * appears when the watcher finds a release and stays until the user acts on
 * it or dismisses that version.
 *
 * Downloading and restarting are deliberately two clicks. This window holds
 * live terminal sessions, and restarting under an agent mid-run would lose
 * work — so the swap only happens on an explicit "Restart now".
 */
export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const notes = useUpdateStore((s) => s.notes);
  const dismissed = useUpdateStore((s) => s.dismissed);

  if (status === "idle" || !version) return null;
  if (dismissed === version && status === "available") return null;

  const copy = bannerCopy(status, version, progress, error, notes);
  const indeterminate = status === "downloading" && progress.total <= 0;

  const act = (): void => {
    const store = useUpdateStore.getState();
    if (status === "ready") void store.restart();
    else void store.download();
  };

  return (
    <aside
      className={`vupdate vupdate--${status}`}
      role="status"
      aria-live="polite"
    >
      <div className="vupdate__text">
        <h3 className="vupdate__title">{copy.title}</h3>
        <p className="vupdate__detail">{copy.detail}</p>
      </div>

      <button
        type="button"
        className="btn btn--primary vupdate__action"
        onClick={act}
        disabled={copy.busy}
      >
        {copy.action}
      </button>

      {status !== "downloading" && (
        <button
          type="button"
          className="icon-btn vupdate__close"
          aria-label={`Dismiss update ${version}`}
          title="Not now"
          onClick={() => useUpdateStore.getState().dismiss()}
        >
          <CloseIcon size={13} />
        </button>
      )}

      {status === "downloading" && (
        <span
          className={`vupdate__bar${indeterminate ? " vupdate__bar--indeterminate" : ""}`}
          style={{ "--vupdate-pct": `${progress.percent}%` } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </aside>
  );
}
