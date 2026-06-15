import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./app.terminals-project-groups.js", import.meta.url), "utf8");
const shellSource = fs.readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const renderSource = fs.readFileSync(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const ptySource = fs.readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const runtimeSource = fs.readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./app.terminals-project-groups.css", import.meta.url), "utf8");

function projectContext() {
  const storage = new Map();
  const context = {
    activePage: "terminals",
    activeTerminalId: "saas-2",
    currentState: {
      projects: [
        { id: "saas", name: "SaaS", stack: "SaaS product · Next.js" },
        { id: "other", name: "Launchpad", stack: "Website · Vite" },
        { id: "empty", name: "Fresh API", stack: "Backend · Laravel" }
      ]
    },
    forceTerminalRender: false,
    maxTerminals: 12,
    newTerminalMenuOpen: false,
    settingsTerminalId: "",
    setupCount: 1,
    setupModelMenuOpen: false,
    setupProjectId: "saas",
    setupProjectKey: "terminal-project",
    terminalProjectMenuTarget: "",
    terminalToolbarMenuOpen: false,
    terminalLayout: "focus",
    terminalFullPcProjectId: "full-pc",
    terminals: [
      { id: "saas-1", projectId: "saas", ptyStatus: "running" },
      { id: "saas-2", projectId: "saas", ptyStatus: "exited" },
      { id: "other-1", projectId: "other", ptyStatus: "running" },
      { id: "general-1", projectId: "", ptyStatus: "exited" }
    ],
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value))
    },
    terminalProject: (id) => context.currentState.projects.find((project) => project.id === id) || null,
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    window: { confirm: () => true },
    closeCalls: [],
    async closeTerminal(id) {
      context.closeCalls.push(id);
      context.terminals = context.terminals.filter((terminal) => terminal.id !== id);
    },
    render() {},
    renderNav() {}
  };
  context.findTerminal = (id) => context.terminals.find((terminal) => terminal.id === id);
  context.setPage = (page) => { context.activePage = page; };
  context.setActiveTerminal = (id) => { context.activeTerminalId = id; };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test("renders only projects that own an open or recovered terminal", () => {
  const context = projectContext();
  const groups = context.terminalProjectGroups();
  assert.deepEqual(
    JSON.parse(JSON.stringify(groups.map((group) => [group.label, group.terminals.length]))),
    [["SaaS", 2], ["Launchpad", 1], ["General", 1]]
  );
  const html = context.terminalProjectTabsHtml();
  assert.match(html, /terminal-project-tabs/);
  assert.match(html, />SaaS</);
  assert.match(html, /2 agents/);
  assert.match(html, /terminal-project-tab-state/);
  assert.match(html, /data-terminal-project-close="saas"/);
  assert.doesNotMatch(html, />Fresh API</);
});

test("a recovered project remains until its final terminal is removed", () => {
  const context = projectContext();
  context.terminals.push({ id: "empty-restored", projectId: "empty", ptyStatus: "exited" });
  assert.match(context.terminalProjectTabsHtml(), />Fresh API</);

  context.terminals = context.terminals.filter((terminal) => terminal.id !== "empty-restored");
  assert.doesNotMatch(context.terminalProjectTabsHtml(), />Fresh API</);
});

test("an unassigned Team gets a relevant workspace name and distinct rail icon", () => {
  const context = projectContext();
  context.terminals.push(
    { id: "theme-builder", projectId: "", teamId: "team-theme", teamRoleKey: "builder", teamRole: "Theme Builder", teamGoal: "Audit light and dark mode.", ptyStatus: "running" },
    { id: "theme-reviewer", projectId: "", teamId: "team-theme", teamRoleKey: "reviewer", teamRole: "Theme Reviewer", teamGoal: "Audit light and dark mode.", ptyStatus: "running" }
  );
  const team = context.terminalProjectGroups().find((group) => group.key === "__team__:team-theme");
  assert.equal(team.label, "Theme Team");
  assert.equal(team.isTeam, true);
  const html = context.terminalProjectTabsHtml();
  assert.match(html, />Theme Team</);
  assert.match(html, /data-icon="people"/);
  assert.match(html, /2 agents/);
});

test("project selection restores that project's last active terminal", () => {
  const context = projectContext();
  context.rememberActiveTerminalForProject(context.terminals[2]);
  context.activeTerminalId = "saas-1";
  context.setActiveTerminalProject("other");
  assert.equal(context.activeTerminalId, "other-1");
  assert.equal(context.activeTerminalProjectKey(), "other");
});

test("rail plus opens a four-terminal batch setup and cancel restores prior state", () => {
  const context = projectContext();
  assert.match(context.terminalRailCreateButtonHtml(), /data-terminal-batch-new/);
  assert.match(context.terminalRailCreateButtonHtml(), /New terminal group/);
  context.openTerminalBatchSetup();
  assert.equal(vm.runInContext("terminalBatchSetupOpen", context), true);
  assert.equal(context.setupCount, 4);
  assert.equal(context.setupProjectId, "");
  context.closeTerminalBatchSetup();
  assert.equal(vm.runInContext("terminalBatchSetupOpen", context), false);
  assert.equal(context.setupCount, 1);
  assert.equal(context.setupProjectId, "saas");
});

test("project toolbar actions close only the active project group", async () => {
  const context = projectContext();
  context.terminalToolbarMenuOpen = true;
  const html = context.terminalProjectTabsHtml();
  assert.match(html, /data-terminal-project-close="saas"/);
  assert.match(html, />Close SaaS</);
  assert.doesNotMatch(html, /data-terminal-close-all/);

  await context.requestCloseTerminalProjectGroup("saas");
  assert.deepEqual(context.closeCalls, ["saas-1", "saas-2"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.id), ["other-1", "general-1"]);
});

test("terminal renderer scopes top project tabs and rail agents to the active project", () => {
  assert.match(shellSource, /rail-nav-group--terminals/);
  assert.match(shellSource, /terminalRailAgentsHtml/);
  assert.doesNotMatch(shellSource, /terminalRailProjectsHtml/);
  assert.match(renderSource, /terminalBatchSetupOpen \|\| !terminals\.length/);
  assert.match(renderSource, /terminalGridMeta\(projectTerminals\.length\)/);
  assert.match(renderSource, /grid \? terminals\.map\(terminalTile\)\.join\(""\)/);
  assert.doesNotMatch(renderSource, /terminalProjectTabsHtml/);
  assert.doesNotMatch(renderSource, /terminalAgentSidebarHtml\(projectTerminals\)/);
  assert.match(source, /function terminalProjectTabsHtml/);
  assert.match(source, /function terminalRailAgentsHtml/);
  assert.doesNotMatch(source, /function terminalAgentSidebarHtml/);
  assert.match(source, /terminal-rail-agents/);
  assert.match(source, /terminal-agent-nav-item/);
  assert.match(ptySource, /projectTerminals\.map\(\(terminal, index\)/);
  assert.match(ptySource, /terminalProjectTabsHtml\(\)/);
  assert.match(ptySource, /How should your AI agents work\?/);
  assert.match(ptySource, /terminalSetupProgress\("mode"\)/);
  assert.match(ptySource, /terminalSetupProgress\("setup"\)/);
  assert.doesNotMatch(ptySource, /terminal-tabs-progress/);
  assert.doesNotMatch(ptySource, /What are we building/);
  assert.match(ptySource, /data-terminal-batch-cancel/);
  assert.match(runtimeSource, /terminal-project-hidden/);
  assert.match(runtimeSource, /if \(terminalBatchSetupOpen\)/);
  assert.match(runtimeSource, /terminalGridMeta\(projectTerminals\.length\)/);
  assert.match(runtimeSource, /const expectedIds = new Set\(terminals\.map\(\(terminal\) => terminal\.id\)\)/);
  assert.match(runtimeSource, /for \(const terminal of terminals\) stable = refreshPtyTerminalDom\(terminal\) && stable/);
  assert.match(runtimeSource, /syncPtyTerminalGrid\(page, terminalLayout === "grid"\);/);
  assert.match(runtimeSource, /terminalRailAgentsHtml\(visible\)/);
});

test("terminal project tabs sit centered in the top navigation", () => {
  assert.match(styles, /\.terminal-project-tabs\s*\{[\s\S]*grid-template-columns: minmax\(34px, 1fr\) minmax\(0, auto\) minmax\(34px, 1fr\);/);
  assert.match(styles, /\.terminal-project-tabs\s*\{[\s\S]*justify-content: stretch;/);
  assert.match(styles, /\.terminal-project-tabs\s*\{[\s\S]*justify-self: center;/);
  assert.match(styles, /\.terminal-project-tabs\s*\{[\s\S]*width: min\(100%, 980px\);/);
  assert.doesNotMatch(styles, /width: fit-content/);
  assert.match(styles, /\.terminal-project-tab-list\s*\{[\s\S]*grid-column: 2;/);
  assert.match(styles, /\.terminal-project-tab-list\s*\{[\s\S]*justify-content: center;/);
  assert.match(styles, /\.terminal-project-tab-list\s*\{[\s\S]*max-width: min\(64vw, 760px\);/);
  assert.match(styles, /\.terminal-project-actions\s*\{[\s\S]*grid-column: 3;/);
  assert.match(styles, /\.terminal-project-actions \.terminal-add,[\s\S]*\.terminal-project-tab-close\s*\{[\s\S]*border: 1px solid/);
  assert.match(styles, /\.terminal-project-tab-close:hover,[\s\S]*color: var\(--terminal-danger/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.terminal-project-tabs\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
});
