import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Exercise the real coordinator; replace only its native/renderer boundaries.
const operations = {};
globalThis.__vibyraResumeTest = operations;
const mocked = ["../ipc/agents", "../ipc/terminal", "../ipc/workspace", "../lib/activity", "../lib/sessionExitNotifications", "../lib/terminalRegistry"];
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/terminalRelaunch.ts")) {
      if (mocked.includes(specifier)) return { url: "vibyra-test:resume", shortCircuit: true };
      if (specifier === "../lib/resumePolicy") return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "vibyra-test:resume") return { format: "module", shortCircuit: true, source:
      ["listAgents", "agentConversationResumable", "removeTerminal", "terminalSnapshot", "inspectSafeWorkspace", "dropStats", "suppressExitNotice", "destroySession"]
        .map((name) => `export const ${name} = (...args) => globalThis.__vibyraResumeTest.${name}(...args);`).join("\n") };
    return next(url, context);
  },
});
const { relaunch } = await import("../src/state/terminalRelaunch.ts");
hooks.deregister();

function setup(overrides = {}) {
  const original = { id: -1, agentId: "claude", agentSessionId: "original-chat", accountId: "work",
    projectId: "p", sourceCwd: "/project", resumeCwd: "/safe/project", workspaceMode: "safe",
    status: "suspended", title: "My chat", snapshot: "Saved output", ...overrides };
  const calls = [];
  let state = { panes: [original], relaunching: [], relaunchErrors: {},
    spawnAgent: async (_agent, _project, options) => { calls.push(["spawn", options]); state.panes = [{ ...original, id: 50, status: "running" }]; },
  };
  const set = (change) => { state = { ...state, ...(typeof change === "function" ? change(state) : change) }; };
  Object.assign(operations, {
    listAgents: async () => [{ id: "claude", installed: true }],
    agentConversationResumable: async () => true,
    inspectSafeWorkspace: async () => ({ fingerprint: "fresh" }),
    terminalSnapshot: async () => "Live output",
    removeTerminal: async (id) => calls.push(["remove", id]),
    dropStats: () => {}, suppressExitNotice: () => {},
    destroySession: (id) => calls.push(["destroy", id]),
  });
  return { original, calls, set, get: () => state, run: (resume = true) => relaunch(set, () => state, original.id, resume) };
}

test("missing provider history leaves the entire saved pane intact", async () => {
  const fixture = setup();
  operations.agentConversationResumable = async () => false;
  await fixture.run();
  assert.equal(fixture.get().panes[0], fixture.original);
  assert.deepEqual(fixture.calls, []);
  assert.match(fixture.get().relaunchErrors[-1], /saved chat is unavailable/);
  assert.deepEqual(fixture.get().relaunching, []);
});

test("a failed process start is retryable without losing saved output", async () => {
  const fixture = setup();
  const spawn = fixture.get().spawnAgent;
  fixture.set({ spawnAgent: async () => { throw Error("Executable disappeared"); } });
  await fixture.run();
  assert.equal(fixture.get().panes[0], fixture.original);
  assert.deepEqual(fixture.calls, []);
  assert.match(fixture.get().relaunchErrors[-1], /Executable disappeared/);
  fixture.set({ spawnAgent: spawn });
  await fixture.run();
  assert.equal(fixture.get().panes[0].id, 50);
  assert.equal(fixture.calls[0][0], "spawn");
  assert.equal(fixture.calls[1][0], "destroy");
});

test("double clicking Resume starts only one process and preserves account and worktree", async () => {
  const fixture = setup();
  let release;
  operations.agentConversationResumable = () => new Promise((resolve) => { release = resolve; });
  const first = fixture.run();
  await fixture.run();
  release(true);
  await first;
  const spawns = fixture.calls.filter(([kind]) => kind === "spawn");
  assert.equal(spawns.length, 1);
  const options = spawns[0][1];
  assert.equal(options.accountId, "work");
  assert.equal(options.agentSessionId, "original-chat");
  assert.equal(options.resumeCwd, "/safe/project");
  assert.equal(options.replaySnapshot, "Saved output");
});

test("New chat requests a new conversation and a newly inspected workspace", async () => {
  const fixture = setup();
  await fixture.run(false);
  const options = fixture.calls[0][1];
  assert.equal(options.resume, false);
  assert.equal(options.agentSessionId, null);
  assert.equal(options.resumeCwd, undefined);
  assert.equal(options.safeSnapshotFingerprint, "fresh");
  assert.equal(options.replaySnapshot, null);
});

test("an exited live pane reads its native history before replacing its process", async () => {
  const fixture = setup({ id: 7, status: "exited", snapshot: null });
  await fixture.run();
  assert.equal(fixture.calls[0][1].replaySnapshot, "Live output");
  assert.deepEqual(fixture.calls.map(([kind]) => kind), ["spawn", "destroy", "remove"]);
});
