import test from "node:test";
import assert from "node:assert/strict";

import {
  isSuspendedId,
  placeholderId,
  restoredProjectId,
  toPaneStates,
  toPersistedPanes,
} from "../src/lib/sessionRestore.ts";

function persisted(overrides = {}) {
  return {
    id: 7,
    projectId: "p1",
    agentId: "shell",
    title: "Terminal",
    customTitle: null,
    model: null,
    permissionMode: "standard",
    reasoningEffort: null,
    sourceCwd: "/work",
    workspaceMode: "shared",
    accent: "#7dd3fc",
    snapshot: "hello",
    ...overrides,
  };
}

function session(panes) {
  return { version: 1, savedAtMs: 0, panes };
}

test("restored panes get negative ids that cannot collide with Rust sessions", () => {
  // Rust hands out ids from 1 upward and resets the counter every launch, so
  // any non-negative restored id would eventually collide.
  const panes = toPaneStates(session([persisted(), persisted(), persisted()]));
  const ids = panes.map((pane) => pane.id);

  assert.deepEqual(ids, [-1, -2, -3]);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  assert.ok(ids.every((id) => id < 0));
  assert.ok(ids.every(isSuspendedId));
  assert.ok(!isSuspendedId(1), "a real session id is never suspended");
});

test("restored panes are suspended and carry their saved output", () => {
  const [pane] = toPaneStates(session([persisted({ snapshot: "previous output" })]));

  assert.equal(pane.status, "suspended");
  assert.equal(pane.snapshot, "previous output");
  assert.equal(pane.exitCode, null);
});

test("a stale safe-workspace fingerprint is never restored", () => {
  // Resume re-inspects the tree; trusting a fingerprint from a previous
  // session could run an agent against a snapshot that no longer matches.
  const [pane] = toPaneStates(session([persisted({ workspaceMode: "safe" })]));

  assert.equal(pane.safeSnapshotFingerprint, null);
  assert.equal(pane.workspaceMode, "safe");
});

test("pane order survives the round trip", () => {
  const titles = ["build", "server", "editor"];
  const restored = toPaneStates(session(titles.map((title) => persisted({ title }))));

  assert.deepEqual(toPersistedPanes(restored).map((pane) => pane.title), titles);
});

test("suspended panes persist as id 0 and keep their carried snapshot", () => {
  // Rust's id is a u64, so a negative id would fail to deserialise and take
  // the whole save down with it.
  const restored = toPaneStates(session([persisted({ snapshot: "carried" })]));
  const [saved] = toPersistedPanes(restored);

  assert.equal(saved.id, 0);
  assert.equal(saved.snapshot, "carried");
});

test("a live pane persists its real id so Rust can read its scrollback", () => {
  const live = [{ ...persisted({ id: 12 }), status: "running", osc: null, snapshot: undefined }];
  const [saved] = toPersistedPanes(live);

  assert.equal(saved.id, 12);
  assert.equal(saved.snapshot, null);
});

test("a launch that restored panes opens the project, not Home", () => {
  // Home tallies the restored panes ("4 sessions idle") without showing one,
  // which is indistinguishable from nothing having been restored.
  const panes = toPaneStates(session([persisted({ projectId: "p1" })]));

  assert.equal(restoredProjectId(panes, "p1"), "p1");
});

test("a launch with nothing to restore still opens on Home", () => {
  assert.equal(restoredProjectId([], "p1"), null);
});

test("the panes decide when the last-opened project has none of its own", () => {
  // The exact bug: the user glanced at another project before quitting, so
  // activeProjectId named a project every restored pane is filtered out of.
  const panes = toPaneStates(session([persisted({ projectId: "hke" })]));

  assert.equal(restoredProjectId(panes, "vibyra"), "hke");
  assert.equal(restoredProjectId(panes, null), "hke");
});

test("the active project wins when it has restored panes of its own", () => {
  const panes = toPaneStates(
    session([persisted({ projectId: "other" }), persisted({ projectId: "p1" })]),
  );

  assert.equal(restoredProjectId(panes, "p1"), "p1");
});

test("otherwise the project holding the most restored panes wins", () => {
  const panes = toPaneStates(
    session([
      persisted({ projectId: "few" }),
      persisted({ projectId: "many" }),
      persisted({ projectId: "many" }),
    ]),
  );

  assert.equal(restoredProjectId(panes, "elsewhere"), "many");
});

test("a running pane is not a restored one", () => {
  // Only a suspended pane means "this launch brought a session back"; a live
  // pane is one the user just started, and must not yank the view.
  const live = toPaneStates(session([persisted()])).map((pane) => ({
    ...pane,
    status: "running",
  }));

  assert.equal(restoredProjectId(live, "p1"), null);
});

test("restored panes are dated to when the session was saved", () => {
  // Zero is the epoch, which the Home card renders as "20687d ago".
  const saved = { version: 1, savedAtMs: 1_700_000_000_000, panes: [persisted()] };

  assert.equal(toPaneStates(saved)[0].lastFocusedAt, 1_700_000_000_000);
});

test("placeholder ids are stable for a given position", () => {
  assert.equal(placeholderId(0), -1);
  assert.equal(placeholderId(4), -5);
});

// --- pane placement -------------------------------------------------------

import { insertPane } from "../src/lib/paneInsert.ts";

function pane(id, extra = {}) {
  return { ...persisted(), id, status: "running", osc: null, ...extra };
}

function state(panes, extra = {}) {
  return { panes, focusedId: null, zoomedId: null, activity: {}, ...extra };
}

test("a resumed pane takes the suspended pane's slot instead of appending", () => {
  // Without this, resuming leaves the suspended pane in place and the grid
  // shows the same terminal twice.
  const before = state([pane(-1), pane(5), pane(-2)]);
  const next = insertPane(before, pane(9), -2);

  assert.deepEqual(next.panes.map((p) => p.id), [-1, 5, 9]);
  assert.equal(next.panes.length, 3, "resume must not add a pane");
  assert.equal(next.focusedId, 9);
});

test("a freshly spawned pane is appended", () => {
  const next = insertPane(state([pane(1)]), pane(2));

  assert.deepEqual(next.panes.map((p) => p.id), [1, 2]);
  assert.equal(next.focusedId, 2);
});

test("replacing a pane inherits its zoom and drops its stale activity", () => {
  const before = state([pane(-1)], { zoomedId: -1, activity: { [-1]: "attention" } });
  const next = insertPane(before, pane(4), -1);

  assert.equal(next.zoomedId, 4, "zoom should follow the resumed pane");
  assert.equal(next.activity[-1], undefined, "activity for the old id must be cleared");
});
