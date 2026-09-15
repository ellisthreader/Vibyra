import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { answerTerminalRequest, APPROVAL_WAITING } from "../src/lib/phoneTerminalAnswer.ts";

// A phone paired to this Mac asks the window for a terminal, or for one to
// close, and waits on the answer. These are the answers, with the stores
// stood in for, so a refusal reads as a reason and never as a hang.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const agents = [
  { id: "shell", name: "Terminal", installed: true },
  { id: "codex", name: "Codex", installed: true },
  { id: "claude", name: "Claude Code", installed: false },
];
function deps(overrides = {}) {
  const calls = { launched: [], closedPanes: [], closedChats: [] };
  return {
    calls,
    agents: async () => agents,
    launch: async (agent, projectId, title) => { calls.launched.push([agent.id, projectId, title]); return [{ paneId: 7 }]; },
    approvalPending: () => false,
    closePane: async (id) => { calls.closedPanes.push(id); },
    closeChat: async (id) => { calls.closedChats.push(id); },
    adopt: async (path, name) => ({ id: "p-9", name, path }),
    ...overrides,
  };
}

test("a start runs the project's own launch and names what it opened", async () => {
  const d = deps();
  const reply = await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "shell", title: "From the phone", requestId: "q" }, d);
  assert.deepEqual(reply, { result: { paneId: 7 } });
  assert.deepEqual(d.calls.launched, [["shell", "p-1", "From the phone"]]);
  const chat = deps({ launch: async () => [{ conversationId: "c-1" }] });
  assert.deepEqual(await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "codex", title: "t", requestId: "q" }, chat),
    { result: { conversationId: "c-1" } });
});

test("an agent that is not installed is refused by name, not launched", async () => {
  const d = deps();
  const reply = await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "claude", title: "t", requestId: "q" }, d);
  assert.match(reply.error, /Claude Code is not installed/);
  assert.equal(d.calls.launched.length, 0);
});

test("a launch that opened nothing says why, and a waiting checkpoint says where", async () => {
  const refused = await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "shell", title: "t", requestId: "q" },
    deps({ launch: async () => [] }));
  assert.match(refused.error, /Check Vibyra on your Mac/);
  const waiting = await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "shell", title: "t", requestId: "q" },
    deps({ launch: async () => [], approvalPending: () => true }));
  assert.equal(waiting.error, APPROVAL_WAITING);
  const thrown = await answerTerminalRequest({ id: "r", action: "create", projectId: "p-1", kind: "shell", title: "t", requestId: "q" },
    deps({ launch: async () => { throw new Error("This project is no longer available"); } }));
  assert.equal(thrown.error, "This project is no longer available");
});

test("a close takes down a pane or a shared chat the way the Mac's own button does", async () => {
  const d = deps();
  assert.deepEqual(await answerTerminalRequest({ id: "r", action: "close", paneId: 3 }, d), { result: { ok: true } });
  assert.deepEqual(await answerTerminalRequest({ id: "r", action: "close", conversationId: "c-9" }, d), { result: { ok: true } });
  assert.deepEqual(d.calls, { launched: [], closedPanes: [3], closedChats: ["c-9"] });
  assert.match((await answerTerminalRequest({ id: "r", action: "close" }, d)).error, /Nothing to close/);
});

test("the window answers every request through the same chain the phone waits on", async () => {
  const requests = await read("src/lib/phoneTerminalRequests.ts");
  assert.match(requests, /listen<PhoneTerminalRequest>\("phone:terminal-request"/, "a request is heard the moment Rust has it");
  assert.match(requests, /phoneTerminalRequests\(\)/, "and one asked before the listener existed is still found");
  assert.match(requests, /chatRequest\("session\.stop"/, "a shared chat is ended on the engine");
  assert.match(requests, /terminals\.dismiss\(id\)/, "and its card comes down");
  const lifecycle = await read("src/lib/useSessionLifecycle.ts");
  assert.match(lifecycle, /startPhoneTerminalRequests\(\)/, "the answerer is actually started");
  const rust = await read("src-tauri/src/lib.rs");
  assert.match(rust, /phone::notify_window\(app\.handle\(\)\.clone\(\)\)/, "Rust tells the window at once");
  const registry = await read("src-tauri/src/commands/registry.rs");
  for (const command of ["phone_terminal_requests", "phone_terminal_reply"]) {
    assert.match(registry, new RegExp(`phone::${command}`), `${command} is callable from the webview`);
  }
});

// A project the phone's wizard built here. Rust made the folder; only this
// window can put it in the list it publishes, so the folder arrives as a
// request like any other.
test("a built folder is opened as a project and named back to the phone", async () => {
  const asked = [];
  const reply = await answerTerminalRequest({ id: "r", action: "adopt", path: "/Users/someone/Code/site", name: "site" },
    deps({ adopt: async (path, name) => { asked.push([path, name]); return { id: "p-9", name, path }; } }));
  assert.deepEqual(reply, { result: { id: "p-9", name: "site", path: "/Users/someone/Code/site" } });
  assert.deepEqual(asked, [["/Users/someone/Code/site", "site"]]);
});

test("a folder the window will not open is a reason, not a hang", async () => {
  const reply = await answerTerminalRequest({ id: "r", action: "adopt", path: "/Users/someone/Code/site", name: "site" },
    deps({ adopt: async () => null }));
  assert.match(reply.error, /could not open the new folder/);
  assert.equal(reply.result, undefined);
});
