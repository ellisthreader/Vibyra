import { WarnIcon } from "../../common/StatusIcons";
import type { Overlap } from "./useChangesetOverlaps";

// The one line that says another agent is holding a file you are about to
// land. It renders only for `overlap` and `conflict`: two workspaces editing
// different functions in one file is normal work, and a banner for that is how
// a radar becomes noise the user learns to scroll past.

const LEAD: Record<string, string> = {
  overlap: "Another workspace has changed the same lines",
  conflict: "Another workspace has already landed changes here",
};

/** Files named in the banner before it starts counting instead. */
const NAMED = 2;

export function ReviewOverlapBanner({ overlaps }: { overlaps: Map<string, Overlap> }) {
  const loud = [...overlaps.entries()].filter(([, overlap]) => overlap.level !== "touch");
  if (loud.length === 0) return null;

  const worst = loud.some(([, overlap]) => overlap.level === "conflict") ? "conflict" : "overlap";
  const paths = loud.map(([path]) => path);
  const others = [...new Set(loud.flatMap(([, overlap]) => overlap.others))];
  const named = paths.slice(0, NAMED).join(", ");
  const rest = paths.length - NAMED;

  return (
    <p className={`review-overlap review-overlap--${worst}`} role="status">
      <WarnIcon size={14} />
      <span>
        {LEAD[worst]}: <code>{named}</code>
        {rest > 0 && ` and ${rest} more`} — also open in {others.join(", ")}. Landing first wins;
        the other workspace patches onto whatever is there.
      </span>
    </p>
  );
}
