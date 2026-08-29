import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * A review is only real if the worktree's identity survives the whole way:
 * created at launch → carried on the session → kept on the pane → written to
 * session.json → handed back to the review commands, even after a restart.
 */
test("the safe workspace survives from launch to review", () => {
  const workspace = source("../src-tauri/crates/vibyra-core/src/workspace_ref.rs");
  const pty = source("../src-tauri/crates/vibyra-core/src/pty/mod.rs");
  const create = source("../src-tauri/src/commands/terminal.rs");
  const spawn = source("../src/state/terminalSpawnActions.ts");
  const store = source("../src-tauri/src/session_store.rs");
  const restore = source("../src/lib/sessionRestore.ts");

  assert.match(workspace, /pub struct SafeWorkspace \{/);
  assert.match(workspace, /pub base_commit: String/);
  assert.match(pty, /pub workspace: Option<crate::workspace::SafeWorkspaceRef>/);
  assert.match(create, /info\.workspace = prepared\.workspace/);
  assert.match(spawn, /workspace: info\.workspace \?\? null/);
  assert.match(store, /pub workspace: Option<SafeWorkspaceRef>/);
  assert.match(restore, /workspace: pane\.workspace \?\? null/g);
});

/**
 * Merging lands the changes as ordinary edits for the user to commit. Vibyra
 * never commits to the user's branch — the same contract safe mode keeps on
 * the way in — and it checks the whole patch before applying any of it, so a
 * conflict reports files and changes nothing.
 *
 * Three-way is what lets a merge survive the project moving on in a different
 * hunk of the same file, which plain apply fails on context drift alone. It
 * does not soften the contract: `--3way` carries both invocations, the check
 * still runs first, and because three-way can exit 0 having resolved *with
 * markers*, the stderr it wrote is read too before anything is applied.
 */
test("merge is check-first, all-or-nothing, and never commits", () => {
  const merge = source("../src-tauri/crates/vibyra-core/src/review/merge.rs");

  // Both invocations are three-way, and the check is the one that comes first.
  assert.match(merge, /"apply", "--3way"/);
  assert.match(
    merge,
    /three_way\(repo, index, &\["--check", patch\.as_ref\(\)\]\)\?;[\s\S]*?three_way\(repo, index, &\[patch\.as_ref\(\)\]\)\?;/,
    "the whole patch must still be checked before any of it is applied",
  );
  // A clean exit is not enough on its own — markers count as a refusal.
  assert.match(merge, /conflicts::unresolved\(&noise\)/);
  assert.doesNotMatch(merge, /"commit"/, "merging must leave committing to the user");
});

/**
 * The worktree path arrives from the renderer, so the branch it is on is the
 * proof of ownership: only `vibyra/*` branches may be merged, discarded, or
 * pushed into a pull request.
 */
test("review and PR creation refuse anything but vibyra branches", () => {
  const review = source("../src-tauri/crates/vibyra-core/src/review/mod.rs");
  const github = source("../src-tauri/crates/vibyra-core/src/github.rs");

  assert.match(review, /starts_with\("vibyra\/"\)/);
  // One guard, not two copies: PR creation derives the branch from the
  // worktree's HEAD through the same check the review actions use.
  assert.match(github, /crate::review::vibyra_branch\(worktree\)/);
});

/**
 * Agents rarely commit, so the branch tip is still the launch snapshot at
 * review time. A PR pushed without committing the pending work first would
 * open empty — the worst kind of working-looking button.
 */
test("a pull request carries the uncommitted work", () => {
  const github = source("../src-tauri/crates/vibyra-core/src/github.rs");
  assert.match(github, /commit_pending\(worktree, title\)\?;[\s\S]*?"push", "-u", "origin"/);
});

/**
 * GitHub authorization stays with the official CLI, exactly as provider
 * accounts keep authorization with theirs. Vibyra shells out to `gh` and
 * stores nothing; the only URL it will open is the one gh printed.
 */
test("github integration owns no credentials", () => {
  const core = source("../src-tauri/crates/vibyra-core/src/github.rs");
  const command = source("../src-tauri/src/commands/github.rs");

  assert.match(core, /Command::new\("gh"\)/);
  assert.doesNotMatch(core, /keyring|GITHUB_TOKEN|GH_TOKEN|hosts\.yml/);
  assert.match(command, /url\.starts_with\("https:\/\/github\.com\/"\)/);
});

/**
 * Discarding removes the worktree first and closes the pane second.
 *
 * The order used to be the other way round, on the reasoning that a terminal
 * running inside a deleted folder is a broken shell. It is — but closing
 * first meant a native failure left the pane gone *and* the worktree
 * stranded, with nothing in the app able to reach it again. Removing first
 * fails safe: the pane and its route into the panel both survive, and the
 * close still follows immediately on success, so no shell is left sitting in
 * a folder that has gone.
 */
test("discard removes the worktree before closing its pane", () => {
  const actions = source("../src/state/reviewLandActions.ts");
  assert.match(actions, /reviewDiscard\([\s\S]*?close\(pane\.id\)/);
  // The failing path is the whole point: a rejected removal must not have
  // closed anything, so the close may not be reached before the await above.
  assert.doesNotMatch(actions, /close\(pane\.id\)[\s\S]*?await reviewDiscard\(/);
});

/**
 * The tool is reachable everywhere tools live: the dock's union and tab
 * strip, the palette's view entries, and the pane header's chip.
 */
test("review is a first-class dock tool", () => {
  const layout = source("../src/lib/dockLayout.ts");
  const tabs = source("../src/components/dock/DockTabs.tsx");
  const palette = source("../src/components/layout/paletteViewEntries.ts");
  const pane = source("../src/components/terminal/TerminalPaneCard.tsx");

  assert.match(layout, /"files" \| "review"/);
  assert.match(tabs, /id: "review", label: "Review"/);
  assert.match(palette, /id: "review", label: "Review"/);
  assert.match(pane, /openForPane\(pane\.id\)/);
});
