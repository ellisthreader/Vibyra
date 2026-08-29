import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandBack,
  handbackConfirmation,
  handbackPrompt,
} from "../src/lib/reviewHandback.ts";

function pane(overrides = {}) {
  return { id: 3, status: "running", visibility: "visible", ...overrides };
}

test("only a live terminal can be handed anything", () => {
  assert.equal(canHandBack(pane()), true);
  assert.equal(canHandBack(pane({ status: "exited" })), false);
  assert.equal(canHandBack(pane({ status: "suspended" })), false);
  // A hibernated pane's process is parked; it is not reading its PTY.
  assert.equal(canHandBack(pane({ visibility: "hibernated" })), false);
});

test("the brief names the files and the branch", () => {
  const text = handbackPrompt(["src/a.ts", "src/b.ts"], "vibyra/proj-1");
  assert.match(text, /vibyra\/proj-1/);
  assert.match(text, /- src\/a\.ts/);
  assert.match(text, /- src\/b\.ts/);
  assert.match(text, /these files/);
  assert.match(text, /reconcile/);
});

test("one file reads as one file", () => {
  const text = handbackPrompt(["src/a.ts"], "vibyra/proj-1");
  assert.match(text, /this file/);
  assert.doesNotMatch(text, /these files/);
});

test("a long conflict list summarises rather than pasting a wall", () => {
  const paths = Array.from({ length: 14 }, (_, index) => `src/file-${index}.ts`);
  const text = handbackPrompt(paths, "vibyra/proj-1");
  assert.match(text, /…and 6 more/);
  assert.equal(text.includes("src/file-7.ts"), true);
  assert.equal(text.includes("src/file-8.ts"), false);
});

test("the brief prescribes no git command", () => {
  // The agent is already inside the worktree and knows its own branch; a
  // guessed `git rebase <branch>` in a prompt is worse than none at all.
  const text = handbackPrompt(["src/a.ts"], "vibyra/proj-1");
  assert.doesNotMatch(text, /git rebase|git merge|git checkout/);
});

test("the receipt counts what was actually sent", () => {
  assert.match(handbackConfirmation(["a.ts"]), /1 file\b/);
  assert.match(handbackConfirmation(["a.ts", "b.ts"]), /2 files/);
});
