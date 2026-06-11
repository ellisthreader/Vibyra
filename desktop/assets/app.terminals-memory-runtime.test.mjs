import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const stateSource = await readFile(new URL("./app.terminals-memory-state.js", import.meta.url), "utf8");
const apiSource = await readFile(new URL("./app.terminals-memory-api.js", import.meta.url), "utf8");
const graphLayoutSource = await readFile(new URL("./app.terminals-memory-graph-layout.js", import.meta.url), "utf8");
const graphModelSource = await readFile(new URL("./app.terminals-memory-graph-model.js", import.meta.url), "utf8");
const graphVisualsSource = await readFile(new URL("./app.terminals-memory-graph-visuals.js", import.meta.url), "utf8");
const graphSource = await readFile(new URL("./app.terminals-memory-graph.js", import.meta.url), "utf8");
const importSource = await readFile(new URL("./app.terminals-memory-import.js", import.meta.url), "utf8");
const onboardingSource = await readFile(new URL("./app.terminals-memory-onboarding.js", import.meta.url), "utf8");
const renderSource = await readFile(new URL("./app.terminals-memory-render.js", import.meta.url), "utf8");
const eventsSource = await readFile(new URL("./app.terminals-memory-events.js", import.meta.url), "utf8");
const companionMemorySource = await readFile(new URL("./app.terminals-companion-memory.js", import.meta.url), "utf8");
const authHelpersSource = await readFile(new URL("./app.auth-helpers.js", import.meta.url), "utf8");
const memoryCss = await readFile(new URL("./app.terminals-memory.css", import.meta.url), "utf8");
const graphCss = await readFile(new URL("./app.terminals-memory-graph.css", import.meta.url), "utf8");
const graphAdvancedCss = await readFile(new URL("./app.terminals-memory-graph-advanced.css", import.meta.url), "utf8");
const companionLayoutCss = await readFile(new URL("./app.terminals-companion-layout.css", import.meta.url), "utf8");

test("forced vault reloads queue while an earlier load is active", async () => {
  let releaseFirst;
  const requests = [];
  const context = memoryContext(async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      await new Promise((resolve) => { releaseFirst = resolve; });
      return jsonResponse({ ok: true, vault: { nodes: [] } });
    }
    return jsonResponse({ ok: true, vault: { nodes: [{ id: "note-1", type: "document", name: "Imported" }] } });
  });

  const first = vm.runInContext('loadTerminalMemoryVault("project-1")', context);
  await waitFor(() => typeof releaseFirst === "function");
  vm.runInContext('loadTerminalMemoryVault("project-1", true)', context);
  releaseFirst();
  await first;
  await waitFor(() => requests.length === 2 && context.terminalMemoryState.nodes.length === 1);

  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests.length, 2);
  assert.equal(context.terminalMemoryState.nodes[0].name, "Imported");
});

test("memory retries a pre-auth startup failure when the desktop session becomes ready", async () => {
  let requests = 0;
  const context = memoryContext(async () => {
    requests += 1;
    if (requests === 1) {
      return {
        ok: false,
        status: 401,
        async json() { return { error: "Log in to Vibyra Desktop to use project memory." }; }
      };
    }
    return jsonResponse({
      ok: true,
      vault: { nodes: [{ id: "note-1", type: "document", name: "Persistent memory" }] }
    });
  });

  await vm.runInContext('loadTerminalMemoryVault("project-1")', context);
  assert.equal(context.terminalMemoryState.loaded, false);
  assert.equal(context.terminalMemoryState.loadFailed, true);
  assert.match(companionMemorySource, /terminalMemoryState\.loadFailed/);

  context.window.dispatchEvent({ type: "vibyra:desktop-session-ready" });
  await waitFor(() => requests === 2 && context.terminalMemoryState.loaded);

  assert.equal(context.terminalMemoryState.loadFailed, false);
  assert.equal(context.terminalMemoryState.nodes[0].name, "Persistent memory");
  assert.match(authHelpersSource, /vibyra:desktop-session-ready/);
});

test("memory graph uses folders and wikilinks as real connections", () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(graphLayoutSource, context);
  vm.runInContext(graphModelSource, context);
  vm.runInContext(graphVisualsSource, context);
  vm.runInContext(graphSource, context);
  const model = vm.runInContext(`terminalMemoryGraphModel([
    { id: "folder", type: "folder", name: "Project", parentId: "", body: "" },
    { id: "a", type: "document", name: "Architecture", parentId: "folder", body: "[[Commands]]" },
    { id: "b", type: "document", name: "Commands", parentId: "folder", body: "" },
    { id: "c", type: "document", name: "Loose note", parentId: "", body: "" }
  ])`, context);

  assert.equal(model.documents, 3);
  assert.equal(model.edges.length, 3);
  assert.equal(model.edges.some((edge) => edge.kind === "link" && edge.from === "a" && edge.to === "b"), true);
  assert.equal(model.edges.some((edge) => edge.from === "folder" && edge.to === "a"), true);
});

test("large memory graphs spread across the canvas and support bounded zoom", () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(graphLayoutSource, context);
  vm.runInContext(graphModelSource, context);
  vm.runInContext(graphVisualsSource, context);
  vm.runInContext(graphSource, context);
  context.graphNodes = Array.from({ length: 48 }, (_, index) => ({
    id: `note-${index}`,
    type: index < 4 ? "folder" : "document",
    name: `Note ${index}`,
    parentId: index < 4 ? "" : `note-${index % 4}`,
    body: index > 5 ? `[[Note ${index - 1}]]` : ""
  }));
  const result = vm.runInContext(`(() => {
    const model = terminalMemoryGraphModel(graphNodes);
    const points = Object.values(model.positions);
    terminalMemoryGraphSetScale(9, false);
    const maximum = terminalMemoryState.graphScale;
    terminalMemoryGraphSetScale(.1, false);
    return {
      width: Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
      height: Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
      maximum,
      minimum: terminalMemoryState.graphScale
    };
  })()`, context);

  assert.ok(result.width > 420);
  assert.ok(result.height > 300);
  assert.equal(result.maximum, 3.2);
  assert.equal(result.minimum, .55);
});

test("memory graph reuses topology and positions until vault data or size changes", () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(graphLayoutSource, context);
  vm.runInContext(graphModelSource, context);
  const result = vm.runInContext(`(() => {
    terminalMemoryState.nodes = [
      { id: "folder", type: "folder", name: "Project", parentId: "", body: "" },
      { id: "note", type: "document", name: "Note", parentId: "folder", body: "" }
    ];
    terminalMemoryTouchGraph();
    const first = terminalMemoryGraphModel(terminalMemoryState.nodes);
    const repeated = terminalMemoryGraphModel(terminalMemoryState.nodes);
    terminalMemoryReplaceNode({ id: "note", type: "document", name: "Note", parentId: "folder", body: "[[Project]]" });
    const changed = terminalMemoryGraphModel(terminalMemoryState.nodes);
    terminalMemoryGraphSize = { width: 1000, height: 1200 };
    const resized = terminalMemoryGraphModel(terminalMemoryState.nodes);
    globalThis.graphFullscreen = true;
    globalThis.terminalMemoryIsFullscreen = () => graphFullscreen;
    const fullscreen = terminalMemoryGraphModel(terminalMemoryState.nodes);
    return {
      repeated: first === repeated,
      changed: repeated !== changed,
      resized: changed !== resized,
      fullscreen: resized !== fullscreen
    };
  })()`, context);

  assert.equal(result.repeated, true);
  assert.equal(result.changed, true);
  assert.equal(result.resized, true);
  assert.equal(result.fullscreen, true);
  assert.equal(vm.runInContext("terminalMemoryGraphIterations(180)", context), 32);
  assert.equal(vm.runInContext("terminalMemoryGraphIterations(100)", context), 40);
  assert.match(graphSource, /terminalMemoryGraphBound/);
  assert.match(graphVisualsSource, /terminalMemoryGraphInteractionIndex/);
  assert.match(graphSource, /class="tree edge-batch"/);
  assert.match(graphSource, /data-terminal-memory-graph-focus-edge/);
  assert.doesNotMatch(graphSource, /data-terminal-memory-graph-edge data-from/);
  assert.match(graphAdvancedCss, /\.terminal-memory-graph\.focusing \.terminal-memory-graph-node/);
  assert.match(apiSource, /terminalMemoryTouchGraph\(\)/);
});

test("compact Memory keeps stable graph proportions as the side panel narrows", () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(graphLayoutSource, context);
  const narrow = vm.runInContext("terminalMemoryGraphSizeForViewport(280, 820, false)", context);
  const partial = vm.runInContext("terminalMemoryGraphSizeForViewport(360, 820, false)", context);
  const wide = vm.runInContext("terminalMemoryGraphSizeForViewport(720, 820, false)", context);
  const fullscreenPortrait = vm.runInContext("terminalMemoryGraphSizeForViewport(360, 820, true)", context);

  assert.equal(narrow.width, 1000);
  assert.equal(narrow.height, 720);
  assert.equal(partial.width, narrow.width);
  assert.equal(partial.height, narrow.height);
  assert.equal(wide.width, narrow.width);
  assert.equal(wide.height, narrow.height);
  assert.ok(fullscreenPortrait.height > 2000);
  assert.match(graphSource, /terminalMemoryGraphSyncSize\(\)/);
  assert.match(graphSource, /ResizeObserver/);
});

test("compact graph fills the workspace without clipping or stretching the brain", () => {
  assert.doesNotMatch(graphSource, /terminal-memory-graph-footer|terminal-memory-graph-hint/);
  assert.match(graphCss, /grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(graphCss, /\.terminal-memory-graph\s*\{[^}]*height:\s*100%/s);
  assert.match(graphCss, /\.terminal-memory-workspace:not\(\.terminal-memory-workspace--fullscreen\) > \.terminal-memory-graph\s*\{[^}]*align-self:\s*stretch;[^}]*height:\s*100%/s);
  assert.match(graphCss, /\.terminal-memory-graph svg\s*\{[^}]*height:\s*100%;[^}]*width:\s*100%/s);
  assert.doesNotMatch(graphCss, /\.terminal-memory-workspace:not\(\.terminal-memory-workspace--fullscreen\)[^{]*svg\s*\{[^}]*height:\s*60%/s);
  assert.match(graphCss, /\.terminal-memory-workspace:not\(\.terminal-memory-workspace--fullscreen\) \.terminal-memory-graph-canvas\s*\{[^}]*background-image:/s);
  assert.match(graphSource, /canvas\.addEventListener\("pointermove"/);
  assert.doesNotMatch(graphSource, /graphPan[XY]\s*=\s*Math\.(?:max|min)/);
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(graphLayoutSource, context);
  assert.equal(vm.runInContext("terminalMemoryGraphViewportHeight(1200, false)", context), 720);
  assert.equal(vm.runInContext("terminalMemoryGraphViewportHeight(1200, true)", context), 1200);
  assert.doesNotMatch(graphLayoutSource, /nodeCount.*viewportHeight|growth \* \.4/);
  assert.match(graphCss, /\.terminal-memory-graph-meta\s*\{[^}]*align-items:\s*flex-start/s);
  assert.doesNotMatch(graphAdvancedCss, /\.terminal-memory-graph-legend\s*\{[^}]*position:\s*absolute/s);
});

test("memory documents omit terminal insertion and footer deletion actions", () => {
  assert.doesNotMatch(renderSource, /Insert into terminal|data-terminal-memory-insert/);
  assert.doesNotMatch(eventsSource, /data-terminal-memory-insert/);
  assert.doesNotMatch(renderSource, /terminal-memory-document-actions/);
});

test("compact Memory constrains Notes to the remaining grid track without clipping its top", () => {
  assert.doesNotMatch(renderSource, /terminal-memory-footer/);
  assert.match(renderSource, /terminal-memory-toolbar-status/);
  assert.match(renderSource, /data-terminal-memory-fullscreen/);
  assert.match(memoryCss, /grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(memoryCss, /\.terminal-memory-workbench\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(memoryCss, /\.terminal-memory-workbench\s*\{[^}]*height:\s*100%/s);
  assert.match(memoryCss, /\.terminal-memory-document\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*min-height:\s*0;[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(memoryCss, /\.terminal-memory-document\s*\{[^}]*height:\s*100%/s);
  assert.match(memoryCss, /\.terminal-memory-editor\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*overflow:\s*hidden/s);
  assert.match(memoryCss, /\.terminal-memory-editor textarea,\s*\.terminal-memory-preview\s*\{[^}]*grid-row:\s*1;[^}]*height:\s*auto;[^}]*min-height:\s*0;/s);
  assert.doesNotMatch(memoryCss, /\.terminal-memory-editor textarea\s*\{[^}]*min-height:\s*100%/s);
  assert.doesNotMatch(memoryCss, /max-height:\s*60vh/);
  assert.match(memoryCss, /@media \(max-width: 860px\)[\s\S]*terminal-companion:has\(\.terminal-memory-workspace\)[^{]*\{[^}]*height:\s*100%;[^}]*max-height:\s*none;/);
});

test("fullscreen Memory keeps the current primary renderer visible", () => {
  assert.match(companionLayoutCss, /\.terminal-page--memory-fullscreen \.terminal-companion-primary,[\s\S]*\{[^}]*display:\s*block;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.doesNotMatch(companionLayoutCss, /\.terminal-page--memory-fullscreen \.terminal-companion-stack/);
  assert.doesNotMatch(companionLayoutCss, /\.terminal-page--memory-fullscreen \.terminal-memory-section--stacked/);
});

test("Memory does not expose item creation controls or shortcuts", () => {
  assert.doesNotMatch(renderSource, /data-terminal-memory-new-(note|folder)|New (note|folder)/i);
  assert.doesNotMatch(eventsSource, /data-terminal-memory-new-(note|folder)|promptTerminalMemoryNode/);
});

test("memory companion width is user-resizable without shrinking the terminal below its floor", () => {
  assert.match(memoryCss, /has\(\.terminal-memory-workspace\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 340px/);
  assert.match(companionLayoutCss, /minmax\(480px, 1fr\) var\(--terminal-companion-width, 520px\)/);
  assert.match(companionLayoutCss, /terminal-page--memory-fullscreen/);
});

test("native Memory import accepts and reads Markdown files", async () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(importSource, context);
  context.files = [
    { name: "Notes.md", size: 8, async text() { return "# Notes"; } },
    { name: "Legacy.markdown", size: 6, async text() { return "Legacy"; } }
  ];
  const manifest = await vm.runInContext('buildTerminalMemoryManifest(files, "markdown")', context);

  assert.deepEqual(
    Array.from(manifest.files, (file) => ({ path: file.path, markdown: file.markdown })),
    [
      { path: "Notes.md", markdown: "# Notes" },
      { path: "Legacy.md", markdown: "Legacy" }
    ]
  );
  assert.equal((onboardingSource.match(/data-terminal-memory-pick="vault"/g) || []).length, 1);
  assert.equal((onboardingSource.match(/data-terminal-memory-pick="markdown"/g) || []).length, 1);
  assert.match(onboardingSource, /data-terminal-memory-vault-input/);
  assert.match(onboardingSource, /data-terminal-memory-markdown-input/);
  assert.doesNotMatch(onboardingSource, /data-terminal-memory-ai|Create new vault/);
  assert.match(onboardingSource, /window\.vibyraDesktopMemory\?\.pick/);
});

test("Electron picker removes the fallback input from mouse hit testing", () => {
  let clickHandler;
  let pickedKind = "";
  const input = { disabled: false, hidden: false };
  const control = {
    dataset: { terminalMemoryPick: "vault" },
    querySelector() { return input; },
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    }
  };
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  context.window.vibyraDesktopMemory = { pick() {} };
  context.root = { querySelectorAll() { return [control]; } };
  context.pickTerminalMemoryFiles = (kind) => { pickedKind = kind; };
  vm.runInContext(onboardingSource, context);
  vm.runInContext("bindTerminalMemoryNativePickers(root)", context);

  let prevented = false;
  clickHandler({ preventDefault() { prevented = true; } });

  assert.equal(input.disabled, true);
  assert.equal(input.hidden, true);
  assert.equal(prevented, true);
  assert.equal(pickedKind, "vault");
});

test("Memory onboarding exposes Markdown, vault, and automatic Obsidian discovery", () => {
  assert.equal((onboardingSource.match(/terminal-memory-import-option/g) || []).length, 2);
  assert.equal((onboardingSource.match(/data-terminal-memory-pick=/g) || []).length, 2);
  assert.match(onboardingSource, /discoverObsidian/);
  assert.match(onboardingSource, /data-terminal-memory-discovered/);
  assert.match(importSource, /importDiscoveredVault/);
  assert.doesNotMatch(onboardingSource, /createTerminalMemoryStarterVault/);
});

test("Memory automatically suggests discovered Obsidian vaults", async () => {
  const context = memoryContext(async () => jsonResponse({ ok: true }));
  vm.runInContext(importSource, context);
  vm.runInContext(onboardingSource, context);
  context.window.vibyraDesktopMemory = {
    async discoverObsidian() {
      return [{ id: "vault-1", name: "Project Notes", location: "Documents", noteCount: 4 }];
    }
  };

  await vm.runInContext("discoverTerminalMemoryVaults()", context);

  assert.equal(context.terminalMemoryState.discoveryStatus, "found");
  assert.equal(context.terminalMemoryState.discoveredVaults[0].id, "vault-1");
  assert.match(vm.runInContext("terminalMemoryDiscoveryHtml()", context), /Project Notes/);
});

test("native picker manifests post directly to the canonical import route", async () => {
  let request;
  const context = memoryContext(async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return jsonResponse({ ok: true });
  });
  vm.runInContext(importSource, context);
  context.nativeFiles = [{ path: "Project/Note.md", markdown: "# Note", source: "markdown_import" }];
  await vm.runInContext('importTerminalMemoryManifest(nativeFiles, "markdown")', context);

  assert.equal(request.url, "/desktop/project-memory/import");
  assert.deepEqual(request.body.files, context.nativeFiles);
});

function memoryContext(fetchImpl) {
  const listeners = new Map();
  const window = {
    clearTimeout,
    setTimeout,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event?.type) || []) listener(event);
      return true;
    }
  };
  const context = vm.createContext({
    console,
    fetch: fetchImpl,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    window,
    terminalMemoryRefresh() {},
    terminalMemoryUpdateStatus() {},
    terminalMemoryUpdateTree() {},
    icon() { return "<svg></svg>"; },
    escapeAttribute: String,
    escapeHtml: String
  });
  vm.runInContext(stateSource, context);
  vm.runInContext("globalThis.terminalMemoryState = terminalMemoryState", context);
  vm.runInContext(apiSource, context);
  vm.runInContext('terminalMemoryReset("project-1")', context);
  return context;
}

function jsonResponse(payload) {
  return { ok: true, async json() { return payload; } };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for memory runtime.");
}
