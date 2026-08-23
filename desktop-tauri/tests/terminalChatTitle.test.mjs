import assert from "node:assert/strict";
import test from "node:test";

import {
  needsPromptDerivedTitle,
  TerminalPromptTracker,
  titleFromPrompt,
} from "../src/lib/terminalChatTitle.ts";
import { terminalDisplayTitle } from "../src/lib/terminalTitle.ts";

test("all AI CLIs without Claude's native title get the shared fallback", () => {
  for (const agent of ["codex", "gemini", "qwen", "aider", "opencode", "custom-ai"]) {
    assert.equal(needsPromptDerivedTitle(agent), true, agent);
  }
  assert.equal(needsPromptDerivedTitle("claude"), false);
  assert.equal(needsPromptDerivedTitle("shell"), false);
  assert.equal(needsPromptDerivedTitle("ssh"), false);
});

test("a conversational prompt becomes a concise task title", () => {
  assert.equal(
    titleFromPrompt("Can you please diagnose why Codex terminals keep generic project titles?"),
    "diagnose why Codex terminals keep generic project titles",
  );
});

test("titles are bounded and redact credential-shaped values", () => {
  const title = titleFromPrompt(
    "Please fix sk-abcdefghijklmnopqrstuvwxyz1234567890 authentication failing on the provider connection screen today",
  );
  assert.equal(title, "fix credential authentication failing on the provider…");
  assert.ok(title.length <= 64);
});

test("utility commands and short approval replies do not name a chat", () => {
  assert.equal(titleFromPrompt("/model gpt-5.6"), null);
  assert.equal(titleFromPrompt("Always allow"), null);
});

test("typed input is committed only when Enter submits it", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(tracker.push("Fix the terminal titel"), null);
  assert.equal(tracker.push("\x7f\x7f\x7f\x7f\x7ftitle\r"), "Fix the terminal title");
});

test("bracketed multiline paste stays one prompt until the final Enter", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(tracker.push("\x1b[200~Review the title logic\nand add tests\x1b[201~"), null);
  assert.equal(tracker.push("\r"), "Review the title logic and add tests");
});

test("cursor edits are reflected in the generated title", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(tracker.push("Fix Codx\x1b[De\x1b[C titles\r"), "Fix Codex titles");
});

test("manual and chat-aware titles outrank a CLI's generic OSC title", () => {
  const pane = {
    title: "GPT-5.6 Sol",
    osc: "⠋ Vibyra",
    chatTitle: "Fix terminal chat titles",
    customTitle: null,
  };
  assert.equal(terminalDisplayTitle(pane), "Fix terminal chat titles");
  assert.equal(terminalDisplayTitle({ ...pane, customTitle: "My terminal" }), "My terminal");
});
