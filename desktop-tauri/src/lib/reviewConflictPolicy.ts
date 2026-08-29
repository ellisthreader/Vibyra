import type { WorktreeStatus } from "../ipc/review";
import { selectedPaths, type FileSelection } from "./reviewSelection.ts";

// What a blocked land leaves you able to do.
//
// A `--3way` merge that cannot apply used to end the review in a sentence.
// The routes out of it are decisions, not rendering, so they live here where a
// test can pin them: which files a retry would actually send, and what the
// panel is allowed to claim it is leaving behind.
//
// Everything is computed against the *selection*, never the whole changeset.
// A user who already unticked eight files and hits a conflict on a ninth must
// not have those eight quietly land underneath the retry.

/** How many blocked files a sentence names before it starts summarising. */
const NAMED_LIMIT = 3;

/** The conflicting files that are actually in this land — in changeset order. */
export function blockedPaths(
  status: WorktreeStatus | null,
  selection: FileSelection,
  conflicts: readonly string[],
): string[] {
  const blocked = new Set(conflicts);
  return selectedPaths(status, selection).filter((path) => blocked.has(path));
}

/** The files a retry would send: the selection, minus what the merge refused. */
export function retryPaths(
  status: WorktreeStatus | null,
  selection: FileSelection,
  conflicts: readonly string[],
): string[] {
  const blocked = new Set(conflicts);
  return selectedPaths(status, selection).filter((path) => !blocked.has(path));
}

/**
 * The selection "Land the rest" installs.
 *
 * Always an explicit list once anything is blocked, never `undefined`: leaving
 * it as "everything" would re-send the file that just failed, and the whole
 * point of the retry is that the user has agreed to leave that one behind.
 * With nothing blocked the selection is handed back untouched, so a caller
 * that asks needlessly cannot cost the user the growing-changeset promise.
 */
export function retrySelection(
  status: WorktreeStatus | null,
  selection: FileSelection,
  conflicts: readonly string[],
): FileSelection {
  if (blockedPaths(status, selection, conflicts).length === 0) return selection;
  return retryPaths(status, selection, conflicts);
}

function nameList(paths: readonly string[]): string {
  const named = paths.slice(0, NAMED_LIMIT).join(", ");
  const rest = paths.length - NAMED_LIMIT;
  return rest > 0 ? `${named} and ${rest} more` : named;
}

function fileCount(n: number): string {
  return n === 1 ? "1 file" : `${n} files`;
}

/**
 * What the retry costs, said out loud before the button does it.
 *
 * The blocked files are named rather than counted: "3 files stay behind" is
 * the kind of sentence a user agrees to without knowing which three.
 */
export function landRestCopy(kept: readonly string[], blocked: readonly string[]): string {
  if (kept.length === 0) {
    return `Nothing else to approve — ${nameList(blocked)} is the whole selection.`;
  }
  return `Puts ${fileCount(kept.length)} into your project. ${nameList(blocked)} stays in the agent's copy, untouched.`;
}

/**
 * The headline over the routes: what stopped, in the user's terms.
 *
 * "Nothing was touched" is the load-bearing half. A land is all-or-nothing
 * over the selection, so a conflict costs the user no state at all — and a
 * reader who does not know that reads the routes below as damage control.
 */
export function conflictHeadline(blocked: readonly string[]): string {
  return `Didn't fit — your project has its own changes in ${nameList(blocked)}. Nothing was touched.`;
}
