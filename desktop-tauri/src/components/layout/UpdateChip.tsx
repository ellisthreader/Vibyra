import type { CSSProperties } from "react";

import { DownloadIcon } from "../common/StatusIcons";
import { RestartIcon } from "../common/Icons";
import { chipCopy } from "../../lib/updatePolicy";
import { useUpdateStore } from "../../state/updateStore";

/**
 * The update affordance in the title bar, to the left of the window controls.
 *
 * The banner is the loud surface and can be dismissed; this is the quiet one
 * that cannot. It is the fallback for anyone who has desktop notifications
 * switched off, or who was not at the machine when the toast appeared — so it
 * stays put for as long as an update exists, and one click acts on it.
 *
 * Nothing renders when there is no update, which is the overwhelmingly common
 * case: the title bar is not a permanent "you are up to date" indicator.
 */
export function UpdateChip() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);

  const copy = chipCopy(status, version, progress, error);
  if (!copy) return null;

  const Glyph = copy.glyph === "restart" ? RestartIcon : DownloadIcon;
  const indeterminate = status === "downloading" && progress.total <= 0;

  return (
    <button
      type="button"
      className={`update-chip update-chip--${status}${
        indeterminate ? " update-chip--indeterminate" : ""
      }`}
      style={{ "--update-chip-pct": `${progress.percent}%` } as CSSProperties}
      title={copy.title}
      aria-label={copy.title}
      // The label alone changes from "Update" to "42%" to "Restart", so a live
      // region would read every percentage tick aloud. The title carries the
      // meaning; announce only the settled states.
      aria-live="off"
      disabled={copy.busy}
      onClick={() => void useUpdateStore.getState().act()}
    >
      <Glyph size={13} />
      <span className="update-chip__label">{copy.label}</span>
    </button>
  );
}
