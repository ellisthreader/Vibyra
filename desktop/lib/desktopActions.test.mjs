import test from "node:test";
import assert from "node:assert/strict";
import { desktopActionsForPrompt } from "./desktopActions.mjs";

test("plans a multi-terminal Codex launch from natural language", () => {
  const result = desktopActionsForPrompt(
    "Open 8 terminals with Codex 5.5 fast full permissions",
    { projectId: "project-1" }
  );

  assert.deepEqual(result.actions, [{
    type: "open_terminals",
    count: 8,
    model: "gpt-5.5",
    effort: "low",
    permissionMode: "full",
    projectId: "project-1"
  }]);
  assert.match(result.reply, /watch them live/i);
  assert.match(result.reply, /Voice and Memory/);
});

test("keeps normal terminal requests on standard permissions", () => {
  const result = desktopActionsForPrompt("Start three Gemini terminals");

  assert.equal(result.actions[0].count, 3);
  assert.equal(result.actions[0].model, "gemini-2.5-pro");
  assert.equal(result.actions[0].permissionMode, "standard");
});

test("opens Voice and Memory as local companion actions", () => {
  assert.equal(desktopActionsForPrompt("/voice").actions[0].mode, "voice");
  assert.equal(desktopActionsForPrompt("Show Vibyra memory").actions[0].mode, "memory");
});

test("does not turn ordinary chat into a desktop action", () => {
  assert.equal(desktopActionsForPrompt("Explain how terminal permissions work"), null);
});
