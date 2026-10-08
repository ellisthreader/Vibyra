import test from "node:test";
import assert from "node:assert/strict";

import { findTool, VIBYRA_TOOLS } from "../src/lib/vibyraTools.ts";
import { isChrome, plainText } from "../src/lib/terminalPlainText.ts";
import { MAX_ROUNDS, NEEDS_ASKING, afterTools, performToolCalls, replyMemory } from "../src/state/chatToolTurn.ts";

// The rules the live-model harness (`mobile/scripts/verify-assistant-live.mjs`)
// found the hard way: a small model drifts after its task is done, repeats
// itself, and reads raw terminal bytes as nonsense. Each is pinned here without
// a model, so a later change cannot quietly bring one back.

const ran = [];
const runner = async (name, args) => {
  ran.push(name);
  return { summary: `ran ${name}`, detail: `ran ${name} ${JSON.stringify(args)}` };
};
const call = (name, args = {}) => ({ id: name, name, arguments: JSON.stringify(args) });

test("the assistant can do everything the transcript asked for", () => {
  // "Full screen it" had no tool, so the model focused it and said it had
  // maximised it. Every app action a person reached for is now a tool.
  for (const name of ["fullscreen_terminal", "focus_terminal", "read_terminal", "send_to_terminal", "close_terminals",
    "rename_terminal", "restart_terminal", "switch_project", "add_project", "rename_project", "remove_project",
    "open_panel", "close_panel", "side_panel"]) {
    assert.ok(findTool(name), `${name} is missing`);
  }
  const names = VIBYRA_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, "tool names are unique");
});

test("a drifting model cannot act on what nobody asked for", async () => {
  ran.length = 0;
  // "What projects do I have?" once ended by approving a permission prompt.
  const performed = await performToolCalls(
    [call("list_projects"), call("send_to_terminal", { terminal: "4", key: "yes" })],
    runner,
    replyMemory("what projects do I have?"),
  );
  assert.deepEqual(ran, ["list_projects"]);
  assert.equal(performed[1].result.skipped, true);
  assert.match(performed[1].result.detail, /did not ask for send to terminal/);
  // "Close this project" is leaving it, not forgetting it.
  assert.ok(!NEEDS_ASKING.remove_project.test("close this project and go back home"));
  assert.ok(NEEDS_ASKING.remove_project.test("remove the HKE project from Vibyra"));
  // Asking is what makes it allowed — and a bare "yes, do it" confirms.
  ran.length = 0;
  await performToolCalls([call("close_terminals", { all: true })], runner, replyMemory("close all the terminals"));
  await performToolCalls([call("close_terminals", { all: true })], runner, replyMemory("yes do it"));
  assert.deepEqual(ran, ["close_terminals", "close_terminals"]);
  // The transcript's own requests all get through.
  for (const said of ["Ok can u atleast launch 5 codex terminals please", "Oh... Ok jusst launch them with hiugh effort"]) {
    assert.ok(NEEDS_ASKING.open_terminals.test(said), said);
  }
  assert.ok(!NEEDS_ASKING.open_terminals.test("Full screen it didnt work.."), "a failed full screen never opens a terminal");
});

test("a reply never does the same thing twice", async () => {
  ran.length = 0;
  const memory = replyMemory("open 5 codex terminals");
  const open = call("open_terminals", { agent: "codex", count: 5 });
  await performToolCalls([open], runner, memory);
  const again = await performToolCalls([open, call("read_terminal", { terminal: "1" }), call("read_terminal", { terminal: "1" })], runner, memory);
  assert.deepEqual(ran, ["open_terminals", "read_terminal"], "five terminals asked for twice is still five");
  assert.equal(again[0].result.skipped, true);
  assert.equal(again[2].result.skipped, true, "a second identical read shows nothing new");
  // After something changes, reading again is worth doing.
  await performToolCalls([call("send_to_terminal", { terminal: "1", text: "go" }), call("read_terminal", { terminal: "1" })], runner, replyMemory("tell it to go"));
  assert.deepEqual(ran.slice(-2), ["send_to_terminal", "read_terminal"]);
});

test("the follow-up restates what the person asked, and when it may still act", () => {
  const performed = [{ call: call("list_terminals"), result: { summary: "Checked 4 terminals", detail: "terminal \"1\": Claude" } }];
  const open = afterTools(performed, true, "what is this claude terminal doing?");
  assert.match(open, /What I asked for: "what is this claude terminal doing\?"/);
  assert.match(open, /call that one tool now/);
  assert.match(open, /Never do anything I did not ask for/);
  const last = afterTools(performed, false, "x");
  assert.match(last, /No more actions/);
  assert.ok(MAX_ROUNDS >= 3, "list, then read, then answer needs three passes");
  const skipped = afterTools([{ call: call("remove_project"), result: { summary: "Not asked for", detail: "Not done", skipped: true } }]);
  assert.match(skipped, /remove_project: SKIPPED/);
});

test("raw terminal bytes read as what the terminal drew", () => {
  const raw = "\x1b]0;✳ Title\x1b\\\x1b[38;2;215;119;87m⏺\x1b[39m \x1b[1mRead\x1b[22m(src/App.tsx)\r\n" +
    "\x1b[2K\x1b[G✽ Working… (41s)\r\n\x1b[2K\x1b[G✽ Working… (41s)\r\nloading 10%\rloading 100%\r\n";
  assert.equal(plainText(raw), "⏺ Read(src/App.tsx)\n✽ Working… (41s)\nloading 100%");
  // A TUI's frame is not what it is doing.
  for (const line of ["╭────╮", "│ >        │", "  ⏵⏵ accept edits on · Claude Fable 5.1", "? for shortcuts"]) {
    assert.ok(isChrome(line), line);
  }
  assert.ok(!isChrome("✢ Linting the navbar changes… (esc to interrupt · 42s · ↓ 1.3k tokens)"));
  assert.ok(!isChrome("   - Local:        http://localhost:3000"));
});
