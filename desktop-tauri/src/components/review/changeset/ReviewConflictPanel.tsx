import { useState } from "react";

import { writeTerminal } from "../../../ipc/terminal";
import {
  blockedPaths,
  conflictHeadline,
  landRestCopy,
  retryPaths,
  retrySelection,
} from "../../../lib/reviewConflictPolicy";
import { canHandBack, handbackConfirmation, handbackPrompt } from "../../../lib/reviewHandback";
import { notePromptInput } from "../../../lib/terminalChatTitleSource";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

// What a blocked land offers instead of a full stop.
//
// A `--3way` that cannot apply used to end in one sentence and no next move,
// which left the user to work out on their own that the workspace was intact
// and that most of the changeset would still have landed. The sentence stays —
// "nothing was touched" is the reassurance the routes below rest on — and the
// routes are now on the screen that reported the problem.
//
// Handing it back to the agent is the route worth having: the terminal that
// wrote the conflict is still open, still holds the conversation, and is
// sitting in the worktree that needs reconciling. See `reviewHandback` for
// why free text takes the palette's `!` path rather than `agentPromptScan`.
//
// Rebase stays disabled rather than faked — it has no native command yet, and
// a button that quietly did nothing would be worse than one that says so.

const REBASE_HINT =
  "Bringing the agent's copy up to date with your project is coming — it has no native command yet.";

interface Props {
  pane: PaneState;
  root: string;
  /** Straight from the merge outcome: the files that stopped it. */
  conflicts: string[];
}

export function ReviewConflictPanel({ pane, root, conflicts }: Props) {
  const status = useReviewStore((state) => state.statusByPane[pane.id] ?? null);
  const selection = useReviewStore((state) => state.selectionByPane[pane.id]);
  const busy = useReviewStore((state) => state.busyPane !== null);
  const setSelection = useReviewStore((state) => state.setSelection);
  const merge = useReviewStore((state) => state.merge);

  const blocked = blockedPaths(status, selection, conflicts);
  const named = blocked.length > 0 ? blocked : conflicts;
  const kept = retryPaths(status, selection, conflicts);

  const [handedBack, setHandedBack] = useState<string | null>(null);

  const landRest = async () => {
    setSelection(pane.id, retrySelection(status, selection, conflicts));
    await merge(pane, root);
  };

  // Composed by the app, sent because the button was pressed, addressed to one
  // named pane — the same shape as the palette's `!` mode. The text is noted
  // first so the pane titles itself from what was asked, not from the reply.
  const handBack = () => {
    const text = `${handbackPrompt(named, pane.workspace?.branch ?? "")}\r`;
    notePromptInput(pane.id, text);
    void writeTerminal(pane.id, text).catch(() => {});
    useTerminalStore.getState().setFocus(pane.id);
    setHandedBack(handbackConfirmation(named));
  };

  return (
    <section className="review-conflict" aria-label="These changes didn't fit">
      <p className="review-conflict__lead">{conflictHeadline(named)}</p>
      <p className="review-conflict__copy">{landRestCopy(kept, named)}</p>
      <div className="review-conflict__routes">
        <button
          type="button"
          className="btn btn--approve"
          disabled={busy || kept.length === 0}
          onClick={() => void landRest()}
        >
          {kept.length === 1 ? "Approve the other file" : `Approve the other ${kept.length} files`}
        </button>
        <button type="button" className="btn" disabled title={REBASE_HINT}>
          Update the copy to match your project
        </button>
        {canHandBack(pane) && (
          <button
            type="button"
            className="btn"
            disabled={busy || handedBack !== null}
            onClick={handBack}
          >
            Send it back to the agent
          </button>
        )}
      </div>
      {handedBack ? (
        <p className="review-conflict__sent" role="status">
          {handedBack}
        </p>
      ) : (
        <p className="review-conflict__hint">
          Or open the file below, take the parts you want by hand, and approve the rest — the
          agent's copy keeps everything either way.
        </p>
      )}
    </section>
  );
}
