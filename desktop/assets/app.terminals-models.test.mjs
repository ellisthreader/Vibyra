import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-models.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");

test("dynamic OpenRouter models extend rather than replace official built-ins", () => {
  const context = {
    config: () => ({
      chatModelGroups: [{
        title: "OpenAI models",
        options: [{ key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }]
      }]
    }),
    window: { addEventListener() {} }
  };
  vm.runInNewContext(source, context);

  const groups = context.mergeTerminalModelGroups(
    context.config().chatModelGroups,
    [{
      title: "OpenAI",
      options: [{ key: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }]
    }]
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(groups.flatMap((group) => group.options.map((model) => model.key)))),
    ["gpt-5.5", "openai/gpt-5.5-pro"]
  );
});

test("official built-in terminal models route to their real provider CLIs", () => {
  assert.match(ptySource, /provider === "openai"\) return "codex"/);
  assert.match(ptySource, /provider === "claude"\) return "claude"/);
  assert.match(ptySource, /provider === "gemini"\) return "gemini"/);
  assert.doesNotMatch(ptySource, /return \["openai", "claude", "gemini"\]\.includes\(provider\) \? "official"/);
  assert.match(ptySource, /terminalAgents\.some\(\(agent\) => agent\.key === reportedAgent\)\) return reportedAgent/);
});
