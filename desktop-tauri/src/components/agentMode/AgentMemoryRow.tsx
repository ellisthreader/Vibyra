import type { MemoryEntry } from "../../agentTypes";
import { PinIcon, TrashIcon } from "../common/AgentIcons";

/**
 * One thing a teammate knows, as a settings row.
 *
 * A proposal gets words — Keep and No — because it is a question; a kept
 * entry gets glyphs, because pinning and forgetting are maintenance. The
 * class pill leads the row so a constraint reads differently from a fact
 * before the sentence is read.
 */
export function AgentMemoryRow({
  entry,
  onKeep,
  onReject,
  onPin,
  onDelete,
}: {
  entry: MemoryEntry;
  onKeep?: () => void;
  onReject?: () => void;
  onPin?: () => void;
  onDelete?: () => void;
}) {
  const proposed = entry.status === "proposed";

  return (
    <div className={`setting-row memory-row ${entry.pinned ? "is-pinned" : ""}`}>
      <span className="setting-row__lead">
        <span className={`memory-row__class memory-row__class--${entry.class}`}>{entry.class}</span>
        <span className="setting-row__text">
          <span className="memory-row__body">{entry.body}</span>
        </span>
      </span>
      <span className="setting-row__control settings-row-actions">
        {proposed ? (
          <>
            <button className="btn btn--sm btn--secondary" onClick={onReject}>
              No
            </button>
            <button className="btn btn--sm" onClick={onKeep}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              className={`icon-btn ${entry.pinned ? "icon-btn--active" : ""}`}
              title={entry.pinned ? "Unpin" : "Always include"}
              onClick={onPin}
            >
              <PinIcon size={12} />
            </button>
            <button className="icon-btn icon-btn--danger" title="Forget this" onClick={onDelete}>
              <TrashIcon size={12} />
            </button>
          </>
        )}
      </span>
    </div>
  );
}
