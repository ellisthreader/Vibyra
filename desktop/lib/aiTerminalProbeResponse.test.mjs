import test from "node:test";
import assert from "node:assert/strict";
import { terminalStartupProbeResponder } from "./aiTerminalProbeResponse.mjs";

test("Codex startup cursor probes keep the inline viewport anchored to the bottom row", () => {
  const responder = terminalStartupProbeResponder({
    agent: "vibyra",
    rows: 37,
    launchPlan: { runtimeId: "codex" }
  });

  assert.deepEqual(responder.filter("before\x1b[6nafter"), {
    output: "before\x1b[37;1Hafter",
    response: "\x1b[37;1R"
  });
  assert.deepEqual(responder.filter("\x1b[6nagain\x1b[6n"), {
    output: "again",
    response: "\x1b[37;6R\x1b[37;11R"
  });
});

test("mounted Codex terminals pass cursor probes to xterm for an accurate response", () => {
  const responder = terminalStartupProbeResponder({
    agent: "codex",
    rows: 28
  });

  responder.setRendererAttached(true);
  assert.deepEqual(responder.filter("before\x1b[6nafter"), {
    output: "before\x1b[28;1Hafter",
    response: "\x1b[28;1R"
  });
  assert.deepEqual(responder.filter("next\x1b[6nprobe"), {
    output: "next\x1b[6nprobe",
    response: ""
  });

  responder.setRendererAttached(false);
  assert.deepEqual(responder.filter("\x1b[6n"), {
    output: "",
    response: "\x1b[28;15R"
  });
});

test("split cursor probes are buffered without swallowing unrelated output", () => {
  const responder = terminalStartupProbeResponder({
    agent: "codex",
    rows: 24
  });

  assert.deepEqual(responder.filter("hello\x1b["), {
    output: "hello",
    response: ""
  });
  assert.deepEqual(responder.filter("6nworld"), {
    output: "\x1b[24;1Hworld",
    response: "\x1b[24;1R"
  });
});

test("Codex cursor probe responses follow live PTY resize rows", () => {
  const responder = terminalStartupProbeResponder({
    agent: "codex",
    rows: 24
  });

  responder.setRows(31);
  assert.deepEqual(responder.filter("\x1b[6n"), {
    output: "\x1b[31;1H",
    response: "\x1b[31;1R"
  });
});

test("detached Codex probes use tracked cursor coordinates after startup", () => {
  const responder = terminalStartupProbeResponder({
    agent: "codex",
    cols: 100,
    rows: 28
  });

  assert.equal(responder.filter("\x1b[6n").response, "\x1b[28;1R");
  assert.deepEqual(responder.filter("\x1b[24;3H\x1b[6n"), {
    output: "\x1b[24;3H",
    response: "\x1b[24;3R"
  });
  assert.deepEqual(responder.filter("\r\nready\x1b[6n"), {
    output: "\r\nready",
    response: "\x1b[25;6R"
  });
});

test("non-Codex terminals pass cursor probes through unchanged", () => {
  const responder = terminalStartupProbeResponder({
    agent: "claude",
    rows: 30,
    launchPlan: { runtimeId: "claude" }
  });

  assert.deepEqual(responder.filter("\x1b[6n"), {
    output: "\x1b[6n",
    response: ""
  });
});
