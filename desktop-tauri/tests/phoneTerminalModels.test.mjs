import assert from "node:assert/strict";
import test from "node:test";
import { phoneTerminalModels } from "../src/lib/phoneTerminalModels.ts";
import { answerTerminalRequest } from "../src/lib/phoneTerminalAnswer.ts";
import { STATIC_GROUPS } from "../src/lib/staticModels.ts";

const agents = [{ id: "codex", installed: true }, { id: "claude", installed: true }];
const models = () => phoneTerminalModels(STATIC_GROUPS, agents, ["codex", "claude"]);
test("phone gets current Mac routes, native IDs and effort defaults", () => {
  const choices = models();
  for (const id of ["openai/gpt-6-astra", "openai/gpt-6-sol", "openai/gpt-6-luna", "anthropic/claude-opus-5.5", "anthropic/claude-fable-5.1"]) {
    assert.ok(choices.some(model => model.id === id), id);
  }
  assert.equal(choices.find(model => model.id === "anthropic/claude-opus-5.5").model, "claude-opus-5-5");
  assert.ok(!choices.some(model => model.model.endsWith("-fast")), "a Claude chat cannot start a fast variant");
  assert.equal(choices.find(model => model.id === "anthropic/claude-opus-5.5").effort, "medium");
  assert.deepEqual(phoneTerminalModels(STATIC_GROUPS, agents, []), []);
  assert.deepEqual(phoneTerminalModels(STATIC_GROUPS, [], ["codex", "claude"]), []);
  assert.ok(phoneTerminalModels(STATIC_GROUPS, agents, ["codex"]).every(model => model.kind === "codex"));
});
test("updated Mac catalogue entries pass through without a phone list change", () => {
  const groups = STATIC_GROUPS.map(group => ({ ...group, models: group.models.map(model => ({ ...model, label: `${model.label} updated` })) }));
  assert.ok(phoneTerminalModels(groups, agents, ["codex"]).every(model => model.name.endsWith("updated")));
});
test("model launch revalidates provider and availability, then forwards the exact native choice", async () => {
  const calls = [];
  const deps = { agents: async () => agents, models: async () => models(),
    launch: async (...args) => { calls.push(args); return [{ conversationId: "chat" }]; } };
  const request = { id: "r", action: "create", kind: "claude", projectId: "p", title: "Opus", requestId: "intent", model: "anthropic/claude-opus-5.5" };
  assert.deepEqual(await answerTerminalRequest(request, deps), { result: { conversationId: "chat" } });
  assert.equal(calls[0][4], "intent");
  assert.equal(calls[0][5].model, "claude-opus-5-5");
  assert.match((await answerTerminalRequest({ ...request, kind: "codex" }, deps)).error, /no longer available/);
  assert.match((await answerTerminalRequest(request, { ...deps, models: async () => [] })).error, /no longer available/);
  assert.equal(calls.length, 1);
  assert.deepEqual(await answerTerminalRequest({ action: "models" }, deps), { result: { models: models(), permissionModes: ["standard", "full"], effortSelection: true } });
});

test("phone permissions are explicit, validated and independent of Safe mode", async () => {
  const calls = [];
  const deps = { agents: async () => agents, models: async () => models(),
    launch: async (...args) => { calls.push(args); return [{ conversationId: 'chat' }]; } };
  const request = { id: 'r', action: 'create', kind: 'codex', projectId: 'p', title: 'Work', requestId: 'intent' };
  for (const permissionMode of [undefined, 'standard', 'full']) {
    for (const safeMode of [false, true]) {
      assert.ok((await answerTerminalRequest({ ...request, permissionMode, safeMode }, deps)).result);
      assert.equal(calls.at(-1)[6], permissionMode);
      assert.equal(calls.at(-1)[3], safeMode);
    }
  }
  assert.match((await answerTerminalRequest({ ...request, permissionMode: 'everything' }, deps)).error, /Standard or Full/);
  const shell = { ...deps, agents: async () => [{ id: 'shell', installed: true }] };
  assert.match((await answerTerminalRequest({ ...request, kind: 'shell', permissionMode: 'full' }, shell)).error, /AI terminal/);
  assert.equal(calls.length, 6);
});

test('every enabled computer runner contributes its models without a company allowlist', async () => {
  const allAgents = ['codex', 'claude', 'gemini', 'qwen', 'aider', 'opencode'].map(id => ({ id, installed: true }));
  const choices = phoneTerminalModels(STATIC_GROUPS, allAgents, allAgents.map(agent => agent.id));
  assert.ok(choices.some(model => model.kind === 'gemini'));
  assert.ok(choices.some(model => model.kind === 'qwen'));
  assert.ok(choices.some(model => model.id.startsWith('x-ai/') && model.kind === 'aider'));
  assert.ok(choices.some(model => model.id.startsWith('deepseek/') && model.kind === 'aider'));
  const openCode = phoneTerminalModels(STATIC_GROUPS, allAgents, ['opencode']);
  assert.ok(openCode.some(model => model.id.startsWith('x-ai/') && model.kind === 'opencode'));
  const calls = [];
  const deps = { agents: async () => allAgents, models: async () => choices,
    launch: async (...args) => { calls.push(args); return [{ paneId: 12 }]; } };
  for (const kind of ['gemini', 'qwen', 'aider']) {
    const selected = choices.find(model => model.kind === kind);
    const request = { id: kind, action: 'create', kind, model: selected.id, projectId: 'p', title: 'Work', requestId: kind, permissionMode: 'standard' };
    assert.deepEqual(await answerTerminalRequest(request, deps), { result: { paneId: 12 } });
    assert.equal(calls.at(-1)[0].id, kind);
    assert.equal(calls.at(-1)[5].model, selected.model);
    assert.match((await answerTerminalRequest({ ...request, model: undefined }, deps)).error, /available model/);
    assert.match((await answerTerminalRequest(request, { ...deps, models: async () => [] })).error, /no longer available/);
    if (kind !== 'gemini') assert.match((await answerTerminalRequest({ ...request, permissionMode: 'full' }, deps)).error, /not supported/);
  }
  assert.equal(calls.length, 3);
});


test("Auto's explicit effort is validated and reaches the exact native launch", async () => {
  const calls = [];
  const deps = { agents: async () => agents, models: async () => models(),
    launch: async (...args) => { calls.push(args); return [{ conversationId: "auto-chat" }]; } };
  const request = { action: "create", kind: "codex", projectId: "p", title: "Task", requestId: "auto",
    model: "openai/gpt-6-luna", effort: "high" };
  assert.ok((await answerTerminalRequest(request, deps)).result);
  assert.equal(calls[0][5].effort, "high");
  assert.match((await answerTerminalRequest({ ...request, effort: "invented" }, deps)).error, /not supported/);
  assert.match((await answerTerminalRequest({ ...request, effort: null }, deps)).error, /not supported/);
  assert.equal(calls.length, 1);
});

test('additional terminal agents expose actual CLI defaults only when installed and enabled', () => {
  const agents = ['copilot', 'amp', 'crush', 'continue'].map(id => ({ id, name: id, installed: true, custom: false }));
  const models = phoneTerminalModels([], agents, ['copilot', 'crush']);
  assert.deepEqual(models.map(model => [model.id, model.kind, model.model]), [
    ['runner:copilot', 'copilot', ''], ['runner:crush', 'crush', ''],
  ]);
  assert.deepEqual(phoneTerminalModels([], agents.map(agent => ({ ...agent, installed: false })), ['copilot']), []);
});
