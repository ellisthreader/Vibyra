import test from "node:test";
import assert from "node:assert/strict";
import { aiTerminalAgentStatus, listAiTerminalAgentStatuses } from "./aiTerminalProcess.mjs";
import { terminalEnv } from "./aiTerminalVibyraShell.mjs";

test("Vibyra PTY agent is the default available terminal agent", () => {
  const status = aiTerminalAgentStatus();

  assert.equal(status.key, "vibyra");
  assert.equal(status.label, "Vibyra");
  assert.equal(status.available, true);
});

test("terminal agent statuses include Vibyra before optional local CLIs", () => {
  const statuses = listAiTerminalAgentStatuses();

  assert.equal(statuses[0].key, "vibyra");
  assert.ok(statuses.some((status) => status.key === "codex"));
  assert.ok(statuses.some((status) => status.key === "shell"));
});

test("PTY terminal env carries selected OpenRouter model metadata", () => {
  const env = terminalEnv({
    agent: "vibyra",
    label: "Vibyra",
    model: "qwen/qwen3-coder",
    reasoningEffort: "high",
    projectId: "project-1",
    cols: 120,
    rows: 40
  });

  assert.equal(env.VIBYRA_TERMINAL_AGENT, "vibyra");
  assert.equal(env.VIBYRA_OPENROUTER_MODEL, "qwen/qwen3-coder");
  assert.equal(env.VIBYRA_REASONING_EFFORT, "high");
  assert.equal(env.VIBYRA_TERMINAL_PROJECT_ID, "project-1");
});
