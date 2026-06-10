import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { desktopActionsForPrompt } from "../lib/desktopActions.mjs";

const actionSource = readFileSync(
  new URL("./app.desktop-actions.js", import.meta.url),
  "utf8"
);

test("rejects full access for provider-qualified GPT-5.5 Pro wrappers", async () => {
  const plan = desktopActionsForPrompt(
    "Open four GPT 5.5 Pro terminals with full permission.",
    { projectId: "saas" }
  );

  assert.deepEqual(plan.actions, [{
    type: "open_terminals",
    count: 4,
    model: "openai/gpt-5.5-pro",
    effort: "medium",
    permissionMode: "full",
    projectId: "saas"
  }]);

  const launches = [];
  const context = actionContext({
    createTerminals(count, model, options) {
      launches.push({ count, model, options });
    }
  });

  const summary = await context.runDesktopActions(plan.actions);

  assert.equal(summary, "Full-access launches are currently supported only for Codex terminals.");
  assert.deepEqual(launches, []);
});

function actionContext(overrides = {}) {
  const context = {
    activeTerminalId: "",
    chatModels: [],
    createTerminals() {},
    createTerminal() {
      return null;
    },
    fetch: async () => jsonResponse({ ok: true }),
    findTerminal(id) {
      return context.terminals.find((terminal) => terminal.id === id) || null;
    },
    forceTerminalRender: false,
    maxTerminals: 12,
    modelChoices: () => [
      { key: "auto", label: "Auto", provider: "auto" },
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
      {
        key: "openai/gpt-5.5-pro",
        modelKey: "openai/gpt-5.5-pro",
        label: "GPT-5.5 Pro",
        provider: "openai"
      }
    ],
    modelLocked: () => false,
    normalizeCount: (value) => Math.max(1, Math.min(12, Number(value) || 1)),
    openTerminalCompanionPanel() {},
    openTokenModal() {},
    removeLocalPtyTerminal() {},
    render() {},
    saveTerminals() {},
    selectedProjectId: "unrelated-project",
    setPage() {},
    settingsTerminalId: "",
    syncPtyTerminals: async () => {},
    terminalProviderKeyForModel: (model) => model.provider,
    terminals: [],
    window: { confirm: () => true },
    ...overrides
  };
  vm.runInNewContext(actionSource, context);
  return context;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
