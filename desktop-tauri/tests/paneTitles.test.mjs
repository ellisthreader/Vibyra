import assert from "node:assert/strict";
import test from "node:test";

import { paneLabel } from "../src/lib/paneLabel.ts";
import { changedTitles, titleRequests, trackStandIns } from "../src/lib/paneTitlePlan.ts";
import { toPaneStates, toPersistedPanes } from "../src/lib/sessionRestore.ts";

function pane(overrides = {}) {
  return {
    id: 1, projectId: "p1", agentId: "claude", title: "Claude Code",
    customTitle: null, autoTitle: null, osc: null, status: "running",
    agentSessionId: "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17", accountId: null,
    ...overrides,
  };
}

test("a typed name beats the work's name, which beats the program's", () => {
  assert.equal(paneLabel(pane()), "Claude Code");
  assert.equal(paneLabel(pane({ autoTitle: "Website redesign" })), "Website redesign");
  assert.equal(paneLabel(pane({ autoTitle: "Website redesign", customTitle: "Launch" })), "Launch");
  assert.equal(paneLabel(pane({ autoTitle: undefined })), "Claude Code");
});

test("the quick pass asks only about running agent panes with no name yet", () => {
  const panes = [
    pane({ id: 1 }),
    pane({ id: 2, autoTitle: "Already named" }),
    pane({ id: 3, customTitle: "Typed by the person" }),
    pane({ id: 4, agentId: "shell" }),
    pane({ id: 5, agentId: "ssh" }),
    pane({ id: 6, status: "exited" }),
    pane({ id: 7, status: "suspended" }),
    pane({ id: -1 }),
    pane({ id: 8, agentId: "gemini", agentSessionId: null }),
  ];
  assert.deepEqual(titleRequests(panes, "unnamed").map((r) => r.id), [1, 8]);
});

test("the slow pass re-reads only agents that write their own titles, with a known conversation", () => {
  const panes = [
    pane({ id: 1, autoTitle: "Stand-in from the first request" }),
    pane({ id: 2, agentId: "codex", autoTitle: "x" }),
    pane({ id: 3, agentId: "gemini", agentSessionId: null, autoTitle: "x" }),
    pane({ id: 4, agentSessionId: null }),
    pane({ id: 5, customTitle: "Typed" }),
  ];
  assert.deepEqual(titleRequests(panes, "all").map((r) => r.id), [1, 2]);
  assert.deepEqual(titleRequests(panes, "all")[0], {
    id: 1, agentId: "claude", sessionId: "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17", accountId: null,
  });
});

test("a first request names a pane; the agent's own title replaces it later", () => {
  const first = changedTitles([pane()], [{ id: 1, prompt: "Hey, can you redesign the website hero?", nativeTitle: null }]);
  assert.deepEqual(first, { 1: "Redesign the website hero" });
  const later = changedTitles(
    [pane({ autoTitle: "Redesign the website hero" })],
    [{ id: 1, prompt: "Hey, can you redesign the website hero?", nativeTitle: "Website hero redesign" }],
  );
  assert.deepEqual(later, { 1: "Website hero redesign" });
});

test("nothing changes when nothing new was learned", () => {
  const named = pane({ autoTitle: "Website hero redesign" });
  assert.deepEqual(changedTitles([named], [{ id: 1, prompt: "something else", nativeTitle: "Website hero redesign" }]), {});
  assert.deepEqual(changedTitles([named], [{ id: 1, prompt: null, nativeTitle: null }]), {});
});

test("an answer for a pane that was renamed, closed or ended is ignored", () => {
  const hint = { id: 1, prompt: "redesign the website hero", nativeTitle: "Website hero redesign" };
  assert.deepEqual(changedTitles([pane({ customTitle: "Typed" })], [hint]), {});
  assert.deepEqual(changedTitles([pane({ status: "exited" })], [hint]), {});
  assert.deepEqual(changedTitles([], [hint]), {});
});

test("the work's name is saved and restored with the session", () => {
  const saved = toPersistedPanes([pane({ autoTitle: "Website redesign", workspaceMode: "shared", accent: "#fff" })]);
  assert.equal(saved[0].autoTitle, "Website redesign");
  const restored = toPaneStates({ version: 1, savedAtMs: 1, panes: saved });
  assert.equal(restored[0].autoTitle, "Website redesign");
  assert.equal(paneLabel(restored[0]), "Website redesign");
  // A session written before names existed restores with none.
  const old = toPaneStates({ version: 1, savedAtMs: 1, panes: [{ ...saved[0], autoTitle: undefined }] });
  assert.equal(old[0].autoTitle, null);
});

test("a stand-in from Claude or Codex stays in the quick pass until the agent names it", () => {
  const awaiting = new Map();
  const panes = [pane({ id: 1 }), pane({ id: 2, agentId: "gemini", agentSessionId: null })];
  const hints = [
    { id: 1, prompt: "redesign the website hero", nativeTitle: null },
    { id: 2, prompt: "add dark mode to settings", nativeTitle: null },
  ];
  const titles = changedTitles(panes, hints);
  trackStandIns(awaiting, panes, hints, titles, 60_000);
  assert.deepEqual([...awaiting.keys()], [1]);

  const named = [pane({ id: 1, autoTitle: titles[1] }), pane({ id: 2, agentId: "gemini", autoTitle: titles[2] })];
  assert.deepEqual(titleRequests(named, "unnamed", new Set(awaiting.keys())).map((r) => r.id), [1]);

  const native = [{ id: 1, prompt: "redesign the website hero", nativeTitle: "Website hero redesign" }];
  trackStandIns(awaiting, named, native, changedTitles(named, native), 60_000);
  assert.equal(awaiting.size, 0);
});
