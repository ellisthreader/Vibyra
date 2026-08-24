import assert from "node:assert/strict";
import test from "node:test";

import {
  needsPromptDerivedTitle,
  titleFromPrompt,
} from "../src/lib/terminalChatTitle.ts";
import { TerminalPromptTracker } from "../src/lib/terminalPromptTracker.ts";

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

test("a long review request becomes a topic instead of copied prompt filler", () => {
  assert.equal(
    titleFromPrompt(
      "I want you to deeply review what you have done for the ChatGPT title name changes. "
      + "I have asked you to introduce something that Claude already does successfully.",
    ),
    "review ChatGPT title name changes",
  );
});

test("a dictated prompt is named after the request, not its courtesies", () => {
  assert.equal(titleFromPrompt("Can you run the mobile app, please?"), "run the mobile app");
  assert.equal(
    titleFromPrompt("Review the addresses screen, thanks"),
    "Review the addresses screen",
  );
});

test("a false start does not name the pane after the abandoned sentence", () => {
  assert.equal(
    titleFromPrompt("Can you...\nCan you make it so I can test place an order please?"),
    "make it so I can test place an order",
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
  assert.equal(titleFromPrompt("dd"), null);
});

/** The tracker reports the submitted line; `titleFromPrompt` decides its name. */
function submit(tracker, data) {
  const submitted = tracker.push(data);
  return submitted === null ? null : titleFromPrompt(submitted);
}

test("an ignored utility command does not block the first substantive prompt", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "/status\r"), null);
  assert.equal(submit(tracker, "Fix terminal title generation\r"), "Fix terminal title generation");
});

test("Ctrl-C discards an abandoned prompt before the next submission", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Do not keep this\x03"), null);
  assert.equal(submit(tracker, "Fix terminal title generation\r"), "Fix terminal title generation");
});

test("typed input is committed only when Enter submits it", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Fix the terminal titel"), null);
  assert.equal(submit(tracker, "\x7f\x7f\x7f\x7f\x7ftitle\r"), "Fix the terminal title");
});

test("bracketed multiline paste stays one prompt until the final Enter", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "\x1b[200~Review the title logic\nand add tests\x1b[201~"), null);
  assert.equal(submit(tracker, "\r"), "Review the title logic and add tests");
});

test("terminal-generated OSC colour replies never become prompt text", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(
    submit(tracker, "\x1b]10;rgb:eeee/eaea/f8f8\x1b\\\x1b]11;rgb:0b0b/0b0b/0b0b\x1b\\"),
    null,
  );
  assert.equal(
    submit(tracker, "Review terminal names across providers\r"),
    "Review terminal names across providers",
  );
});

test("split OSC and DCS protocol replies are ignored without losing typed input", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Fix terminal \x1b]10;rgb:eeee/"), null);
  assert.equal(submit(tracker, "eaea/f8f8\x1b\\titles\x1bP1$r0m\x1b"), null);
  assert.equal(submit(tracker, "\\ everywhere\r"), "Fix terminal titles everywhere");
});

test("terminal protocol replies stay ignored across every possible chunk boundary", () => {
  const frames = [
    "\x1b]10;rgb:eeee/eaea/f8f8\x1b\\",
    "\x1b]11;rgb:0b0b/0b0b/0b0b\x07",
    "\x1bP1$r0m\x1b\\",
    "\x1b[?1;2c",
    "\x1bOA",
    "\x1b_private\x1b\\",
    "\x9d10;rgb:eeee/eaea/f8f8\x9c",
  ];
  for (const frame of frames) {
    for (let split = 0; split <= frame.length; split += 1) {
      const tracker = new TerminalPromptTracker();
      assert.equal(submit(tracker, `Fix ${frame.slice(0, split)}`), null);
      assert.equal(submit(tracker, `${frame.slice(split)}terminal titles\r`), "Fix terminal titles");
    }
  }
});

test("cursor edits are reflected in the generated title", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Fix Codx\x1b[De\x1b[C titles\r"), "Fix Codex titles");
});

test("application-mode cursor keys edit the line like their CSI forms", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Fix Codx\x1bODe\x1bOC titles\r"), "Fix Codex titles");
});

test("Alt-prefixed keys never leak their bracket into the prompt", () => {
  const tracker = new TerminalPromptTracker();
  assert.equal(submit(tracker, "Fix \x1b\x1b[Aterminal titles\r"), "Fix terminal titles");
});
