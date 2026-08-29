import assert from "node:assert/strict";
import test from "node:test";

import {
  blockedPaths,
  conflictHeadline,
  landRestCopy,
  retryPaths,
  retrySelection,
} from "../src/lib/reviewConflictPolicy.ts";

function status(...paths) {
  return {
    changed: paths.map((path) => ({ path, kind: "modified", additions: 1, deletions: 0 })),
    truncated: false,
  };
}

const FOUR = status("a.ts", "b.ts", "c.ts", "d.ts");

test("a retry sends the whole changeset minus the blocked files", () => {
  assert.deepEqual(retryPaths(FOUR, undefined, ["b.ts"]), ["a.ts", "c.ts", "d.ts"]);
  assert.deepEqual(blockedPaths(FOUR, undefined, ["b.ts"]), ["b.ts"]);
});

test("a retry never re-sends what the user had already unticked", () => {
  // The load-bearing case: the user left `d.ts` behind on purpose, then hit a
  // conflict on `b.ts`. Retrying from the changeset rather than the selection
  // would land `d.ts` underneath them, which no button here promised.
  const selection = ["a.ts", "b.ts", "c.ts"];
  assert.deepEqual(retryPaths(FOUR, selection, ["b.ts"]), ["a.ts", "c.ts"]);
  assert.deepEqual(retrySelection(FOUR, selection, ["b.ts"]), ["a.ts", "c.ts"]);
});

test("conflicts outside the selection change nothing", () => {
  // `d.ts` is unticked, so it cannot have blocked this land and must not be
  // named in the copy — and with nothing blocked the selection is handed back
  // by identity, so "everything" keeps meaning everything.
  const selection = ["a.ts", "b.ts"];
  assert.deepEqual(blockedPaths(FOUR, selection, ["d.ts"]), []);
  assert.equal(retrySelection(FOUR, selection, ["d.ts"]), selection);
  // And a conflict on a path this changeset does not have at all — the merge
  // reported it, nothing here can tick it — leaves "everything" as everything.
  assert.equal(retrySelection(FOUR, undefined, ["gone.ts"]), undefined);
});

test("a blocked retry materialises the list rather than staying 'everything'", () => {
  const next = retrySelection(FOUR, undefined, ["c.ts"]);
  assert.deepEqual(next, ["a.ts", "b.ts", "d.ts"]);
  // Not `undefined`: leaving it as everything would re-send the file that just
  // failed, which is the one thing the retry exists to avoid.
  assert.notEqual(next, undefined);
});

test("a conflict naming every selected file leaves nothing to retry", () => {
  assert.deepEqual(retryPaths(FOUR, ["a.ts"], ["a.ts"]), []);
  assert.match(landRestCopy([], ["a.ts"]), /Nothing is left to land/);
});

test("the copy names what stays behind instead of counting it", () => {
  const copy = landRestCopy(["a.ts", "c.ts"], ["b.ts"]);
  assert.match(copy, /Lands 2 files/);
  assert.match(copy, /b\.ts stays in the workspace/);
  assert.match(landRestCopy(["a.ts"], ["b.ts"]), /Lands 1 file\./);
});

test("long blocked lists summarise their tail, never their head", () => {
  const many = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
  const copy = landRestCopy(["z.ts"], many);
  assert.match(copy, /a\.ts, b\.ts, c\.ts and 2 more/);
  assert.match(conflictHeadline(many), /a\.ts, b\.ts, c\.ts and 2 more/);
  assert.match(conflictHeadline(["a.ts"]), /Nothing was touched/);
});
