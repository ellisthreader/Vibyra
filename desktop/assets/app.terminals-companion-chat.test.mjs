import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-companion-chat.js", import.meta.url), "utf8");

test("companion keeps the empty chat and composer concise", () => {
  assert.equal((source.match(/data-terminal-ai-prompt="/g) || []).length, 2);
  assert.doesNotMatch(source, /Enter to send/);
  assert.match(source, /projects, terminals, and desktop/);
  assert.doesNotMatch(source, /Ask about this terminal|Using context from|active terminal context/);
});

test("companion action results use the executor summary", async () => {
  const calls = [];
  const context = companionContext({
    runDesktopActions: async (actions, options) => {
      calls.push({ actions, options });
      return "Opening 1 GPT-5.5 terminal in Terminals.";
    }
  });
  const actions = [{ type: "open_terminals", count: 1 }];

  const text = await context.terminalAiChatResultText({ reply: "Optimistic copy", actions });

  assert.equal(text, "Opening 1 GPT-5.5 terminal in Terminals.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actions, actions);
  assert.equal(calls[0].options.desktopActionContextScope, "terminal:terminal-1");
});

test("companion ordinary chat does not invoke the action executor", async () => {
  let calls = 0;
  const context = companionContext({
    runDesktopActions: async () => {
      calls += 1;
      return "";
    }
  });

  assert.equal(await context.terminalAiChatResultText({ reply: "Local answer" }), "Local answer");
  assert.equal(calls, 0);
});

test("companion rejects unsupported desktop actions", async () => {
  const context = companionContext({ runDesktopActions: async () => "" });

  await assert.rejects(
    () => context.terminalAiChatResultText({ actions: [{ type: "unknown" }] }),
    /unsupported desktop action/
  );
});

test("companion moves action messages when the active terminal changes", () => {
  let activeId = "old";
  const context = companionContext({
    terminalCompanionActiveTerminal: () => ({ id: activeId })
  });
  const sourceThread = context.terminalAiChatThread({ id: "old" });
  const user = { role: "user", text: "Open a terminal" };
  const assistant = { role: "assistant", text: "Opening it" };
  sourceThread.messages.push(user, assistant);
  activeId = "new";

  context.moveTerminalAiActionMessages(sourceThread, user, assistant);

  assert.equal(sourceThread.messages.length, 0);
  assert.equal(context.terminalAiChatThread({ id: "new" }).messages.length, 2);
});

test("companion uses terminal setup scope before a terminal exists", () => {
  const context = companionContext({
    currentProject: () => ({ id: "unrelated-project" }),
    selectedProjectId: "unrelated-project",
    terminalProjectForSetup: () => "setup-project"
  });

  assert.equal(context.terminalAiProjectId({ id: "terminal-1", projectId: "" }), "");
  assert.equal(context.terminalAiProjectId(null), "setup-project");
});

test("companion preserves an intentional no-project terminal setup scope", () => {
  const context = companionContext({
    currentProject: () => ({ id: "unrelated-project" }),
    selectedProjectId: "unrelated-project",
    terminalProjectForSetup: () => ""
  });

  assert.equal(context.terminalAiProjectId(null), "");
});

function companionContext(overrides = {}) {
  const context = {
    desktopActionContextForScope: () => null,
    desktopActionContextScope: (kind, id) => `${kind}:${id}`,
    registerDesktopActionContextStore() {},
    requestAnimationFrame() {},
    terminalCompanionActiveTerminal: () => ({ id: "terminal-1" }),
    ...overrides
  };
  vm.runInNewContext(source, context);
  return context;
}
