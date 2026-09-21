import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { launchRoute } from "../src/lib/launchRoute.ts";
import { conversationAgent } from "../src/lib/conversationAgent.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * Settings > General > Agent view is a promise about what a launch opens.
 * Terminal means the agent's own CLI in a pane. Only Codex can attach that
 * CLI to a shared conversation, so every other provider must be a real PTY
 * there — otherwise "Terminal" quietly opens a chat page.
 */
test("Terminal view opens Claude and Gemini as real PTYs", () => {
  assert.equal(launchRoute("claude", "terminal"), "pty");
  assert.equal(launchRoute("gemini", "terminal"), "pty");
});

test("Chat view opens Claude and Gemini as conversations", () => {
  assert.equal(launchRoute("claude", "chat"), "conversation");
  assert.equal(launchRoute("gemini", "chat"), "conversation");
});

test("Codex always runs through the shared conversation engine", () => {
  assert.equal(launchRoute("codex", "terminal"), "conversation");
  assert.equal(launchRoute("codex", "chat"), "conversation");
});

test("shells, ssh and other runners are PTYs in either view", () => {
  for (const id of ["shell", "ssh", "aider", "opencode", "qwen", "custom-runner"]) {
    assert.equal(launchRoute(id, "terminal"), "pty", id);
    assert.equal(launchRoute(id, "chat"), "pty", id);
  }
});

test("the launch path decides by the saved Agent view, not by provider alone", () => {
  const launch = source("../src/lib/configuredLaunch.ts");
  assert.match(launch, /settings\?\.agentView \?\? "terminal"/);
  // A phone's page is the chat itself: its request names the Chat route, and
  // only that request may override the Mac's own setting.
  assert.match(launch, /launch\.view \?\? useSettingsStore\.getState\(\)\.settings\?\.agentView/);
  assert.match(launch, /view: options\.view,/);
  assert.match(launch, /launchRoute\(launch\.agent\.id, view\)/);
  assert.doesNotMatch(
    launch,
    /\['codex', 'claude', 'gemini'\]\.includes/,
    "a fixed provider list sends Terminal-view Claude launches into the chat engine",
  );
});

/**
 * A conversation pane is named after the provider that runs it. A Claude
 * session wearing a Codex mark is what "Claude opened a Codex chat" looks like.
 */
test("conversation panes are branded by the session's provider", () => {
  assert.deepEqual(conversationAgent("claude"), { id: "claude", name: "Claude Code", accent: "#ff9b6a" });
  assert.deepEqual(conversationAgent("gemini"), { id: "gemini", name: "Gemini", accent: "#6aa8ff" });
  assert.equal(conversationAgent("codex").name, "Codex");
  // Sessions saved before `kind` existed were all Codex.
  assert.equal(conversationAgent(undefined).id, "codex");
  assert.equal(conversationAgent("mystery").id, "codex");
  for (const path of ["../src/components/terminal/ConversationChatPane.tsx", "../src/components/terminal/NativeConversationPane.tsx"]) {
    const pane = source(path);
    assert.doesNotMatch(pane, /agentId="codex"/, `${path} hard-codes the Codex mark`);
    assert.match(pane, /conversationAgent\(session\.kind\)/, `${path} must brand by session kind`);
  }
});

test("Terminal view never means a terminal-styled chat page", () => {
  const pane = source("../src/components/terminal/ConversationTerminalPane.tsx");
  const chat = source("../src/components/terminal/ConversationChatPane.tsx");
  assert.doesNotMatch(pane, /presentation=/, "the chat pane has one presentation: chat");
  assert.match(chat, /data-agent-view="chat"/);
  assert.doesNotMatch(chat, /conversationTerminalMode/);
});
