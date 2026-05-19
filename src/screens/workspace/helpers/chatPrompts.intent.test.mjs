import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import ts from "typescript";

const chatPrompts = await loadModule("./chatPrompts.ts");
const chatReplies = await loadModule("./chatReplies.ts");
const terminalCommands = await loadModule("../hooks/workspaceTerminalCommands.ts");

test("folder intent parser accepts common open and folder typos", () => {
  const cases = [
    ["oepn folder Client Dashboard", "Client Dashboard"],
    ["opne folder Client Dashboard", "Client Dashboard"],
    ["opem forlder Marketing Site", "Marketing Site"],
    ["opne foler Marketing Site", "Marketing Site"],
    ["opn prject Checkout Flow", "Checkout Flow"],
    ["oen flder Vibyra Projects", "Vibyra Projects"]
  ];

  for (const [prompt, expected] of cases) {
    assert.equal(chatPrompts.isFindFolderIntent(prompt), true, prompt);
    assert.equal(chatPrompts.extractFolderName(prompt), expected, prompt);
    assert.equal(chatPrompts.desktopProjectSearchQuery(prompt), expected, prompt);
  }
});

test("folder intent parser keeps existing natural language outcomes", () => {
  assert.equal(chatPrompts.extractFolderName("open Client Dashboard folder"), "Client Dashboard");
  assert.equal(chatPrompts.extractFolderName("find the repo called SaaS"), "SaaS");
  assert.equal(chatPrompts.extractFolderName("use project named mobile-app"), "mobile-app");
});

test("folder intent parser asks for a name instead of inventing one", () => {
  assert.equal(chatPrompts.isFindFolderIntent("open folder please"), true);
  assert.equal(chatPrompts.extractFolderName("open folder please"), null);
  assert.equal(chatPrompts.desktopProjectSearchQuery("open folder please"), "");
  assert.equal(chatPrompts.isFindFolderIntent("ok thanks"), false);
  assert.equal(chatPrompts.extractFolderName("ok thanks"), null);
});

test("chat reply classifiers accept realistic casual variants", () => {
  assert.equal(chatReplies.isGreeting("hello hello"), true);
  assert.equal(chatReplies.isGreeting("hey Vibyra"), true);
  assert.equal(chatReplies.isGreeting("bonjour"), true);
  assert.equal(chatReplies.isSmallTalk("thnks"), true);
  assert.equal(chatReplies.isSmallTalk("yes"), true);
  assert.equal(chatReplies.isHelpRequest("help lol"), true);
  assert.equal(chatReplies.isHelpRequest("can you help me"), true);
  assert.equal(chatReplies.isConfusion("what now"), true);
  assert.equal(chatReplies.isConfusion("idk"), true);
  assert.equal(chatReplies.isGreeting("..."), false);
});

test("current project and file intents handle short human phrasing", () => {
  assert.equal(chatPrompts.isCurrentProjectQuestion("where am i rn"), true);
  assert.equal(chatPrompts.isCurrentProjectQuestion("where am I?"), true);
  assert.equal(chatPrompts.isOpenFileIntent("open App.tsx"), true);
  assert.equal(chatPrompts.extractFileName("open App.tsx"), "App.tsx");
});

test("terminal parser accepts bare supported commands and flags unsupported command requests", () => {
  assert.equal(terminalCommands.parseTerminalCommandIntent("git status pls"), "git status");
  assert.equal(terminalCommands.parseTerminalCommandIntent("npm test"), "npm test");
  assert.equal(terminalCommands.parseTerminalCommandIntent("run yarn install"), null);
  assert.equal(terminalCommands.isUnsupportedTerminalCommandIntent("run yarn install"), true);
});

async function loadModule(relativePath) {
  const path = new URL(relativePath, import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^export \{[^\n]+\n/m, "")
    .replace(/^import [^\n]+\n/gm, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
