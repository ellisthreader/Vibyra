import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * `githubCreatePr` used to hardcode `base: null`, so every pull request
 * targeted the repository default even when the agent was launched from a
 * feature branch — which makes the PR propose the feature's whole history and
 * leaves it unreviewable. The Rust always accepted a base; only the renderer
 * refused to send one.
 */
test("the base branch travels from the picker to gh", () => {
  const ipc = source("../src/ipc/github.ts");
  const sheet = source("../src/components/review/ReviewPrSheet.tsx");
  const command = source("../src-tauri/src/commands/github.rs");
  const core = source("../src-tauri/crates/vibyra-core/src/github.rs");

  assert.doesNotMatch(ipc, /base: null \}/, "the base must not be hardcoded any more");
  assert.match(ipc, /invoke\("github_create_pr", \{ worktree, title, body, base \}\)/);
  assert.match(sheet, /githubCreatePr\(worktree, title\.trim\(\), body, base\)/);
  assert.match(command, /base: Option<String>/);
  assert.match(core, /if let Some\(base\) = base \{\s*command\.args\(\["--base", base\]\);/);
});

/**
 * The picker opens on what gh would have chosen on its own, so the default
 * behaviour is visibly unchanged; and a failed listing degrades to exactly the
 * old behaviour rather than blocking the sheet.
 */
test("the picker defaults to the repository default and survives a failed listing", () => {
  const sheet = source("../src/components/review/ReviewPrSheet.tsx");
  const branches = source("../src-tauri/crates/vibyra-core/src/github/branches.rs");

  assert.match(sheet, /setBase\(next\.defaultBranch\)/);
  assert.match(sheet, /setBases\(\{ defaultBranch: null, names: \[\], truncated: false \}\)/);
  // A default that fell off the page is still offerable, and our own branches
  // are never a base — one of them is the pull request's own head.
  assert.match(branches, /names\.insert\(0, default\.clone\(\)\)/);
  assert.match(branches, /!name\.starts_with\("vibyra\/"\)/);
  assert.match(branches, /const PER_PAGE: usize = 100/);
});

/**
 * A pull request used to be a one-shot exit. Its state is now readable from
 * the sheet — but on demand only: each call is a `gh` process launch, and a
 * timer would spend the user's API budget re-learning an unread answer.
 */
test("pull request state is fetched on a button, never polled", () => {
  const status = source("../src/components/review/ReviewPrStatus.tsx");
  const state = source("../src-tauri/crates/vibyra-core/src/github/pr_state.rs");

  assert.match(status, /onClick=\{\(\) => void check\(\)\}/);
  assert.doesNotMatch(status, /setInterval|setTimeout/, "no polling on this sheet");
  // A red run is never hidden behind a green one, and an unfinished run reads
  // as pending rather than passing.
  assert.match(state, /"FAILURE" \| "ERROR"[\s\S]{0,120}return "failing"/);
  assert.match(state, /_ => pending = true/);
});

/**
 * The product commitment: GitHub authorization stays with the official CLI.
 * Every new call shells out to `gh` and none of them may accept, read, store
 * or forward a token.
 */
test("no token ever passes through Vibyra", () => {
  const branches = source("../src-tauri/crates/vibyra-core/src/github/branches.rs");
  const state = source("../src-tauri/crates/vibyra-core/src/github/pr_state.rs");
  const command = source("../src-tauri/src/commands/github.rs");

  for (const file of [branches, state, command]) {
    // The prose above these modules states the commitment; this catches the
    // code that would break it.
    assert.doesNotMatch(file, /GH_TOKEN|GITHUB_TOKEN|Authorization|Bearer|\.env\("(?!PATH)/);
  }
  assert.match(branches, /run\(gh\(path\)/);
  assert.match(state, /run\(gh\(path\)/);
});
