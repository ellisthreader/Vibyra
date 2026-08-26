import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCK_COMPACT_DEFAULT,
  DOCK_COMPACT_MAX,
  DOCK_COMPACT_MIN,
  DOCK_GAP_PX,
  DOCK_WIDE_DEFAULT_RATIO,
  DOCK_WIDE_MAX_RATIO,
  DOCK_WIDE_MIN_RATIO,
  clampCompactWidth,
  clampWideRatio,
  dockReserve,
  dockValue,
  dockWidth,
  dockWidthFromPointer,
  nudgeDockWidth,
  restoreCompactWidth,
  restoreDockTool,
  restoreWideRatio,
  saveCompactWidth,
  saveDockTool,
  saveWideRatio,
  terminalsVisible,
} from "../src/lib/dockLayout.ts";

function fakeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    read: (key) => store.get(key),
  };
}

test("only a full-size dock takes the terminals off screen", () => {
  // Load-bearing: the native flush budget follows this. A dock beside the
  // terminals must leave them their delivery rate, or the pane you are
  // watching next to a running preview stops keeping up.
  assert.equal(terminalsVisible("compact", true), true);
  assert.equal(terminalsVisible("wide", true), true);
  assert.equal(terminalsVisible("full", true), false);
  // A closed dock never hides anything, whatever size it would reopen at.
  assert.equal(terminalsVisible("full", false), true);
});

test("each size reads its width from its own unit", () => {
  assert.equal(dockValue("compact", 420, 0.6), 420);
  assert.equal(dockValue("wide", 420, 0.6), 0.6);
  assert.equal(dockValue("full", 420, 0.6), 0.6);

  assert.equal(dockWidth("compact", 420), "420px");
  assert.equal(dockWidth("wide", 0.44), "44.000%");
  // Full is an inset on both sides, not a width — see `dock-shell.css`.
  assert.equal(dockWidth("full", 0.44), "auto");
});

test("the terminals reserve the dock's width plus both gaps, and nothing at full", () => {
  assert.equal(dockReserve("compact", true, 360), `calc(360px + ${DOCK_GAP_PX * 2}px)`);
  assert.equal(dockReserve("wide", true, 0.44), `calc(44.000% + ${DOCK_GAP_PX * 2}px)`);
  // A full dock covers the grid outright, and a closed one asks for nothing.
  assert.equal(dockReserve("full", true, 0.44), "0px");
  assert.equal(dockReserve("compact", false, 360), "0px");
});

test("an out-of-range width is clamped rather than allowed to collapse a surface", () => {
  assert.equal(clampCompactWidth(240), DOCK_COMPACT_MIN);
  assert.equal(clampCompactWidth(420.4), 420);
  assert.equal(clampCompactWidth(900), DOCK_COMPACT_MAX);
  assert.equal(clampCompactWidth(Number.NaN), DOCK_COMPACT_DEFAULT);

  assert.equal(clampWideRatio(0.01), DOCK_WIDE_MIN_RATIO);
  assert.equal(clampWideRatio(3), DOCK_WIDE_MAX_RATIO);
  assert.equal(clampWideRatio(Number.NaN), DOCK_WIDE_DEFAULT_RATIO);
});

test("the grab point stays under the cursor as it crosses the grip", () => {
  // A 1000px workspace with the float's 10px inset taken off: the dock's left
  // edge sits exactly where the pointer is, in both units. The share is of the
  // span between the two gaps, so the midpoint of that span is exactly half.
  assert.equal(dockWidthFromPointer("compact", 610, 0, 1000), 380);
  assert.equal(dockWidthFromPointer("wide", 500, 0, 1000), 0.5);
  // The host's own offset is honoured — the rail is to the left of it.
  assert.equal(dockWidthFromPointer("compact", 846, 236, 1000), 380);
  // Dragging past either end clamps instead of inverting the panel.
  assert.equal(dockWidthFromPointer("compact", 0, 0, 1000), DOCK_COMPACT_MAX);
  assert.equal(dockWidthFromPointer("compact", 1000, 0, 1000), DOCK_COMPACT_MIN);
  assert.equal(dockWidthFromPointer("wide", 999, 0, 1000), DOCK_WIDE_MIN_RATIO);
  // A workspace narrower than the two gaps cannot imply a meaningful width.
  assert.equal(dockWidthFromPointer("wide", 2, 0, 4), DOCK_WIDE_DEFAULT_RATIO);
});

test("arrow keys resize in the unit of the size in play", () => {
  assert.equal(nudgeDockWidth("compact", 360, "ArrowLeft"), 376);
  assert.equal(nudgeDockWidth("compact", 360, "ArrowRight"), 344);
  assert.equal(nudgeDockWidth("compact", 360, "Home"), DOCK_COMPACT_MIN);
  assert.equal(nudgeDockWidth("compact", 360, "End"), DOCK_COMPACT_MAX);
  assert.equal(nudgeDockWidth("wide", 0.44, "ArrowLeft"), 0.46);
  assert.equal(nudgeDockWidth("wide", 0.44, "ArrowRight"), 0.42);
  assert.equal(nudgeDockWidth("compact", 360, "Enter"), null);
  assert.equal(nudgeDockWidth("compact", DOCK_COMPACT_MAX, "ArrowLeft"), DOCK_COMPACT_MAX);
});

test("both widths survive a restart, and a corrupt one falls back", () => {
  const storage = fakeStorage();
  saveCompactWidth(344, storage);
  saveWideRatio(0.52, storage);
  assert.equal(restoreCompactWidth(storage), 344);
  assert.equal(restoreWideRatio(storage), 0.52);

  assert.equal(restoreCompactWidth(fakeStorage()), DOCK_COMPACT_DEFAULT);
  assert.equal(restoreWideRatio(fakeStorage()), DOCK_WIDE_DEFAULT_RATIO);
  assert.equal(
    restoreCompactWidth(fakeStorage({ "vibyra.desktop.dockCompactWidth": "nonsense" })),
    DOCK_COMPACT_DEFAULT,
  );

  // Saved values are clamped on the way in as well as on the way out.
  saveCompactWidth(9_000, storage);
  saveWideRatio(9, storage);
  assert.equal(restoreCompactWidth(storage), DOCK_COMPACT_MAX);
  assert.equal(restoreWideRatio(storage), DOCK_WIDE_MAX_RATIO);
});

test("only a known tool is restored, and closed is never one of them", () => {
  const storage = fakeStorage({ "vibyra.desktop.dockTool": "memory" });
  assert.equal(restoreDockTool(storage), "memory");
  saveDockTool("preview", storage);
  assert.equal(restoreDockTool(storage), "preview");
  // Shutting the dock is a thing you just did, not a preference: reopening
  // lands on the last tool rather than on a blank panel.
  storage.setItem("vibyra.desktop.dockTool", "null");
  assert.equal(restoreDockTool(storage), "chat");
  assert.equal(restoreDockTool(fakeStorage()), "chat");
});

test("dock sizing never throws the workspace out when storage refuses", () => {
  const hostile = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(restoreCompactWidth(hostile), DOCK_COMPACT_DEFAULT);
  assert.equal(restoreWideRatio(hostile), DOCK_WIDE_DEFAULT_RATIO);
  assert.equal(restoreDockTool(hostile), "chat");
  assert.doesNotThrow(() => saveCompactWidth(360, hostile));
  assert.doesNotThrow(() => saveWideRatio(0.5, hostile));
  assert.doesNotThrow(() => saveDockTool("files", hostile));
});
