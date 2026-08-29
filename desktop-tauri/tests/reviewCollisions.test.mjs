import assert from "node:assert/strict";
import test from "node:test";

import { collisions, rangesFromDiff } from "../src/lib/reviewCollisions.ts";

function workspace(key, paneId, files, landed = false) {
  return { key, paneId, label: `claude #${paneId}`, files, landed };
}

function file(path, ranges, kind = "modified") {
  return ranges === undefined ? { path, kind } : { path, kind, ranges };
}

function range(start, end) {
  return { start, end };
}

test("workspaces on disjoint file sets never collide", () => {
  const found = collisions([
    workspace("a", 1, [file("src/a.ts", [range(1, 40)])]),
    workspace("b", 2, [file("src/b.ts", [range(1, 40)])]),
  ]);
  assert.deepEqual(found, []);
});

test("a path only one workspace changed is work, not a collision", () => {
  const found = collisions([
    workspace("a", 1, [file("src/a.ts", [range(1, 5)]), file("src/only.ts", [range(1, 5)])]),
    workspace("b", 2, [file("src/a.ts", [range(1, 5)])]),
  ]);
  assert.deepEqual(
    found.map((c) => c.path),
    ["src/a.ts"],
  );
});

test("far-apart hunks in one file stay quiet at touch", () => {
  // The most important rule here: two agents editing different functions in
  // one file is normal. Reporting it as a problem makes the radar noise.
  const found = collisions([
    workspace("a", 1, [file("src/lib/dockLayout.ts", [range(10, 20)])]),
    workspace("b", 2, [file("src/lib/dockLayout.ts", [range(120, 140)])]),
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].level, "touch");
});

test("overlapping hunks are an overlap, and the context gutter counts", () => {
  const overlapping = collisions([
    workspace("a", 1, [file("src/x.ts", [range(10, 30)])]),
    workspace("b", 2, [file("src/x.ts", [range(25, 40)])]),
  ]);
  assert.equal(overlapping[0].level, "overlap");

  // Three lines of diff context sit either side of a hunk, so ranges that
  // close to each other share context lines and cannot apply independently.
  const gutter = collisions([
    workspace("a", 1, [file("src/x.ts", [range(10, 20)])]),
    workspace("b", 2, [file("src/x.ts", [range(23, 30)])]),
  ]);
  assert.equal(gutter[0].level, "overlap");

  const clear = collisions([
    workspace("a", 1, [file("src/x.ts", [range(10, 20)])]),
    workspace("b", 2, [file("src/x.ts", [range(24, 30)])]),
  ]);
  assert.equal(clear[0].level, "touch");
});

test("only the range that meets matters, not the whole file", () => {
  const found = collisions([
    workspace("a", 1, [file("src/x.ts", [range(1, 5), range(200, 210)])]),
    workspace("b", 2, [file("src/x.ts", [range(100, 110), range(205, 220)])]),
  ]);
  assert.equal(found[0].level, "overlap");
});

test("an overlap against a landed workspace is a conflict", () => {
  const found = collisions([
    workspace("a", 1, [file("src/x.ts", [range(10, 30)])], true),
    workspace("b", 2, [file("src/x.ts", [range(25, 40)])]),
  ]);
  assert.equal(found[0].level, "conflict");
  assert.equal(found[0].workspaces[0].landed, true);
});

test("a landed workspace whose hunks are far away is still only touch", () => {
  // Landing does not create a collision; it only sharpens one that exists.
  const found = collisions([
    workspace("a", 1, [file("src/x.ts", [range(10, 20)])], true),
    workspace("b", 2, [file("src/x.ts", [range(300, 320)])]),
  ]);
  assert.equal(found[0].level, "touch");
});

test("a deletion against a modification is always at least an overlap", () => {
  const found = collisions([
    workspace("a", 1, [file("src/gone.ts", [range(1, 4)], "deleted")]),
    workspace("b", 2, [file("src/gone.ts", [range(900, 910)])]),
  ]);
  assert.equal(found[0].level, "overlap");

  const landed = collisions([
    workspace("a", 1, [file("src/gone.ts", [range(1, 4)], "deleted")], true),
    workspace("b", 2, [file("src/gone.ts", [range(900, 910)])]),
  ]);
  assert.equal(landed[0].level, "conflict");
});

test("three workspaces on one path are reported once, with all three named", () => {
  const found = collisions([
    workspace("c", 7, [file("src/x.ts", [range(1, 5)])]),
    workspace("a", 3, [file("src/x.ts", [range(50, 60)])]),
    workspace("b", 5, [file("src/x.ts", [range(55, 70)])]),
  ]);
  assert.equal(found.length, 1);
  assert.deepEqual(
    found[0].workspaces.map((party) => party.paneId),
    [3, 5, 7],
  );
  // The worst pair sets the level even when another pair is only a touch.
  assert.equal(found[0].level, "overlap");
});

test("a path with no parsed ranges degrades to touch, never to a guess", () => {
  const found = collisions([
    workspace("a", 1, [file("src/x.ts", undefined)]),
    workspace("b", 2, [file("src/x.ts", [range(1, 400)])]),
  ]);
  assert.equal(found[0].level, "touch");

  // An empty array is a parsed answer, not a missing one — and still nothing
  // to intersect with.
  const parsedEmpty = collisions([
    workspace("a", 1, [file("src/x.ts", [])]),
    workspace("b", 2, [file("src/x.ts", [range(1, 400)])]),
  ]);
  assert.equal(parsedEmpty[0].level, "touch");
});

test("output is worst-first then by path, whatever order the input arrives in", () => {
  const input = [
    workspace("a", 1, [
      file("z/quiet.ts", [range(1, 2)]),
      file("m/bad.ts", [range(1, 20)]),
      file("a/worst.ts", [range(1, 20)]),
    ]),
    workspace("b", 2, [
      file("z/quiet.ts", [range(500, 505)]),
      file("m/bad.ts", [range(10, 30)]),
      file("a/worst.ts", [range(10, 30)]),
    ], true),
  ];
  const order = collisions(input).map((c) => `${c.level}:${c.path}`);
  assert.deepEqual(order, ["conflict:a/worst.ts", "conflict:m/bad.ts", "touch:z/quiet.ts"]);
  // Same data, reversed input: the radar reorders under a live watcher only
  // when the data changes, never because a map was walked differently.
  assert.deepEqual(collisions([...input].reverse()).map((c) => c.path), [
    "a/worst.ts",
    "m/bad.ts",
    "z/quiet.ts",
  ]);
});

test("ranges come off the hunk headers alone", () => {
  const diff = [
    "diff --git a/src/x.ts b/src/x.ts",
    "--- a/src/x.ts",
    "+++ b/src/x.ts",
    "@@ -10,4 +12,6 @@ function one() {",
    "+  added();",
    "@@ -80,3 +90 @@",
    " context",
    "@@ -200,5 +214,0 @@ function three() {",
  ].join("\n");
  assert.deepEqual(rangesFromDiff(diff), [
    { start: 12, end: 17 },
    { start: 90, end: 90 },
    // A `+c,0` hunk adds nothing but still occupies the seam at `c`.
    { start: 214, end: 214 },
  ]);
  assert.deepEqual(rangesFromDiff("no hunks here"), []);
});
