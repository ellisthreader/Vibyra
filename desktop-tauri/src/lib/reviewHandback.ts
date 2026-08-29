import type { PaneState } from "../state/terminalStoreTypes";

// Handing a blocked land back to the agent that produced it.
//
// This is the route the review has that a standalone diff tool cannot: the
// terminal that wrote the conflicting change is still open, still holds the
// conversation that produced it, and is sitting in the very worktree that
// needs rebasing. Rather than making the user carry the conflict out of
// Vibyra and back in, the panel writes the agent a brief and gets out of the
// way.
//
// The text goes through the same path the command palette's `!` mode and
// dictation already use — composed by the app, sent because the user pressed
// a button, addressed to one named pane. It is deliberately *not* the
// `agentPromptScan` route: that one answers a question the agent is already
// asking, with a single validated keystroke, and its staleness guard exists
// because a mis-timed keystroke there could approve something. Free text the
// user asked to send carries no such hazard, and a running agent reads it as
// the next turn of the conversation.

/** How many files the brief names before it starts summarising. */
const NAMED_LIMIT = 8;

/**
 * Only a live pane can be handed anything.
 *
 * An exited or suspended terminal has no process to read the brief, and a
 * hibernated one is not listening. The button is hidden rather than disabled
 * in those states — there is nothing to explain, the terminal is simply gone.
 */
export function canHandBack(pane: PaneState): boolean {
  return pane.status === "running" && pane.visibility !== "hibernated";
}

/**
 * The brief.
 *
 * Written as the user would write it, because as far as the agent's
 * conversation is concerned the user did. It says what happened, names the
 * files, and states the goal — but deliberately does not prescribe the git
 * commands: the agent is already inside the worktree and knows its own
 * branch, and a wrong `git rebase <guess>` in a prompt is worse than none.
 */
export function handbackPrompt(paths: readonly string[], branch: string): string {
  const named = paths.slice(0, NAMED_LIMIT);
  const rest = paths.length - named.length;
  const list = named.map((path) => `- ${path}`).join("\n");
  const overflow = rest > 0 ? `\n- …and ${rest} more` : "";
  const files = paths.length === 1 ? "this file" : "these files";
  return [
    `The project has changed underneath this workspace (\`${branch}\`) since you started, and my changes to ${files} no longer apply cleanly:`,
    "",
    `${list}${overflow}`,
    "",
    "Please reconcile them with the project's current version of those files, keeping what we were trying to do. The rest of the workspace is unaffected.",
  ].join("\n");
}

/** One line, so the panel can say what it just did without re-reading it. */
export function handbackConfirmation(paths: readonly string[]): string {
  const count = paths.length === 1 ? "1 file" : `${paths.length} files`;
  return `Sent to the terminal — it has the ${count} that blocked the land.`;
}
