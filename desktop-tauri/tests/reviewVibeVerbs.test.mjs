import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

// The 2026-08-29 re-skin's promises, pinned. The Review dock speaks three
// colour-coded verbs — Approve, Preview (later phase), Reject — plus a GitHub
// share that walks an unconnected user through connecting rather than going
// dead. None of that survives by accident; each promise below broke a real
// user at least once as a git word or a disabled button.

test("share on GitHub is never disabled by readiness", () => {
  const actions = source("../src/components/review/ReviewActions.tsx");

  // The disabled expression may gate on busy and empty changesets only —
  // an unconnected account must reach the walk-through, not a dead button.
  const share = actions.slice(actions.indexOf('className="btn review-actions__github"'));
  assert.match(share, /disabled=\{busy \|\| summary\.files === 0\}/);
  // Not connected renders the connect sheet in the same open state, and the
  // moment a re-check comes back ready the PR sheet takes over.
  assert.match(actions, /githubReady \? \(\s*<ReviewPrSheet/);
  assert.match(actions, /<GithubConnectSheet/);
});

test("connecting stays inside GitHub's own tool", () => {
  const sheet = source("../src/components/review/GithubConnectSheet.tsx");

  // The sheet copies the command for the user's own terminal. It never runs
  // an auth command itself and never touches a token — the same boundary the
  // provider accounts keep.
  assert.match(sheet, /gh auth login/);
  assert.match(sheet, /writeClipboardText/);
  assert.doesNotMatch(sheet, /createTerminal|invoke\(/);
  assert.match(sheet, /refreshGithub/);
});

test("github readiness is keyed by project and host-checked", () => {
  const store = source("../src/state/reviewStore.ts");
  const actions = source("../src/components/review/ReviewActions.tsx");
  const native = source("../src-tauri/crates/vibyra-core/src/github.rs");

  // A slow probe for the previous project must never land on the current one.
  assert.match(store, /github: \{ root: projectRoot, status \}/);
  assert.match(store, /probe === githubProbe/);
  assert.match(actions, /state\.github\?\.root === projectRoot/);
  // And any non-empty origin is not enough: gh can only open PRs on github.com.
  assert.match(native, /https:\/\/github\.com\//);
  assert.match(native, /git@github\.com:/);
  assert.match(native, /ssh:\/\/git@github\.com\//);
  assert.match(actions, /github\.originGithub/);
});

test("the PR sheet cannot be dismissed mid-push", () => {
  const sheet = source("../src/components/review/ReviewPrSheet.tsx");
  // Escape and the backdrop go through the same busy guard as Cancel; the
  // commit/push/PR would otherwise keep running invisibly.
  assert.match(sheet, /const closeUnlessBusy = \(\) => \{\s*if \(!busy\) onClose\(\);/);
  assert.match(sheet, /useModalFocus\(modalRef, true, closeUnlessBusy\)/);
  assert.match(sheet, /className="modal-backdrop" onClick=\{closeUnlessBusy\}/);
});

test("a merge is bound to its own repository and its scratch files collide with nothing", () => {
  const merge = source("../src-tauri/crates/vibyra-core/src/review/merge.rs");
  const scratch = source("../src-tauri/crates/vibyra-core/src/review/scratch.rs");

  // A vibyra/* branch name proves ours, not *this repo's* — both destructive
  // paths check identity before touching anything.
  assert.match(merge, /same_repository\(&repo, &source\)\?/);
  assert.match(merge, /same_repository\(&repo, &git_root\(worktree\)\?\)\?/);
  assert.match(scratch, /rev-parse", "--git-common-dir/);
  // The patch and index names are unique per call and are written create_new,
  // so an existing sibling file can never be overwritten and deleted.
  assert.match(scratch, /std::process::id\(\)/);
  assert.match(scratch, /create_new\(true\)/);
  assert.match(scratch, /\.vibyra-merge\.patch/);
  assert.match(scratch, /snapshot-merge-/);
});

test("the fleet speaks sentences, not git words", () => {
  const row = source("../src/components/review/fleet/ReviewFleetRow.tsx");
  const header = source("../src/components/review/fleet/ReviewFleetHeader.tsx");
  const marks = source("../src/components/review/ReviewFileRow.tsx");

  assert.match(row, /Ready to review/);
  assert.match(row, /Still working…/);
  assert.match(row, /Terminal closed — work saved/);
  // The row's actions are the two colour-coded verbs, and reject pauses
  // in place before it deletes anything.
  assert.match(row, /act--approve/);
  assert.match(row, /act--reject/);
  assert.match(row, /discardCopy\(row\.summary/);
  // The masthead lost its count line and refresh control (Ellis, 2026-08-29);
  // it renders no control at all, only the title and its one sentence.
  assert.doesNotMatch(header, /icon-btn|RestartIcon|<button|fleet-head__facts/);
  // File kinds are words a non-git user can read.
  assert.match(marks, /added: "new"/);
  assert.match(marks, /deleted: "gone"/);
});
