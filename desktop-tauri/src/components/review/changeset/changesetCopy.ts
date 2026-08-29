import type { GithubStatus } from "../../../ipc/github";
import { discardCopy, type ReviewSummary } from "../../../lib/reviewPolicy";

// The action bar's sentences, kept out of the bar itself.
//
// Every pause in this panel has to name what it is about to do in the terms of
// *this* selection — "Discard" and "Land and discard" delete a workspace that
// cannot be got back, and a confirm that says only "are you sure?" is a
// confirm the user learns to click through.

/** What a confirmed press is called, so the verb matches the sentence above. */
export const CONFIRM_ACTION = {
  merge: "Approve anyway",
  sweep: "Approve, then remove",
  discard: "Yes, delete it",
} as const;

export type Confirm = keyof typeof CONFIRM_ACTION;

function fileCount(n: number): string {
  return n === 1 ? "1 file" : `${n} files`;
}

export interface ConfirmInput {
  warning: string | null;
  summary: ReviewSummary;
  /** Ticked files — what a land would take. */
  count: number;
  /** Unticked files, which a "land and discard" deletes rather than lands. */
  left: number;
  paneAlive: boolean;
}

export function confirmCopy(confirm: Confirm, input: ConfirmInput): string {
  if (confirm === "merge") return input.warning ?? "";
  if (confirm === "discard") return discardCopy(input.summary, input.paneAlive);
  // The sweep is the one press that both keeps and destroys, so it says both
  // halves — and names the unticked files it is about to delete rather than
  // approve, which is the part a user does not expect.
  const unticked = input.left > 0 ? ` — including ${fileCount(input.left)} you left unticked` : "";
  const closes = input.paneAlive ? ", and closes this terminal" : "";
  return `Puts ${fileCount(input.count)} into your project, then deletes the agent's safe copy${unticked}${closes}. The delete cannot be undone.`;
}

/**
 * The share button is never disabled by readiness — a vibe coder who has not
 * connected GitHub yet gets walked through connecting, not a dead button.
 */
export function githubTitle(ready: boolean, github: GithubStatus | null): string {
  if (ready) return "Put this work on GitHub as a pull request";
  if (github !== null && github.ghInstalled && github.authed) {
    return "This project isn't linked to a GitHub repository";
  }
  return "Connect your GitHub account first — this walks you through it";
}
