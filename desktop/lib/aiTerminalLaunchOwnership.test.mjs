import test from "node:test";
import assert from "node:assert/strict";
import { assertAiTerminalLaunchOwnership } from "./aiTerminalLaunchOwnership.mjs";
import { VIBYRA_AGENT_ENTRY_PATH } from "./aiTerminalRuntimeCatalog.mjs";

test("accepts managed interactive Codex as the visible Vibyra process", () => {
  assert.doesNotThrow(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: "/opt/vibyra/codex",
    agentEnginePath: "/opt/vibyra/codex",
    runtimeId: "codex",
    launchMode: "native-provider"
  }, [
    "--no-alt-screen",
    "--model",
    "openai/gpt-5.5",
    "-c",
    'model_provider="vibyra"'
  ]));
});

test("blocks a Node Auto dispatcher from owning the terminal", () => {
  assert.throws(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: process.execPath,
    agentEnginePath: "/opt/vibyra/codex",
    runtimeId: "",
    launchMode: "native-provider"
  }, [
    "/app/desktop/lib/aiTerminalOpenRouterCli.mjs"
  ]), /selected native provider/);
});

test("accepts the exact bundled Vibyra Agent Node entry as foreground owner", () => {
  assert.doesNotThrow(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: process.execPath,
    agentEnginePath: "",
    runtimeId: "vibyra-agent",
    launchMode: "vibyra-agent"
  }, [VIBYRA_AGENT_ENTRY_PATH]));
});

test("rejects provider imitation and altered Vibyra Agent entry arguments", () => {
  assert.throws(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: process.execPath,
    agentEnginePath: "",
    runtimeId: "vibyra-agent",
    launchMode: "native-provider"
  }, [VIBYRA_AGENT_ENTRY_PATH]), /selected native provider/);
  assert.throws(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: process.execPath,
    agentEnginePath: "",
    runtimeId: "vibyra-agent",
    launchMode: "vibyra-agent"
  }, [VIBYRA_AGENT_ENTRY_PATH, "--provider-ui", "claude"]), /selected native provider/);
});

test("blocks one-shot Codex exec from owning the Vibyra terminal", () => {
  assert.throws(() => assertAiTerminalLaunchOwnership({
    key: "vibyra",
    commandPath: "/opt/vibyra/codex",
    agentEnginePath: "/opt/vibyra/codex",
    runtimeId: "codex"
  }, [
    "exec",
    "--no-alt-screen",
    "-c",
    'model_provider="vibyra"'
  ]), /selected native provider/);
});

test("accepts managed Claude and Gemini as foreground Vibyra providers", () => {
  for (const runtimeId of ["claude", "gemini"]) {
    assert.doesNotThrow(() => assertAiTerminalLaunchOwnership({
      key: "vibyra",
      commandPath: `/opt/vibyra/${runtimeId}`,
      agentEnginePath: `/opt/vibyra/${runtimeId}`,
      runtimeId,
      launchMode: "native-provider"
    }, ["--model", `${runtimeId}-model`]));
  }
});
