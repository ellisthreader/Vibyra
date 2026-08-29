import assert from "node:assert/strict";
import test from "node:test";

import { parseDiff } from "../src/components/review/diff/diffParse.ts";
import { buildRows } from "../src/components/review/diff/diffRows.ts";
import { OVERSCAN, rowWindow } from "../src/components/review/diff/diffWindow.ts";

/** A hunk with `lead` context lines, one change, then `trail` context lines. */
function padded(lead, trail) {
  const before = Array.from({ length: lead }, (_, i) => ` line ${i}`);
  const after = Array.from({ length: trail }, (_, i) => ` tail ${i}`);
  const old = lead + trail + 1;
  return parseDiff(
    [`@@ -1,${old} +1,${old} @@`, ...before, "-was", "+now", ...after].join("\n"),
  );
}

test("a long unchanged run collapses to one gap row, three lines either side", () => {
  const { rows } = buildRows(padded(20, 20));
  const kinds = rows.map((row) => row.type);
  assert.equal(kinds[0], "hunk");
  assert.deepEqual(kinds.slice(1), ["gap", ...new Array(8).fill("line"), "gap"]);
  const gaps = rows.filter((row) => row.type === "gap");
  assert.deepEqual(
    gaps.map((gap) => gap.count),
    [17, 17],
  );
});

test("expanding a gap replaces it in place, and leaves the other one shut", () => {
  const parsed = padded(20, 20);
  const shut = buildRows(parsed);
  const first = shut.rows.find((row) => row.type === "gap");
  const opened = buildRows(parsed, new Set([first.key]));
  assert.equal(opened.rows.filter((row) => row.type === "gap").length, 1);
  assert.equal(opened.rows.length, shut.rows.length + 16);
});

test("a run too short to be worth eliding is simply shown", () => {
  // One hidden line saves no height, so it costs a gap row for nothing.
  const { rows } = buildRows(padded(4, 0));
  assert.equal(rows.some((row) => row.type === "gap"), false);
});

test("word marks ride along on the rows they belong to", () => {
  const { rows } = buildRows(parseDiff(["@@ -1,1 +1,1 @@", "-let a = 1;", "+let a = 2;"].join("\n")));
  const lines = rows.filter((row) => row.type === "line");
  assert.equal(lines[0].text.slice(lines[0].marks[0].start, lines[0].marks[0].end), "1");
  assert.equal(lines[1].text.slice(lines[1].marks[0].start, lines[1].marks[0].end), "2");
});

test("the gutter widens to the longest line number, never below two digits", () => {
  assert.equal(buildRows(parseDiff("@@ -1,1 +1,1 @@\n-a\n+b")).digits, 2);
  assert.equal(buildRows(parseDiff("@@ -998,4 +998,4 @@\n-a\n+b")).digits, 4);
});

test("nothing to show becomes a note, and git's binary notice is that note", () => {
  assert.deepEqual(
    buildRows(parseDiff("")).rows.map((row) => row.text),
    ["No changes to show."],
  );
  const binary = buildRows(parseDiff("Binary files a/x.png and b/x.png differ"));
  assert.equal(binary.rows.length, 1);
  assert.equal(binary.rows[0].type, "note");
});

test("the hunk range is rebuilt rather than echoed, so a heading cannot leak into it", () => {
  const { rows } = buildRows(parseDiff("@@ -3,1 +3,1 @@ fn boot() { // @@ here\n-a\n+b"));
  assert.equal(rows[0].range, "@@ -3,1 +3,1 @@");
  assert.equal(rows[0].heading, "fn boot() { // @@ here");
});

test("the window is a function of the scroll offset, never of the diff's size", () => {
  const small = rowWindow(500, 20, 1000, 200);
  const huge = rowWindow(500_000, 20, 1000, 200);
  assert.deepEqual(small, huge);
  // Fifty rows above the fold, ten on screen, overscan either side.
  assert.equal(small.start, 50 - OVERSCAN);
  assert.equal(small.end, 50 + 10 + OVERSCAN + 1);
});

test("the window clamps at both ends and survives an unmeasured row height", () => {
  assert.deepEqual(rowWindow(0, 20, 0, 200), { start: 0, end: 0 });
  assert.deepEqual(rowWindow(4, 20, 0, 200), { start: 0, end: 4 });
  assert.deepEqual(rowWindow(100, 20, -50, 200), { start: 0, end: 19 });
  assert.equal(rowWindow(100, 20, 100_000, 200).end, 100);
  // No probe reading yet: enough rows to paint, and to measure one.
  assert.deepEqual(rowWindow(500, 0, 0, 200), { start: 0, end: OVERSCAN * 2 });
});
