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
 */
test("merge is check-first, all-or-nothing, and never commits", () => {
  const merge = source("../src-tauri/crates/vibyra-core/src/review/merge.rs");

  assert.match(merge, /"apply", "--check"/);
  assert.match(merge, /\["apply", patch\.as_ref\(\)\]/);
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
 * accounts keep authorization with theirs. Vibyra may remove ambient token
 * variables so `gh` uses its own account, but never reads or persists a token;
 * the only URL it will open is the one gh printed.
 */
test("github integration owns no credentials", () => {
  const core = source("../src-tauri/crates/vibyra-core/src/github.rs");
  const command = source("../src-tauri/src/commands/github.rs");

  assert.match(core, /Command::new\("gh"\)/);
  assert.match(core, /command\.env_remove\(name\)/);
  assert.doesNotMatch(
    core,
    /\["auth", "token"\]|keyring::|hosts\.yml|serde_json::to_|std::fs::write|File::create/,
  );
  assert.match(command, /url\.starts_with\("https:\/\/github\.com\/"\)/);
});

/**
 * A terminal still running inside a deleted folder is a broken shell, so
 * discarding closes the pane first and only then removes the worktree.
 */
test("discard closes the pane before deleting its folder", () => {
  const store = source("../src/state/reviewStore.ts");
  assert.match(store, /close\(pane\.id\);[\s\S]*?reviewDiscard\(/);
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

/**
 * Safe-mode launches should land where their isolated changes are visible.
 * The dock opens only after spawn succeeds, using the new focused pane rather
 * than a stale review selection. Shared launches keep the user's current dock.
 */
test("a successful safe-mode launch opens Review for its new pane", () => {
  const launch = source("../src/lib/configuredLaunch.ts");

  assert.match(
    launch,
    /if \(!launched\) break;[\s\S]*?newestPaneId = useTerminalStore\.getState\(\)\.focusedId;/,
  );
  assert.match(
    launch,
    /if \(launch\.safeMode && newestPaneId !== null\) \{[\s\S]*?openForPane\(newestPaneId\);/,
  );
});

test("the review footer presents one clear decision and a GitHub integration route", () => {
  const actions = source("../src/components/review/ReviewActions.tsx");
  const row = source("../src/components/review/ReviewFileRow.tsx");

  assert.match(actions, />\s*Reject selected\s*</);
  assert.match(actions, /"Approve all"/);
  assert.match(actions, /useGithubIntegrationStore/);
  assert.match(actions, /void refreshGithubIntegration\(\)/);
  assert.match(actions, /openSettingsSection\("integrations"\)/);
  assert.match(actions, /integration\.permissionsReady/);
  assert.match(actions, /Connect GitHub in Integrations/);
  assert.match(actions, /No GitHub remote/);
  assert.match(actions, /This project has no origin GitHub remote/);
  assert.match(actions, /<GithubIcon size=\{17\} \/>/);
  assert.match(actions, /review-actions__lock/);
  assert.match(row, /aria-pressed=\{selected\}/);
});

test("reject selected is guarded natively and refreshes the review", () => {
  const core = source("../src-tauri/crates/vibyra-core/src/review/merge.rs");
  const commands = source("../src-tauri/src/commands/review.rs");
  const registry = source("../src-tauri/src/commands/registry.rs");
  const store = source("../src/state/reviewStore.ts");

  assert.match(core, /pub fn reject_file[\s\S]*?vibyra_branch\(worktree\)\?/);
  assert.match(core, /find\(\|change\| change\.path == path\)/);
  assert.match(commands, /pub async fn review_reject_file/);
  assert.match(registry, /review::review_reject_file/);
  assert.match(store, /await reviewRejectFile[\s\S]*?await get\(\)\.refresh\(pane\)/);
});
