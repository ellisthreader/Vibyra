import assert from "node:assert/strict";
import test from "node:test";

import {
  allPaths,
  isEverything,
  isSelected,
  selectedPaths,
  selectionCount,
  toggleSelection,
} from "../src/lib/reviewSelection.ts";

function status(...paths) {
  return {
    changed: paths.map((path) => ({ path, kind: "modified", additions: 1, deletions: 0 })),
    truncated: false,
  };
}

const THREE = status("a.ts", "b.ts", "c.ts");

test("no stored selection means every file", () => {
  assert.deepEqual(selectedPaths(THREE, undefined), ["a.ts", "b.ts", "c.ts"]);
  assert.equal(selectionCount(THREE, undefined), 3);
  assert.equal(isEverything(undefined), true);
  assert.equal(isSelected(undefined, "b.ts"), true);
});

test("unticking one file materialises the rest, in changeset order", () => {
  const next = toggleSelection(THREE, undefined, "b.ts");
  assert.deepEqual(next, ["a.ts", "c.ts"]);
  assert.equal(isSelected(next, "b.ts"), false);
  assert.equal(selectionCount(THREE, next), 2);
});

test("re-ticking the last one returns to undefined, not to a frozen full list", () => {
  // Load-bearing: a changeset grows under a working agent. A selection that
  // happened to list every current path would quietly stop covering the files
  // that arrived after — "everything" has to keep meaning everything.
  const partial = toggleSelection(THREE, undefined, "b.ts");
  const restored = toggleSelection(THREE, partial, "b.ts");
  assert.equal(restored, undefined);
  assert.equal(isEverything(restored), true);

  const grown = status("a.ts", "b.ts", "c.ts", "d.ts");
  assert.deepEqual(selectedPaths(grown, restored), ["a.ts", "b.ts", "c.ts", "d.ts"]);
});

test("a stale path in the selection never reaches a land", () => {
  // The file was unticked, then the agent deleted it. The selection still
  // names it; the changeset no longer does, and the changeset wins.
  const selection = ["a.ts", "gone.ts"];
  assert.deepEqual(selectedPaths(THREE, selection), ["a.ts"]);
  assert.equal(selectionCount(THREE, selection), 1);
});

test("selecting nothing is a valid state to sit in", () => {
  let selection = toggleSelection(THREE, undefined, "a.ts");
  selection = toggleSelection(THREE, selection, "b.ts");
  selection = toggleSelection(THREE, selection, "c.ts");
  assert.deepEqual(selection, []);
  assert.equal(selectionCount(THREE, selection), 0);
});

test("an empty or missing changeset never throws", () => {
  assert.deepEqual(allPaths(null), []);
  assert.deepEqual(selectedPaths(null, undefined), []);
  assert.deepEqual(selectedPaths(null, ["a.ts"]), []);
  assert.equal(toggleSelection(null, undefined, "a.ts"), undefined);
});

test("order always follows the changeset, never the click order", () => {
  let selection = toggleSelection(THREE, undefined, "a.ts");
  selection = toggleSelection(THREE, selection, "a.ts");
  // Re-ticking the only missing file collapses back to "everything".
  assert.equal(selection, undefined);

  let picked = toggleSelection(THREE, undefined, "a.ts");
  picked = toggleSelection(THREE, picked, "c.ts");
  picked = toggleSelection(THREE, picked, "a.ts");
  assert.deepEqual(picked, ["a.ts", "b.ts"]);
});
