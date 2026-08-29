import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function everySourceFile(dir = SRC, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) everySourceFile(path, found);
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * Safe mode leaks a worktree and a branch every time a pane is closed with its
 * X, and until this section existed nothing in the app could even see one. The
 * section has to be reachable: an id in the union, an entry in the nav, and a
 * pane bound to that id — miss any one and the pane is dead code.
 */
test("Safe workspaces is a reachable settings section", () => {
  const store = source("../src/state/workspaceStore.ts");
  const modal = source("../src/components/settings/SettingsModal.tsx");

  assert.match(store, /\|\s*"workspaces"/);
  assert.match(modal, /id: "workspaces", label: "Safe workspaces"/);
  assert.match(modal, /workspaces: <SettingsWorkspacesPane \/>/);
});

/**
 * The disk figure is the one number this pane cannot honestly produce for
 * itself. A renderer-side walk would be tens of thousands of IPC round trips
 * across a full checkout, so it goes native and bounded — and a walk that ran
 * out of budget must say "at least" rather than present a floor as a total.
 */
test("disk size is measured natively, bounded, and never fabricated", () => {
  const pane = source("../src/components/settings/SettingsWorkspacesPane.tsx");
  const native = source("../src-tauri/src/commands/workspaces.rs");

  assert.match(pane, /workspacesDiskUsage\(/);
  assert.doesNotMatch(pane, /readDir|fsList|readdir/, "the walk must not happen in the renderer");
  assert.match(pane, /usage\.complete \? "" : "at least "/);
  // Off the IPC thread, and with a ceiling the walk actually respects.
  assert.match(native, /run_blocking\(move \|\| Ok\(measure/);
  assert.match(native, /const MAX_ENTRIES/);
  assert.match(native, /if \*budget == 0 \{\s*return bytes;/);
});

/**
 * Everything on this pane deletes work. The plan asked for a reaper at start
 * up too; it is deliberately absent, because a delete the user did not ask for
 * is not housekeeping. `reviewPruneWorktrees` must therefore be reachable from
 * nowhere but the pane's own button.
 */
test("nothing sweeps workspaces automatically", () => {
  const callers = everySourceFile()
    .filter((path) => !path.endsWith(join("ipc", "review.ts")))
    .filter((path) => readFileSync(path, "utf8").includes("reviewPruneWorktrees"));

  assert.deepEqual(
    callers.map((path) => path.slice(SRC.length + 1)),
    [join("components", "settings", "SettingsWorkspacesPane.tsx")],
  );
  const pane = source("../src/components/settings/SettingsWorkspacesPane.tsx");
  assert.match(pane, /onClick=\{\(\) => void prune\(\)\}/);
  assert.doesNotMatch(pane, /useEffect\([\s\S]{0,80}prune\(\)/);
});

/**
 * A destructive action never sits at the weight of a constructive one, and
 * always states what it deletes first. From this pane the user can see neither
 * the folder nor the branch, so the confirm has to name both.
 */
test("discard is quiet, confirmed, and names what it deletes", () => {
  const row = source("../src/components/settings/SafeWorkspaceRow.tsx");

  assert.match(row, /className="btn btn--ghost"[\s\S]*?onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.doesNotMatch(row, /Discard[\s\S]{0,200}btn--primary/);
  assert.match(row, /Deletes the folder <code>\{row\.path\}<\/code>/);
  assert.match(row, /the branch\{" "\}\s*<code>\{row\.branch\}<\/code>/);
  assert.match(row, /cannot be undone/);
});

/**
 * A pane still owning the workspace has to be closed in the same operation —
 * only the review store can do that, and a pane left pointing at a deleted
 * folder would be worse than the leak this pane exists to close.
 */
test("discarding an attached workspace goes through the review store", () => {
  const model = source("../src/components/settings/safeWorkspaces.ts");

  assert.match(model, /if \(row\.pane\) \{\s*await useReviewStore\.getState\(\)\.discard\(/);
  assert.match(model, /await reviewDiscard\(row\.project\.root/);
});
