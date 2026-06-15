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

test("terminal project search matches compact names and paths", () => {
  const sandbox = context();
  vm.runInContext('terminalProjectQuery = "combinedlaunch"', sandbox);
  assert.equal(vm.runInContext("filteredTerminalProjects()[0].id", sandbox), "one");
  vm.runInContext('terminalProjectQuery = "client portal"', sandbox);
  assert.equal(vm.runInContext("filteredTerminalProjects()[0].id", sandbox), "two");
});

test("terminal project menu shows only search and project rows", () => {
  const sandbox = context();
  const html = vm.runInContext('terminalProjectMenu("setup", "")', sandbox);

  assert.match(html, /Search projects/);
  assert.match(html, />Combined Launch SaaS</);
  assert.match(html, />Website</);
  assert.doesNotMatch(html, /data-terminal-project-pick=/);
  assert.doesNotMatch(html, /Browse full PC/);
  assert.doesNotMatch(html, /No project/);
});

test("project discovery assets load before the picker that consumes them", () => {
  assert.ok(appHtml.indexOf("app.terminals-project-discovery.js") < appHtml.indexOf("app.terminals-project-picker.js"));
  assert.match(appHtml, /app\.terminals-project-discovery\.css/);
});

test("stale Full PC selection is cleared from the simplified picker", async () => {
  const sandbox = context();
  sandbox.setupProjectId = "full-pc";

  assert.equal(vm.runInContext("terminalProjectForSetup()", sandbox), "");
  assert.equal(sandbox.setupProjectId, "");
});
