import test from "node:test";
import assert from "node:assert/strict";
import { toPaneStates, toPersistedPanes } from "../src/lib/sessionRestore.ts";
import { conversationInUse, recoveryCopy } from "../src/lib/resumePolicy.ts";

function pane(overrides = {}) {
  return { id: -1, projectId: "project", agentId: "codex", status: "suspended", accountId: null,
    agentSessionId: "chat-a", snapshot: "earlier work", sourceCwd: "/project", ...overrides };
}

test("the exact chat, account, worktree and history survive a save and restore", () => {
  const original = pane({ accountId: "work", resumeCwd: "/safe/worktree" });
  const saved = toPersistedPanes([original]);
  const [restored] = toPaneStates({ version: 1, savedAtMs: 400, panes: saved });
  for (const key of ["agentSessionId", "accountId", "resumeCwd", "sourceCwd", "snapshot"]) {
    assert.equal(restored[key], original[key], key);
  }
  assert.equal(restored.status, "suspended");
  assert.ok(restored.id < 0);
});

test("a chat cannot resume twice, even across project folders or pending starts", () => {
  const first = pane();
  const duplicate = pane({ id: -2, sourceCwd: "/other" });
  assert.equal(conversationInUse(first, [first, { ...duplicate, status: "running" }]), true);
  assert.equal(conversationInUse(first, [first, duplicate], [-1, -2]), true);
  assert.equal(conversationInUse(first, [first, duplicate]), false);
});

test("separate chats and accounts in the same folder stay independent", () => {
  const first = pane();
  for (const changes of [{ agentSessionId: "chat-b" }, { accountId: "work" }, { agentId: "claude" }]) {
    assert.equal(conversationInUse(first, [first, pane({ id: 2, status: "running", ...changes })]), false);
  }
  assert.equal(conversationInUse(first, [pane({ id: 2, status: "running", accountId: "default" })]), true);
});

test("legacy panes offer a chooser instead of silently starting a different chat", () => {
  for (const agentId of ["claude", "codex"]) {
    const copy = recoveryCopy(pane({ agentId, agentSessionId: null }));
    assert.equal(copy.action, "Choose saved chat");
    assert.match(copy.detail, /Choose the conversation/);
  }
  assert.match(recoveryCopy(pane({ agentId: "gemini", agentSessionId: null })).detail, /\/resume/);
  assert.equal(recoveryCopy(pane({ status: "exited" })).action, "Resume chat");
});

test("shells and SSH explain that reopening starts a process", () => {
  assert.equal(recoveryCopy(pane({ agentId: "shell" })).action, "Open terminal");
  assert.equal(recoveryCopy(pane({ agentId: "ssh" })).action, "Reconnect");
  assert.match(recoveryCopy(pane({ agentId: "shell" })).detail, /new process/);
});

test("old saves and privacy-disabled snapshots still restore", () => {
  const [restored] = toPaneStates({ version: 1, savedAtMs: 0, panes: [{ agentId: "codex", snapshot: null }] });
  assert.equal(restored.agentSessionId, null);
  assert.equal(restored.resumeCwd, null);
  assert.equal(restored.accountId, null);
  assert.equal(restored.snapshot, null);
  assert.equal(recoveryCopy(restored).action, "Choose saved chat");
});
