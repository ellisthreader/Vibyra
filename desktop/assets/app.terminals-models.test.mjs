import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-models.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const ptyRuntimeSource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("./app.terminals-state.js", import.meta.url), "utf8");
const layoutStyles = readFileSync(new URL("./app.terminals.layout.css", import.meta.url), "utf8");

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

test("terminal topbar identifies each agent and keeps bulk actions in the options menu", () => {
  assert.match(ptySource, /function terminalTabAgentLabel\(terminal, index\)/);
  assert.match(ptySource, /`\$\{agent\?\.label \|\| "Vibyra"\} \$\{index \+ 1\}`/);
  assert.match(ptySource, /id="open-terminal-toolbar"/);
  assert.match(ptySource, /data-terminal-close-all/);
  assert.match(ptySource, /Close all terminals/);
  assert.match(ptySource, /requestCloseAllPtyTerminals/);
  assert.match(ptySource, /\/desktop\/pty-terminals\/close-all/);
  assert.match(ptyRuntimeSource, /getElementById\("open-terminal-toolbar"\)/);
  assert.match(ptyRuntimeSource, /\[data-terminal-close-all\]/);
  assert.match(stateSource, /let terminalToolbarMenuOpen = false/);
  assert.match(layoutStyles, /\.terminal-tab-list\s*\{[\s\S]*justify-content: safe center;[\s\S]*max-width: min\(640px, 62vw\)/);
  assert.match(layoutStyles, /\.terminal-tab\s*\{[\s\S]*max-width: 180px;[\s\S]*min-width: 118px/);
  assert.match(layoutStyles, /\.terminal-toolbar-menu\s*\{[\s\S]*right: 0;[\s\S]*top: calc\(100% \+ 8px\)/);
});
