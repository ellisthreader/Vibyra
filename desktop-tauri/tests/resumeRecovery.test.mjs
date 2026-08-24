import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_WINDOW_MS,
  claimFailedResume,
  forgetResumeAttempt,
  noteResumeAttempt,
  startsNewConversation,
} from "../src/lib/resumeRecovery.ts";

// What happens when an agent refuses the conversation a pane was resumed into.
// The ledger is module-scoped, so every test uses its own persistence id.

const LAUNCHED = 1_000_000;

function attempt(name, at = LAUNCHED) {
  noteResumeAttempt(name, at);
  return name;
}

// --- recovering a refused resume ------------------------------------------

test("a resume the agent refused is recovered", () => {
  // `codex resume <id>` exits 1 within a second or two on an id it cannot
  // resolve, and on one another process already holds. Either way the pane
  // the user asked for is dead on arrival.
  const pane = attempt("refused");

  assert.equal(claimFailedResume(pane, 1, LAUNCHED + 1_200), true);
});

test("the recovery is claimed once, so a pane can never relaunch in a loop", () => {
  const pane = attempt("loop");

  assert.equal(claimFailedResume(pane, 1, LAUNCHED + 500), true);
  // The replacement dies the same way: it comes back as an ordinary failed
  // pane showing the agent's own error, not another restart.
  assert.equal(claimFailedResume(pane, 1, LAUNCHED + 900), false);
});

test("a pane that never asked to resume is left alone", () => {
  // A fresh pane that exits 1 is a failed run, and the user wants to read it.
  assert.equal(claimFailedResume("never-resumed", 1, LAUNCHED), false);
});

// --- what is not a refusal -------------------------------------------------

test("an agent finishing its work is not a refusal", () => {
  const pane = attempt("finished");

  assert.equal(claimFailedResume(pane, 0, LAUNCHED + 900), false);
});

test("a pane Vibyra or the user killed is not a refusal", () => {
  // Closing, restarting and switching account all tear the PTY down, and a
  // signalled process reports no exit code at all.
  const pane = attempt("killed");

  assert.equal(claimFailedResume(pane, null, LAUNCHED + 900), false);
});

test("a pane that ran and later failed is not restarted underneath the user", () => {
  // It plainly started, so whatever ended it is the run's own business —
  // restarting would throw away work rather than save it.
  const pane = attempt("long-lived");

  assert.equal(claimFailedResume(pane, 1, LAUNCHED + RECOVERY_WINDOW_MS + 1), false);
});

test("the window is inclusive at its edge", () => {
  const pane = attempt("edge");

  assert.equal(claimFailedResume(pane, 1, LAUNCHED + RECOVERY_WINDOW_MS), true);
});

test("closing a pane drops its pending attempt", () => {
  const pane = attempt("closed");
  forgetResumeAttempt(pane);

  assert.equal(claimFailedResume(pane, 1, LAUNCHED + 100), false);
});

// --- telling the user a conversation was not continued ---------------------

function pane(overrides = {}) {
  return { agentId: "codex", status: "suspended", ...overrides };
}

test("a restored agent pane that cannot resume says so", () => {
  // Otherwise it is indistinguishable from one that did: the old scrollback
  // is painted above the new process either way.
  for (const agentId of ["claude", "codex", "gemini"]) {
    assert.equal(startsNewConversation(pane({ agentId }), false), true, agentId);
  }
});

test("a pane that did resume says nothing", () => {
  assert.equal(startsNewConversation(pane(), true), false);
});

test("a plain terminal has no conversation to lose", () => {
  for (const agentId of ["shell", "ssh", "my-custom-agent"]) {
    assert.equal(startsNewConversation(pane({ agentId }), false), false, agentId);
  }
});

test("restarting a live pane is not a lost conversation", () => {
  // Restart deliberately starts clean — that is the whole reason to press it.
  for (const status of ["running", "exited"]) {
    assert.equal(startsNewConversation(pane({ status }), false), false, status);
  }
});
