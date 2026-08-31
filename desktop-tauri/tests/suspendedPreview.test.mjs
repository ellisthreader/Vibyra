import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEW_TAIL_CHARS, previewSlice } from "../src/lib/suspendedPreview.ts";

/** Widest row the trim may skip past, mirroring MAX_BOUNDARY_SCAN. */
const MAX_ROW = 2_000;

test("a snapshot within the limit is drawn whole", () => {
  const snapshot = "the whole thing\r\n";
  assert.equal(previewSlice(snapshot), snapshot);
  assert.equal(previewSlice("exactly", 7), "exactly");
});

test("nothing to draw stays nothing to draw", () => {
  // The caller writes only on a truthy result, so a missing snapshot has to
  // come back falsy rather than as an empty terminal write.
  assert.equal(previewSlice(null), "");
  assert.equal(previewSlice(undefined), "");
  assert.equal(previewSlice(""), "");
});

test("a long snapshot is bounded by the limit", () => {
  const snapshot = "x".repeat(500_000);
  assert.ok(previewSlice(snapshot).length <= PREVIEW_TAIL_CHARS);
  assert.ok(previewSlice(snapshot, 100).length <= 100);
});

test("the slice is always a suffix of the snapshot", () => {
  // The property that makes this safe to show as "what you were looking at":
  // the preview is real trailing output, never a rearrangement of it.
  const cases = [
    "short",
    "y".repeat(300),
    `${"a".repeat(150)}\nrest of it`,
    `${"line\n".repeat(80)}tail`,
    "no breaks at all ".repeat(40),
  ];
  for (const snapshot of cases) {
    const slice = previewSlice(snapshot, 200);
    assert.ok(snapshot.endsWith(slice), `not a suffix: ${JSON.stringify(slice.slice(0, 24))}`);
  }
});

test("the preview opens on a whole row, not the middle of one", () => {
  // Every row terminator an inline agent can leave behind. A bare CR is the
  // one that matters most in practice: Claude and Codex redraw their status
  // by returning to column 0 without ever ending the line.
  for (const brk of ["\n", "\r", "\r\n"]) {
    const snapshot = `${"noise".repeat(200)}${brk}first whole row${brk}second row`;
    const slice = previewSlice(snapshot, 200);
    assert.ok(
      slice.startsWith("first whole row"),
      `began mid-row for ${JSON.stringify(brk)}: ${JSON.stringify(slice.slice(0, 24))}`,
    );
    assert.ok(slice.endsWith("second row"));
  }
});

test("one enormous unbroken row keeps the raw tail", () => {
  // Snapping would tidy a single row by throwing the preview away, so the
  // tail stands and the caller's reset() absorbs the severed sequence.
  const snapshot = `${"a".repeat(50_000)}\r\n${"b".repeat(3_000)}`;
  const slice = previewSlice(snapshot, 10_000);
  assert.equal(slice.length, 10_000);
  assert.ok(snapshot.endsWith(slice));
});

test("real inline agent output is trimmed, since it never clears the screen", () => {
  // Claude and Codex render inline: no alt-screen, no erase-display. This is
  // the shape the trim actually meets, and keying on a screen clear instead
  // of a line break would have been a branch that never ran.
  const frame = `\x1b[2m${"status line ".repeat(8)}\x1b[0m\x1b[K\n`;
  const snapshot = frame.repeat(4_000);
  assert.equal(snapshot.includes("\x1b[2J"), false);
  const slice = previewSlice(snapshot);
  assert.ok(slice.length <= PREVIEW_TAIL_CHARS);
  assert.ok(slice.length > PREVIEW_TAIL_CHARS - MAX_ROW, "should keep nearly the whole budget");
  assert.ok(snapshot.endsWith(slice));
});

test("the snapshot itself is never what gets trimmed", () => {
  // Guards the seam the restore system depends on: `pane.snapshot` is what
  // `relaunchContinuity` replays and `toPersistedPanes` writes back, so this
  // helper must be a pure read. A regression here erodes scrollback on every
  // restart rather than failing loudly.
  const snapshot = "z".repeat(500_000);
  const before = snapshot.length;
  previewSlice(snapshot);
  assert.equal(snapshot.length, before);
});
