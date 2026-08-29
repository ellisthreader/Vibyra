import assert from "node:assert/strict";
import test from "node:test";

import { parseDiff } from "../src/components/review/diff/diffParse.ts";

const SIMPLE = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1a2b3c4..5d6e7f8 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -3,3 +3,4 @@ export function boot() {",
  " const port = 3000;",
  "-  listen(port);",
  "+  listen(port, host);",
  "+  log(port);",
  " }",
  "",
].join("\n");

test("a hunk header sets both line counters, and every line gets its number", () => {
  const { hunks, meta } = parseDiff(SIMPLE);
  assert.equal(hunks.length, 1);
  const hunk = hunks[0];
  assert.equal(hunk.oldStart, 3);
  assert.equal(hunk.oldCount, 3);
  assert.equal(hunk.newStart, 3);
  assert.equal(hunk.newCount, 4);
  assert.equal(hunk.heading, "export function boot() {");

  assert.deepEqual(
    hunk.lines.map((line) => [line.kind, line.oldNumber, line.newNumber, line.text]),
    [
      ["context", 3, 3, "const port = 3000;"],
      ["del", 4, null, "  listen(port);"],
      ["add", null, 4, "  listen(port, host);"],
      ["add", null, 5, "  log(port);"],
      ["context", 5, 6, "}"],
    ],
  );

  assert.equal(meta.oldPath, "src/app.ts");
  assert.equal(meta.newPath, "src/app.ts");
  assert.equal(meta.additions, 2);
  assert.equal(meta.deletions, 1);
  assert.equal(meta.binary, false);
  assert.equal(meta.renamed, false);
  // Header noise git wrote is not something the reader needs shown back.
  assert.deepEqual(meta.notes, []);
});

test("an empty diff parses to nothing rather than throwing", () => {
  for (const empty of ["", "\n"]) {
    const { hunks, meta } = parseDiff(empty);
    assert.deepEqual(hunks, []);
    assert.deepEqual(meta.notes, []);
    assert.equal(meta.oldPath, null);
  }
});

test("a rename is read from git's own rename lines", () => {
  const { meta, hunks } = parseDiff(
    [
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 96%",
      "rename from old/name.ts",
      "rename to new/name.ts",
      "index aaa..bbb 100644",
    ].join("\n"),
  );
  assert.equal(meta.renamed, true);
  assert.equal(meta.oldPath, "old/name.ts");
  assert.equal(meta.newPath, "new/name.ts");
  assert.deepEqual(hunks, []);
});

test("a binary file is flagged, and its notice survives as the only thing to show", () => {
  const { meta, hunks } = parseDiff(
    ["diff --git a/logo.png b/logo.png", "Binary files a/logo.png and b/logo.png differ", ""].join("\n"),
  );
  assert.equal(meta.binary, true);
  assert.deepEqual(hunks, []);
  assert.deepEqual(meta.notes, ["Binary files a/logo.png and b/logo.png differ"]);
});

test("`\\ No newline at end of file` marks the line before it, and is never a row", () => {
  const { hunks } = parseDiff(
    [
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1 +1 @@",
      "-one",
      "\\ No newline at end of file",
      "+two",
      "\\ No newline at end of file",
    ].join("\n"),
  );
  const lines = hunks[0].lines;
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => [line.kind, line.text, line.noNewline]),
    [
      ["del", "one", true],
      ["add", "two", true],
    ],
  );
});

test("an omitted count in the header means one line", () => {
  const { hunks } = parseDiff(["@@ -7 +7 @@", "-a", "+b"].join("\n"));
  assert.equal(hunks[0].oldCount, 1);
  assert.equal(hunks[0].newCount, 1);
  assert.equal(hunks[0].lines[0].oldNumber, 7);
  assert.equal(hunks[0].lines[1].newNumber, 7);
});

test("CRLF line endings do not leave a stray return on every line", () => {
  const { hunks, meta } = parseDiff(
    ["--- a/f.txt\r", "+++ b/f.txt\r", "@@ -1,1 +1,1 @@\r", "-old\r", "+new\r", ""].join("\n"),
  );
  assert.equal(meta.newPath, "f.txt");
  assert.deepEqual(
    hunks[0].lines.map((line) => line.text),
    ["old", "new"],
  );
});

test("a diff with no trailing newline loses nothing", () => {
  const { hunks } = parseDiff(["@@ -1,2 +1,2 @@", " keep", "-gone", "+here"].join("\n"));
  assert.equal(hunks[0].lines.length, 3);
  assert.equal(hunks[0].lines[2].text, "here");
});

test("--3way conflict markers are content, never structure", () => {
  // Everything here would fool a first-character test: `---` reads as a file
  // header, `+++` as the other one, and `@@` inside a marker as a hunk.
  const { hunks, meta } = parseDiff(
    [
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,7 +1,7 @@",
      " before",
      "+<<<<<<< ours",
      "+ours()",
      "+=======",
      "+theirs()",
      "+>>>>>>> theirs",
      "-------",
      "-+++",
      " after",
    ].join("\n"),
  );
  assert.equal(hunks.length, 1);
  assert.deepEqual(
    hunks[0].lines.map((line) => [line.kind, line.text]),
    [
      ["context", "before"],
      ["add", "<<<<<<< ours"],
      ["add", "ours()"],
      ["add", "======="],
      ["add", "theirs()"],
      ["add", ">>>>>>> theirs"],
      ["del", "------"],
      ["del", "+++"],
      ["context", "after"],
    ],
  );
  // The paths came from the real header above the hunk, not from the deleted
  // `---` line inside it.
  assert.equal(meta.oldPath, "f.ts");
  assert.equal(meta.newPath, "f.ts");
});

test("anything unrecognised outside a hunk is kept as a note for the reader", () => {
  const { meta, hunks } = parseDiff("Could not read this diff: Error: permission denied");
  assert.deepEqual(hunks, []);
  assert.deepEqual(meta.notes, ["Could not read this diff: Error: permission denied"]);
});

test("a new file's hunk numbers the additions from one", () => {
  const { hunks, meta } = parseDiff(
    ["--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1,2 @@", "+one", "+two"].join("\n"),
  );
  assert.equal(meta.oldPath, null);
  assert.equal(meta.newPath, "new.ts");
  assert.deepEqual(
    hunks[0].lines.map((line) => line.newNumber),
    [1, 2],
  );
});

test("several hunks in one file keep their own numbering", () => {
  const { hunks } = parseDiff(
    ["@@ -1,2 +1,2 @@", " a", "-b", "+B", "@@ -40,2 +40,2 @@ tail", " y", "-z", "+Z"].join("\n"),
  );
  assert.equal(hunks.length, 2);
  assert.equal(hunks[1].heading, "tail");
  assert.equal(hunks[1].lines[0].oldNumber, 40);
  assert.equal(hunks[1].lines[1].oldNumber, 41);
  assert.equal(hunks[1].lines[2].newNumber, 41);
});
