import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stateSource = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("./app.chat-store.js", import.meta.url), "utf8");
const mainChatSource = readFileSync(new URL("./app.chat-send.js", import.meta.url), "utf8");
const companionChatSource = readFileSync(new URL("./app.terminals-companion-chat.js", import.meta.url), "utf8");
const voiceSource = readFileSync(new URL("./app.terminals-companion-voice-request.js", import.meta.url), "utf8");

test("desktop action context persists a bounded recent launch batch per main chat", () => {
  const storage = memoryStorage({
    "vibyra.desktop.activeChat": "chat-1",
    "vibyra.desktop.recentChats": JSON.stringify([{
      id: "chat-1",
      messages: [{ role: "user", text: "Open terminals" }],
      title: "Terminal work",
      updatedAt: Date.now()
    }])
  });
  const context = loadStateContext(storage);
  const scope = context.desktopActionContextScope("chat", "chat-1");
  const terminalIds = Array.from({ length: 15 }, (_, index) => `terminal-${index % 13}`);

  const recorded = context.recordDesktopActionExecution(scope, {
    batchId: "batch-1",
    executionStatus: "completed",
    model: "gpt-5.5",
    projectId: "project-1",
    terminalIds
  });

  assert.equal(recorded.recentTerminalBatch.terminalIds.length, 12);
  assert.equal(recorded.recentTerminalBatch.model, "gpt-5.5");
  const persisted = JSON.parse(storage.getItem("vibyra.desktop.recentChats"));
  const plainRecorded = JSON.parse(JSON.stringify(recorded));
  assert.deepEqual(persisted[0].desktopActionContext, plainRecorded);
  assert.deepEqual(JSON.parse(JSON.stringify(context.vibyraDesktopActionContext.read(scope))), plainRecorded);
});

test("desktop action context expires stale batches and clears them on read", () => {
  const storage = memoryStorage({
    "vibyra.desktop.activeChat": "chat-1",
    "vibyra.desktop.recentChats": JSON.stringify([{
      id: "chat-1",
      messages: [],
      title: "Old terminal work",
      updatedAt: Date.now(),
      desktopActionContext: {
        recentTerminalBatch: {
          batchId: "stale",
          terminalIds: ["terminal-old"],
          timestamp: Date.now() - (31 * 60 * 1000)
        }
      }
    }])
  });
  const context = loadStateContext(storage);

  assert.equal(context.desktopActionContextForScope("chat:chat-1"), null);
});

test("main, companion, and voice requests send structured action context", () => {
  assert.match(mainChatSource, /desktopActionContext: desktopActionContextForScope\(actionContextScope\)/);
  assert.match(companionChatSource, /desktopActionContext: desktopActionContextForScope\(actionContextScope\)/);
  assert.match(voiceSource, /desktopActionContext: desktopActionContextForScope\(actionContextScope\)/);
  for (const source of [mainChatSource, companionChatSource, voiceSource]) {
    assert.match(source, /runDesktopActions\(result\.actions, \{ desktopActionContextScope: actionContextScope \}\)/);
  }
});

test("companion action context stays attached to its terminal chat thread", () => {
  let terminalStore;
  const context = {
    desktopActionContextForScope: () => null,
    desktopActionContextScope: (kind, id) => `${kind}:${id}`,
    registerDesktopActionContextStore(kind, store) {
      if (kind === "terminal") terminalStore = store;
    },
    requestAnimationFrame() {},
    terminalCompanionActiveTerminal: () => ({ id: "terminal-2" })
  };
  vm.runInNewContext(companionChatSource, context);
  const stored = { recentTerminalBatch: { terminalIds: ["terminal-2"], timestamp: Date.now() } };

  terminalStore.write("terminal:terminal-2", stored);

  assert.equal(terminalStore.read("terminal:terminal-2"), stored);
  assert.equal(terminalStore.read("terminal:terminal-1"), null);
});

function loadStateContext(storage) {
  const context = {
    localStorage: storage,
    Map,
    Set
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(storeSource, context);
  vm.runInContext(stateSource, context);
  return context;
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}
