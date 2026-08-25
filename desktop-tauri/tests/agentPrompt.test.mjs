import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentPrompt, promptHeadline, promptOption } from "../src/lib/agentPrompt.ts";
import { buttonLabel } from "../src/lib/agentPromptIntent.ts";

/** The Codex approval prompt this feature was built from, verbatim. */
function codexPrompt(extra = []) {
  return [
    "Would you like to run the following command?",
    "",
    "Environment: local",
    "",
    "Reason: May I resolve the current LAN interface and inspect the running Expo"
      + " launcher outside the restricted sandbox to generate a valid fresh QR?",
    "",
    "$ ip -brief -4 address show",
    "ps -eo pid,ppid,pgid,stat,etime,args | rg '173875|173906|173914' | rg -v 'rg '",
    "sed -n '1,300p' scripts/mobile-dev.mjs",
    "",
    "> 1. Yes, proceed (y)",
    "  2. Yes, and don't ask again for commands that start with `ip -brief -4"
      + " address show` (p)",
    "  3. No, and tell Codex what to do differently (esc)",
    "",
    "Press enter to confirm or esc to cancel",
    ...extra,
  ];
}

test("the question is the ask, not the nearest line ending in a question mark", () => {
  const offer = parseAgentPrompt(codexPrompt(), 7);
  assert.equal(offer.question, "Would you like to run the following command?");
});

test("the command block is captured, first line first", () => {
  const offer = parseAgentPrompt(codexPrompt(), 7);
  assert.equal(offer.detail[0], "ip -brief -4 address show");
  assert.equal(offer.detail.length, 3);
});

test("options carry the keystroke the agent is waiting for", () => {
  const { options } = parseAgentPrompt(codexPrompt(), 7);
  assert.deepEqual(options.map((option) => option.key), ["y", "p", "3"]);
  // A drawn list commits on the keypress. An Enter behind it would land in the
  // composer that replaces the prompt and submit whatever was sitting there.
  assert.deepEqual(options.map((option) => option.submit), [false, false, false]);
});

test("\"yes, and don't ask again\" is a remember, never an affirm", () => {
  const offer = parseAgentPrompt(codexPrompt(), 7);
  assert.deepEqual(
    offer.options.map((option) => option.intent),
    ["affirm", "remember", "decline"],
  );
  // The toast reads its buttons through this, so the always-allow can never
  // reach one: it stays in the terminal where the agent scoped it.
  assert.equal(promptOption(offer, "affirm").key, "y");
  assert.equal(promptOption(offer, "decline").key, "3");
});

test("a prompt with output under it has already been answered", () => {
  const offer = parseAgentPrompt(
    codexPrompt(["", "Running ip -brief…", "eth0 UP 192.168.1.24/24", "lo UP 127.0.0.1/8"]),
    7,
  );
  assert.equal(offer, null);
});

test("a redraw that changes nothing keeps the same fingerprint", () => {
  const first = parseAgentPrompt(codexPrompt(), 7);
  // Same block, repainted with the selection cursor on a different row.
  const moved = codexPrompt().map((line) =>
    line.startsWith("> 1.") ? "  1. Yes, proceed (y)" : line.replace(/^  3\./, "> 3."),
  );
  assert.equal(parseAgentPrompt(moved, 7).fingerprint, first.fingerprint);
});

test("a different question gets a different fingerprint", () => {
  const first = parseAgentPrompt(codexPrompt(), 7);
  const other = codexPrompt().map((line) =>
    line.startsWith("$ ") ? "$ rm -rf build" : line,
  );
  assert.notEqual(parseAgentPrompt(other, 7).fingerprint, first.fingerprint);
});

test("the [y/n] shape is read as yes and no", () => {
  const offer = parseAgentPrompt(
    ["Building the bundle…", "", "$ npm run build", "Do you want to proceed? [y/n]"],
    3,
  );
  assert.equal(offer.question, "Do you want to proceed? [y/n]");
  assert.deepEqual(offer.options.map((option) => option.key), ["y", "n"]);
  // A line-oriented read does nothing until Enter, so this shape carries one.
  assert.deepEqual(offer.options.map((option) => option.submit), [true, true]);
  assert.equal(offer.detail[0], "npm run build");
});

test("a numbered list with no question and no command is not a prompt", () => {
  const offer = parseAgentPrompt(["Files changed:", "1. App.tsx", "2. main.tsx"], 1);
  assert.equal(offer, null);
});

test("plain output is not a prompt", () => {
  const offer = parseAgentPrompt(["> npm run build", "vite v5.4.0 building…", "done in 1.2s"], 1);
  assert.equal(offer, null);
});

test("button labels keep the answer and drop the clause", () => {
  assert.equal(buttonLabel("Yes, proceed"), "Yes, proceed");
  assert.equal(buttonLabel("No, and tell Codex what to do differently"), "No");
  assert.equal(buttonLabel("Allow this command for the whole run"), "Allow this command fo…");
});

test("the headline says whether a command is involved", () => {
  const withCommand = parseAgentPrompt(codexPrompt(), 7);
  assert.equal(promptHeadline("Codex", withCommand), "Codex wants to run a command");
  const withoutCommand = parseAgentPrompt(
    ["Would you like me to continue?", "1. Yes (y)", "2. No (n)"],
    2,
  );
  assert.equal(promptHeadline("Codex", withoutCommand), "Codex needs your answer");
});
