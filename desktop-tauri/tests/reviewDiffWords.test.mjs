import assert from "node:assert/strict";
import test from "node:test";

import { refineHunk, refineLinePair } from "../src/components/review/diff/diffWords.ts";

/** Spans back as the text they cover, which is what the marks actually read as. */
function shown(text, spans) {
  return spans.map((span) => text.slice(span.start, span.end));
}

test("a one-character change marks one word, not the whole line", () => {
  const before = "  const port = 3000;";
  const after = "  const port = 3001;";
  const pair = refineLinePair(before, after);
  assert.deepEqual(shown(before, pair.del), ["3000"]);
  assert.deepEqual(shown(after, pair.add), ["3001"]);
});

test("an insertion marks only what arrived", () => {
  const before = "listen(port);";
  const after = "listen(port, host);";
  const pair = refineLinePair(before, after);
  assert.deepEqual(pair.del, []);
  assert.deepEqual(shown(after, pair.add).join(""), ", host");
});

test("a deletion marks only what left", () => {
  const before = "call(a, b, c);";
  const after = "call(a, c);";
  const pair = refineLinePair(before, after);
  assert.deepEqual(pair.add, []);
  assert.equal(shown(before, pair.del).join(""), "b, ");
});

test("identical lines are not worth a mark", () => {
  assert.equal(refineLinePair("same", "same"), null);
});

test("a wholly different line still marks, and marks everything", () => {
  const pair = refineLinePair("alpha", "beta");
  assert.deepEqual(shown("alpha", pair.del), ["alpha"]);
  assert.deepEqual(shown("beta", pair.add), ["beta"]);
});

test("a machine-length line is left alone rather than paid for", () => {
  const long = "x".repeat(401);
  assert.equal(refineLinePair(long, `${long}y`), null);
  assert.equal(refineLinePair("short", "y".repeat(500)), null);
});

test("a huge changed middle is marked in one span rather than walked", () => {
  // Two hundred distinct words either side of a shared prefix: past the table's
  // ceiling, so the whole middle is one mark. Still better than the whole line.
  const head = "const x = ";
  const before = `${head}${Array.from({ length: 200 }, (_, i) => `a${i}`).join(" ")}`;
  const after = `${head}${Array.from({ length: 200 }, (_, i) => `b${i}`).join(" ")}`;
  const pair = refineLinePair(before.slice(0, 400), after.slice(0, 400));
  assert.equal(pair.del.length, 1);
  assert.equal(pair.add.length, 1);
  assert.equal(pair.del[0].start, head.length);
});

test("an equal-length run of deletions then additions is paired line for line", () => {
  const lines = [
    { kind: "context", text: "keep" },
    { kind: "del", text: "let a = 1;" },
    { kind: "del", text: "let b = 2;" },
    { kind: "add", text: "let a = 9;" },
    { kind: "add", text: "let b = 8;" },
    { kind: "context", text: "keep" },
  ];
  const marks = refineHunk(lines);
  assert.equal(marks[0], null);
  assert.equal(marks[5], null);
  assert.deepEqual(shown(lines[1].text, marks[1]), ["1"]);
  assert.deepEqual(shown(lines[3].text, marks[3]), ["9"]);
  assert.deepEqual(shown(lines[2].text, marks[2]), ["2"]);
  assert.deepEqual(shown(lines[4].text, marks[4]), ["8"]);
});

test("an unequal run is not paired, because nothing knows which line replaced which", () => {
  const marks = refineHunk([
    { kind: "del", text: "one" },
    { kind: "add", text: "uno" },
    { kind: "add", text: "dos" },
  ]);
  assert.deepEqual(marks, [null, null, null]);
});

test("additions with no deletion before them are never paired", () => {
  const marks = refineHunk([
    { kind: "context", text: "a" },
    { kind: "add", text: "b" },
    { kind: "add", text: "c" },
  ]);
  assert.deepEqual(marks, [null, null, null]);
});

test("a block rewrite past the run ceiling is left unpaired", () => {
  const dels = Array.from({ length: 61 }, (_, i) => ({ kind: "del", text: `old ${i}` }));
  const adds = Array.from({ length: 61 }, (_, i) => ({ kind: "add", text: `new ${i}` }));
  const marks = refineHunk([...dels, ...adds]);
  assert.equal(
    marks.every((mark) => mark === null),
    true,
  );
});

test("two separate runs in one hunk are each paired on their own", () => {
  const lines = [
    { kind: "del", text: "a = 1" },
    { kind: "add", text: "a = 2" },
    { kind: "context", text: "between" },
    { kind: "del", text: "b = 3" },
    { kind: "add", text: "b = 4" },
  ];
  const marks = refineHunk(lines);
  assert.deepEqual(shown(lines[0].text, marks[0]), ["1"]);
  assert.deepEqual(shown(lines[4].text, marks[4]), ["4"]);
  assert.equal(marks[2], null);
});

test("touching segments are packed into one mark", () => {
  const before = "foo(bar)";
  const after = "baz[bar]";
  const pair = refineLinePair(before, after);
  // `foo` and `(` change together and read as one changed segment, not two.
  assert.equal(pair.del.length <= 2, true);
  assert.equal(shown(before, pair.del).join("").includes("foo"), true);
});
