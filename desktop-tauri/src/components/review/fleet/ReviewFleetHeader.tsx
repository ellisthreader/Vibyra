import type { FleetFacts } from "../../../lib/reviewFleetActionPolicy";
import { RestartIcon } from "../../common/Icons";

interface Props {
  facts: FleetFacts;
  refreshing: boolean;
  onRefresh: () => void;
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * One line, three facts, in the panel's existing `review-head` rhythm.
 *
 * The overlap count is the only coloured thing up here and it only exists when
 * it is non-zero — a permanent "0 overlap" would be a number the eye stops
 * reading, and the whole value of the amber is that it is unusual.
 *
 * Each fact carries its own accessible name because the separators are
 * decorative: read out raw, "6 · 3 · 1" is three numbers with no nouns.
 */
export function ReviewFleetHeader({ facts, refreshing, onRefresh }: Props) {
  return (
    <header className="review-head">
      <p className="fleet-head__facts">
        <span aria-label={count(facts.workspaces, "workspace", "workspaces")}>
          {count(facts.workspaces, "workspace", "workspaces")}
        </span>
        <span aria-hidden="true">·</span>
        <span aria-label={`${facts.ready} ready to review`}>{facts.ready} ready</span>
        {facts.overlaps > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span
              className="fleet-head__overlap"
              aria-label={`${count(facts.overlaps, "file", "files")} changed by more than one workspace`}
            >
              {facts.overlaps} overlap
            </span>
          </>
        )}
      </p>
      <button
        type="button"
        className="icon-btn fleet-head__refresh"
        title="Refresh every workspace"
        aria-label="Refresh every workspace"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RestartIcon size={13} />
      </button>
    </header>
  );
}
