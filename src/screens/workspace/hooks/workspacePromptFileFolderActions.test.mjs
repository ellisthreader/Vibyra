import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const { createWorkspaceFileFolderHandlers } = await loadCommonJs("./workspacePromptFileFolderActions.ts", {
  "../helpers/chatPrompts": {
    extractFileName: (prompt) => prompt.match(/open\s+(.+)/i)?.[1] ?? null,
    isProjectLookupOnly: (prompt) => /\b(find|where|search)\b/i.test(prompt)
  }
});

test("detached folder search creates an open-folder proposal", async () => {
  const calls = [];
  const { handlers } = makeHarness(calls, [{ id: "p1", name: "SaaS", path: "/Users/taylor/SaaS" }]);
  await handlers.runFolderSearch("open folder SaaS", "SaaS", false, true);
  assert.deepEqual(calls[0], ["detachedProposal", "open folder SaaS", "Found SaaS on your desktop. Open it for this chat?", "SaaS"]);
});

test("project folder search asks for confirmation instead of starting agent immediately", async () => {
  const calls = [];
  const { handlers } = makeHarness(calls, [{ id: "p2", name: "Client", path: "/Users/taylor/Client" }]);
  await handlers.runFolderSearch("open folder Client", "Client", false, false);
  assert.deepEqual(calls[0], ["folderConfirm", "open folder Client", "Client"]);
});

test("file open without desktop connection prompts for connection", async () => {
  const calls = [];
  const { handlers } = makeHarness(calls, [], { connection: null });
  await handlers.runFileOpen("open App.tsx", "App.tsx", false);
  assert.deepEqual(calls[0], ["connectPrompt", "open App.tsx", "App.tsx", false]);
});

function makeHarness(calls, matches, appOverrides = {}) {
  const app = {
    addLocalChatProposal: (...args) => calls.push(["localProposal", args[0], args[1], args[4]]),
    addLocalChatReply: (...args) => calls.push(["localReply", args[0], args[1]]),
    connection: { url: "http://pc", token: "token" },
    files: [],
    searchDesktopFolders: async () => matches,
    selectFile: async () => calls.push(["selectFile"]),
    selectedProject: { id: "selected", name: "Selected", path: "/Users/taylor/Selected" },
    startAgent: async () => calls.push(["startAgent"]),
    ...appOverrides
  };
  const runtime = {
    activeProjectTarget: (project = app.selectedProject) => ({ project, projectId: project.id, chatProjectId: project.id, file: null }),
    addDetachedChatProposal: (prompt, reply, found) => calls.push(["detachedProposal", prompt, reply, found[0]?.name]),
    addDetachedChatReply: (prompt, reply) => calls.push(["detachedReply", prompt, reply])
  };
  const s = {
    app,
    setFolderConfirm: ({ query, matches: found }) => calls.push(["folderConfirm", query, found[0]?.name]),
    setPreviewApp: () => calls.push(["setPreviewApp"])
  };
  const handlers = createWorkspaceFileFolderHandlers(s, runtime, (prompt, query, detached) => {
    calls.push(["connectPrompt", prompt, query, detached]);
  });
  return { handlers };
}

async function loadCommonJs(relativePath, mocks = {}) {
  const source = (await readFile(new URL(relativePath, import.meta.url), "utf8"))
    .replace(/^import type [^\n]+\n/gm, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected import ${id}`);
  };
  new Function("exports", "module", "require", output)(module.exports, module, require);
  return module.exports;
}
