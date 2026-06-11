import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const discoverySource = await readFile(new URL("./app.terminals-project-discovery.js", import.meta.url), "utf8");
const pickerSource = await readFile(new URL("./app.terminals-project-picker.js", import.meta.url), "utf8");
const appHtml = await readFile(new URL("../app.html", import.meta.url), "utf8");

function context() {
  const sandbox = {
    CSS: { escape: (value) => value },
    clearTimeout,
    currentState: {
      projects: [
        { id: "one", name: "Combined Launch SaaS", path: "/work/CombinedLaunchSaaS", stack: "Node" },
        { id: "two", name: "Website", path: "/work/client-portal", stack: "React" }
      ]
    },
    document: { addEventListener() {}, querySelector: () => null },
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    fetch: async () => ({ ok: true, json: async () => ({ projects: [] }) }),
    icon: (name) => `<${name}>`,
    localStorage: { getItem: () => "", removeItem() {}, setItem() {} },
    requestAnimationFrame: (callback) => callback(),
    setTimeout,
    setupModelMenuOpen: false,
    setupProjectId: "",
    setupProjectKey: "project",
    window: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(`${discoverySource}\n${pickerSource}`, sandbox);
  return sandbox;
}

test("terminal project search matches compact names, paths, and fuzzy server results", () => {
  const sandbox = context();
  vm.runInContext('terminalProjectQuery = "combinedlaunch"', sandbox);
  assert.equal(vm.runInContext("filteredTerminalProjects()[0].id", sandbox), "one");
  vm.runInContext('terminalProjectQuery = "client portal"', sandbox);
  assert.equal(vm.runInContext("filteredTerminalProjects()[0].id", sandbox), "two");
});

test("terminal project menu exposes native folder and file selection", () => {
  const sandbox = context();
  const html = vm.runInContext('terminalProjectMenu("setup", "")', sandbox);

  assert.match(html, /Search projects anywhere on this PC/);
  assert.match(html, /data-terminal-project-pick="folder"/);
  assert.match(html, /data-terminal-project-pick="file"/);
});

test("project discovery assets load before the picker that consumes them", () => {
  assert.ok(appHtml.indexOf("app.terminals-project-discovery.js") < appHtml.indexOf("app.terminals-project-picker.js"));
  assert.match(appHtml, /app\.terminals-project-discovery\.css/);
});

test("native file selection registers and selects its containing project", async () => {
  const sandbox = context();
  sandbox.window.vibyraDesktopProjects = {
    pick: async () => ({ canceled: false, path: "/work/new-project/src/App.tsx" })
  };
  sandbox.fetch = async (url) => {
    assert.equal(url, "/desktop/projects/select");
    return {
      ok: true,
      json: async () => ({ project: { id: "new", name: "new-project", path: "/work/new-project" } })
    };
  };

  await vm.runInContext('pickTerminalProject("file", "setup")', sandbox);

  assert.equal(sandbox.setupProjectId, "new");
  assert.equal(sandbox.currentState.projects[0].id, "new");
});

test("Full PC opens the native folder browser instead of selecting the home scope", async () => {
  const sandbox = context();
  let pickedKind = "";
  sandbox.pickTerminalProject = async (kind) => {
    pickedKind = kind;
  };

  vm.runInContext('activateTerminalProjectOption("full-pc", "setup")', sandbox);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pickedKind, "folder");
  assert.equal(sandbox.setupProjectId, "");
});
