import test from "node:test";
import assert from "node:assert/strict";
import {
  commandIsKnown,
  commandIsLocal,
  parseProviderInput,
  providerCommandHelp,
  providerCommandPrompt,
  terminalCommandProfile,
  terminalCommandProvider
} from "./aiTerminalCommandProfiles.mjs";

test("every API model gets the same truthful Vibyra Agent command profile", () => {
  const models = [
    "deepseek/deepseek-chat-v3.1",
    "qwen/qwen3-coder",
    "x-ai/grok-code-fast-1",
    "meta-llama/llama-4-maverick",
    "anthropic/claude-sonnet-4",
    "openai/gpt-5.5",
    "google/gemini-2.5-pro"
  ];
  const profiles = models.map((model) => terminalCommandProfile(model));

  assert.ok(profiles.every((profile) => profile === profiles[0]));
  assert.ok(models.every((model) => terminalCommandProvider(model) === "vibyra-agent"));
  assert.equal(profiles[0].label, "Vibyra Agent");
  assert.equal(commandIsKnown(profiles[0], "/review"), true);
  assert.equal(commandIsKnown(profiles[0], "/permissions"), true);
  assert.equal(commandIsKnown(profiles[0], "/security-review"), true);
  assert.equal(commandIsKnown(profiles[0], "/build"), true);
  assert.equal(commandIsKnown(profiles[0], "/plugins"), false);
  assert.equal(commandIsKnown(profiles[0], "/extensions"), false);
  assert.equal(commandIsKnown(profiles[0], "/claude-api"), false);
});

test("shared input parser handles commands, aliases, shell, and file mentions", () => {
  assert.deepEqual(parseProviderInput("/review current changes"), {
    kind: "slash",
    command: "/review",
    args: "current changes"
  });
  assert.deepEqual(parseProviderInput("/quit"), {
    kind: "slash",
    command: "/exit",
    args: ""
  });
  assert.deepEqual(parseProviderInput("!npm test"), {
    kind: "shell",
    command: "npm test",
    shellMode: false
  });
  assert.deepEqual(parseProviderInput("inspect @src/app.ts and @package.json"), {
    kind: "prompt",
    prompt: "inspect @src/app.ts and @package.json",
    mentions: ["src/app.ts", "package.json"]
  });
});

test("help lists only commands Vibyra Agent implements", () => {
  const profile = terminalCommandProfile("deepseek/deepseek-chat-v3.1");
  const help = providerCommandHelp(profile);

  assert.match(help, /\/status\s+show runtime, model, thread, and access/);
  assert.match(help, /\/stop\s+cancel the current task/);
  assert.match(help, /\/plan\s+create a concrete implementation plan/);
  assert.match(help, /\/shell\s+show direct shell syntax and access rules/);
  assert.match(help, /\/test\s+run the focused tests that prove the change/);
  assert.doesNotMatch(help, /\/plugins|\/extensions|\/mcp|\/hooks/);
  assert.equal(commandIsLocal("/status"), true);
  assert.equal(commandIsLocal("/review"), false);
});

test("workflow commands become executable agent prompts", () => {
  const prompt = providerCommandPrompt("/review", "current changes");

  assert.match(prompt, /Put findings first/);
  assert.match(prompt, /Target: current changes/);
  assert.doesNotMatch(prompt, /Claude|Codex|Gemini/);
  assert.match(providerCommandPrompt("/security-review", "auth flow"), /severity, evidence/);
  assert.match(providerCommandPrompt("/build", "desktop"), /relevant build/);
});
