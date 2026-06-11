import test from "node:test";
import assert from "node:assert/strict";
import {
  commandIsKnown,
  commandIsLocal,
  commandIsWorkflow,
  parseProviderInput,
  providerCommandHelp,
  providerCommandHint,
  providerCommandPrompt,
  providerCommandUsage,
  terminalCommandCategories,
  terminalCommandMetadata,
  terminalCommandProfile,
  terminalCommandProvider,
  terminalLocalCommands
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
  assert.equal(commandIsKnown(profiles[0], "/checkpoint"), true);
  assert.equal(commandIsKnown(profiles[0], "/history"), true);
  assert.equal(commandIsKnown(profiles[0], "/unstage"), true);
  assert.equal(commandIsKnown(profiles[0], "/plugins"), false);
  assert.equal(commandIsKnown(profiles[0], "/extensions"), false);
  assert.equal(commandIsKnown(profiles[0], "/claude-api"), false);
});

test("profile exposes immutable structured categories and command metadata", () => {
  const profile = terminalCommandProfile();
  const categories = terminalCommandCategories(profile);
  const inspect = terminalCommandMetadata("/inspect", profile);
  const effort = terminalCommandMetadata("/effort", profile);

  assert.deepEqual(categories.map(({ key }) => key), ["terminal", "workspace", "git", "delivery", "quality"]);
  assert.equal(inspect.kind, "agent-workflow");
  assert.equal(inspect.category, "workspace");
  assert.equal(inspect.usage, "/inspect [target]");
  assert.deepEqual(inspect.argument, { name: "target", required: false });
  assert.equal(effort.kind, "local");
  assert.equal(effort.dispatch, "effort");
  assert.equal(effort.usage, "/effort <default|low|medium|high|xhigh>");
  assert.deepEqual(effort.argument, { name: "level", required: true });
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.commands), true);
  assert.equal(Object.isFrozen(profile.localCommands), true);
  assert.equal(Object.isFrozen(profile.commandMetadata), true);
  assert.equal(Object.isFrozen(categories), true);
  assert.equal(Object.isFrozen(inspect), true);
});

test("every advertised command is classified and every workflow is executable", () => {
  const profile = terminalCommandProfile();
  const canonicalCommands = terminalCommandCategories(profile).flatMap((category) => category.commands);

  assert.equal(new Set(canonicalCommands).size, canonicalCommands.length);
  for (const command of canonicalCommands) {
    const metadata = terminalCommandMetadata(command, profile);
    assert.ok(metadata, `missing metadata for ${command}`);
    assert.ok(["local", "agent-workflow"].includes(metadata.kind), `invalid kind for ${command}`);
    assert.ok(metadata.summary, `missing summary for ${command}`);
    assert.ok(metadata.usage, `missing usage for ${command}`);
    if (metadata.kind === "local") {
      assert.equal(metadata.dispatch, command.slice(1), `invalid local dispatch for ${command}`);
    }
    if (metadata.kind === "agent-workflow") {
      assert.ok(metadata.workflowPrompt, `missing workflow prompt for ${command}`);
      assert.match(providerCommandPrompt(command, "sample target"), /Target: sample target$/);
    }
  }
});

test("shared input parser handles canonical commands, aliases, shell, and file mentions", () => {
  assert.deepEqual(parseProviderInput("/review current changes"), {
    kind: "slash",
    command: "/review",
    args: "current changes"
  });
  assert.deepEqual(parseProviderInput("/SESSION"), {
    kind: "slash",
    command: "/status",
    args: ""
  });
  assert.deepEqual(parseProviderInput("/ls src/lib"), {
    kind: "slash",
    command: "/files",
    args: "src/lib"
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

test("aliases resolve to canonical metadata and accurate execution kinds", () => {
  assert.equal(terminalCommandMetadata("/session").name, "/status");
  assert.equal(terminalCommandMetadata("/changes").name, "/diff");
  assert.equal(commandIsLocal("/session"), true);
  assert.equal(commandIsLocal("/files"), true);
  assert.equal(commandIsLocal("/git"), true);
  assert.equal(commandIsLocal("/history"), true);
  assert.equal(commandIsLocal("/review"), false);
  assert.equal(commandIsWorkflow("/changes"), true);
  assert.equal(commandIsWorkflow("/permissions"), false);
  assert.equal(providerCommandUsage("/pwd"), "/pwd");
  assert.equal(providerCommandUsage("/files"), "/files [path]");
  assert.equal(providerCommandUsage("/history"), "/history [count]");
  assert.equal(providerCommandUsage("/unstage"), "/unstage <path|all>");
  assert.equal(providerCommandHint("/tests"), "Run focused tests and diagnose failures.");
});

test("local command metadata is explicit and dispatchable", () => {
  const expected = ["/pwd", "/files", "/git", "/history", "/unstage", "/identity"];
  const localCommands = terminalLocalCommands();

  assert.ok(expected.every((command) => localCommands.includes(command)));
  assert.deepEqual(
    expected.map((command) => terminalCommandMetadata(command).dispatch),
    ["pwd", "files", "git", "history", "unstage", "identity"]
  );
  assert.equal(terminalCommandMetadata("/unstage").summary, "Remove staged context without changing Git.");
  assert.equal(terminalCommandMetadata("/unstage").argument.required, true);
  assert.equal(terminalCommandMetadata("/git").argument, null);
});

test("help groups only implemented local commands and mapped agent workflows", () => {
  const help = providerCommandHelp();

  assert.match(help, /^Terminal\n/);
  assert.match(help, /\n\nWorkspace\n/);
  assert.match(help, /\n\nGit\n/);
  assert.match(help, /\/status\s+Show runtime, model, thread, and access/);
  assert.match(help, /\/files\s+List files at a workspace path/);
  assert.match(help, /\/unstage\s+Remove staged context without changing Git/);
  assert.match(help, /\/inspect\s+Inspect a target using repository evidence/);
  assert.match(help, /\/checkpoint\s+Summarize current progress and verification/);
  assert.match(help, /\/test\s+Run focused tests and diagnose failures/);
  assert.doesNotMatch(help, /\/plugins|\/extensions|\/mcp|\/hooks|\/session/);
});

test("practical workflows produce disciplined provider-neutral prompts", () => {
  const inspect = providerCommandPrompt("/inspect", "desktop/lib");
  const checkpoint = providerCommandPrompt("/checkpoint", "");

  assert.match(inspect, /do not edit unless the target explicitly requests changes/i);
  assert.match(inspect, /Target: desktop\/lib/);
  assert.match(checkpoint, /Do not create a Git commit unless explicitly requested/);
  assert.match(checkpoint, /Target: the current workspace and conversation/);
  assert.doesNotMatch(`${inspect}\n${checkpoint}`, /Claude|Codex|Gemini/);
});
