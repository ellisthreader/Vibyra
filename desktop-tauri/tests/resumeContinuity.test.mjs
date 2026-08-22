import test from "node:test";
import assert from "node:assert/strict";

import {
  ambiguousRecencyResume,
  relaunchContinuity,
  toPaneStates,
  toPersistedPanes,
} from "../src/lib/sessionRestore.ts";

// What "Resume" means for a pane: how much of the previous run it carries
// over, and which conversation it may ask the agent to continue.

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

// --- resume vs restart ----------------------------------------------------

test("resuming keeps the saved output and continues the conversation", () => {
  // Both halves of the bug this fixes: Resume used to drop the output the
  // user was reading, and start the agent on an empty conversation.
  const [suspended] = toPaneStates(session([persisted({ snapshot: "earlier work" })]));

  assert.deepEqual(relaunchContinuity(suspended), {
    resume: true,
    replaySnapshot: "earlier work",
  });
});

test("restarting a live or exited pane deliberately starts clean", () => {
  for (const status of ["running", "exited"]) {
    const live = { ...persisted({ snapshot: "earlier work" }), status };

    assert.deepEqual(
      relaunchContinuity(live),
      { resume: false, replaySnapshot: null },
      status,
    );
  }
});

test("a suspended pane saved without output still resumes", () => {
  // Scrollback persistence is a setting; with it off the layout is restored
  // but there is nothing to replay, and resume must still continue.
  const [pane] = toPaneStates(session([persisted({ snapshot: null })]));

  assert.deepEqual(relaunchContinuity(pane), { resume: true, replaySnapshot: null });
});

// --- which conversation "resume" means -------------------------------------

function suspended(overrides = {}) {
  const [only] = toPaneStates(session([persisted(overrides)]));
  return only;
}

test("two panes of one agent in one folder never share a conversation", () => {
  // Both would resolve "the most recent conversation here" to the same one,
  // and two live processes would then be writing to it.
  const first = { ...suspended({ agentId: "codex" }), id: -1 };
  const second = { ...suspended({ agentId: "codex" }), id: -2 };

  assert.equal(ambiguousRecencyResume(first, [first, second]), true);
  assert.equal(relaunchContinuity(first, [first, second]).resume, false);
});

test("a pane carrying its own conversation id is never ambiguous", () => {
  // Claude Code panes are launched with --session-id, so each names its own.
  const first = { ...suspended({ agentId: "claude", agentSessionId: "a" }), id: -1 };
  const second = { ...suspended({ agentId: "claude", agentSessionId: "b" }), id: -2 };

  assert.equal(ambiguousRecencyResume(first, [first, second]), false);
  assert.equal(relaunchContinuity(first, [first, second]).resume, true);
});

test("panes are only ambiguous against the same agent in the same folder", () => {
  const codex = { ...suspended({ agentId: "codex", sourceCwd: "/a" }), id: -1 };
  const otherAgent = { ...suspended({ agentId: "gemini", sourceCwd: "/a" }), id: -2 };
  const otherFolder = { ...suspended({ agentId: "codex", sourceCwd: "/b" }), id: -3 };

  assert.equal(ambiguousRecencyResume(codex, [codex, otherAgent, otherFolder]), false);
});

test("saved output is still replayed even when the conversation cannot be", () => {
  // The ambiguous case loses the thread, not the terminal history.
  const first = { ...suspended({ agentId: "codex", snapshot: "earlier" }), id: -1 };
  const second = { ...suspended({ agentId: "codex" }), id: -2 };

  assert.deepEqual(relaunchContinuity(first, [first, second]), {
    resume: false,
    replaySnapshot: "earlier",
  });
});

test("a conversation the agent no longer has is not asked for", () => {
  // The pane was opened, never typed into and closed: Claude writes no
  // transcript until the first message, so the id it was pinned to names
  // nothing and `--resume` exits 1 instead of opening an empty chat.
  const pane = suspended({ agentId: "claude", agentSessionId: "gone" });

  assert.equal(relaunchContinuity(pane, [pane], false).resume, false);
});

test("a missing conversation still keeps the output the user was reading", () => {
  // A transcript also disappears when Claude cleans up old ones, and that
  // pane's scrollback is real work — losing the thread is enough.
  const pane = suspended({ agentId: "claude", agentSessionId: "gone", snapshot: "earlier work" });

  assert.deepEqual(relaunchContinuity(pane, [pane], false), {
    resume: false,
    replaySnapshot: "earlier work",
  });
});

test("a conversation that is still there resumes as before", () => {
  const pane = suspended({ agentId: "claude", agentSessionId: "a" });

  assert.equal(relaunchContinuity(pane, [pane], true).resume, true);
});

test("the conversation id survives the save/restore round trip", () => {
  const restored = toPaneStates(session([persisted({ agentSessionId: "uuid-here" })]));

  assert.equal(restored[0].agentSessionId, "uuid-here");
  assert.equal(toPersistedPanes(restored)[0].agentSessionId, "uuid-here");
});

test("a pane saved before conversation ids existed restores without one", () => {
  const { agentSessionId, ...legacy } = persisted();
  assert.equal(agentSessionId, undefined);
  const [pane] = toPaneStates(session([legacy]));

  assert.equal(pane.agentSessionId, null);
});
