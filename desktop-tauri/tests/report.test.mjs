import assert from "node:assert/strict";
import test from "node:test";

import {
  areaFor,
  canSubmit,
  detailsLabel,
  draftBlocker,
  emptyDraft,
  gradable,
  REPORT_KINDS,
} from "../src/lib/reportDraft.ts";

function draft(overrides = {}) {
  return {
    ...emptyDraft("Terminal pane"),
    summary: "Terminal goes blank on resize",
    details: "Dragging the divider leaves the pane empty.",
    ...overrides,
  };
}

test("a report is not sendable until it says what happened", () => {
  assert.equal(draftBlocker(draft({ summary: "  " })), "Add a short title");
  assert.equal(draftBlocker(draft({ details: "" })), "Describe what happened");
  assert.equal(draftBlocker(draft()), null);
  assert.equal(canSubmit(draft()), true);
});

test("the blocker names the next thing to do rather than the error", () => {
  // Summary is checked before details: asking for both at once reads as a
  // wall of failure on a form the user has barely started.
  assert.equal(draftBlocker(emptyDraft("Home screen")), "Add a short title");
});

test("a paste far larger than a report is refused before it is sent", () => {
  assert.match(draftBlocker(draft({ details: "x".repeat(8_001) })), /more text/);
  assert.match(draftBlocker(draft({ steps: "x".repeat(8_001) })), /more text/);
  assert.equal(draftBlocker(draft({ details: "x".repeat(7_999) })), null);
});

test("terminal output is offered by default, since that is where the evidence is", () => {
  assert.equal(emptyDraft("Terminal pane").includeTerminal, true);
  assert.equal(emptyDraft("Terminal pane").screenshot, null);
});

test("severity is only asked about where it means something", () => {
  assert.equal(gradable("bug"), true);
  assert.equal(gradable("crash"), true);
  assert.equal(gradable("idea"), false);
  assert.equal(gradable("question"), false);
});

test("every kind offers a distinct choice with its own explanation", () => {
  const ids = REPORT_KINDS.map((kind) => kind.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(REPORT_KINDS.every((kind) => kind.label && kind.blurb));
});

test("the question asked matches the kind of report being written", () => {
  assert.match(detailsLabel("idea"), /would you like/i);
  assert.match(detailsLabel("crash"), /when it died/i);
  assert.equal(detailsLabel("bug"), "What happened?");
  assert.equal(detailsLabel("visual"), "What happened?");
});

test("where the user is standing is read most-specific first", () => {
  const base = {
    settingsOpen: false,
    companionOpen: false,
    projectMode: "terminals",
    view: "project",
    hasPane: true,
  };
  // A modal is what the user is looking at, even with a project behind it.
  assert.equal(areaFor({ ...base, settingsOpen: true }), "Settings");
  assert.equal(areaFor({ ...base, view: "home" }), "Home screen");
  assert.equal(areaFor({ ...base, projectMode: "preview" }), "Preview");
  assert.equal(areaFor(base), "Terminal pane");
  assert.equal(areaFor({ ...base, hasPane: false, companionOpen: true }), "AI companion");
  assert.equal(areaFor({ ...base, hasPane: false }), "Somewhere else");
});

test("a report starts with no attachments and refuses to become an album", () => {
  assert.deepEqual(emptyDraft("Home screen").images, []);
  assert.equal(draftBlocker(draft({ images: ["/a.png", "/b.png", "/c.png", "/d.png"] })), null);
  assert.match(
    draftBlocker(draft({ images: ["/a.png", "/b.png", "/c.png", "/d.png", "/e.png"] })),
    /at most 4 images/,
  );
});
