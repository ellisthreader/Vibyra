import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./app.terminals-project-groups.js", import.meta.url), "utf8");
const shellSource = fs.readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const renderSource = fs.readFileSync(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const ptySource = fs.readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const runtimeSource = fs.readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");

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
  const html = context.terminalRailProjectsHtml();
  assert.match(html, /terminal-rail-projects/);
  assert.match(html, />SaaS</);
  assert.match(html, /terminal-rail-project-count">2/);
  assert.match(html, /terminal-rail-project-state/);
  assert.doesNotMatch(html, />Fresh API</);
});

test("a recovered project remains until its final terminal is removed", () => {
  const context = projectContext();
  context.terminals.push({ id: "empty-restored", projectId: "empty", ptyStatus: "exited" });
  assert.match(context.terminalRailProjectsHtml(), />Fresh API</);

  context.terminals = context.terminals.filter((terminal) => terminal.id !== "empty-restored");
  assert.doesNotMatch(context.terminalRailProjectsHtml(), />Fresh API</);
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
  const html = context.terminalRailProjectsHtml();
  assert.match(html, />Theme Team</);
  assert.match(html, /data-icon="people"/);
  assert.match(html, />Team · Ready</);
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

test("terminal renderer scopes project tabs and agent sidebar to the active project", () => {
  assert.doesNotMatch(shellSource, /rail-nav-group--terminals/);
  assert.doesNotMatch(shellSource, /terminalRailProjectsHtml/);
  assert.match(renderSource, /terminalBatchSetupOpen \|\| !terminals\.length/);
  assert.match(renderSource, /terminalGridMeta\(projectTerminals\.length\)/);
  assert.match(renderSource, /terminalProjectTabsHtml/);
  assert.match(renderSource, /terminalAgentSidebarHtml\(projectTerminals\)/);
  assert.match(source, /function terminalProjectTabsHtml/);
  assert.match(source, /function terminalAgentSidebarHtml/);
  assert.match(source, /terminal-agent-sidebar/);
  assert.match(source, /terminal-agent-nav-item/);
  assert.match(ptySource, /projectTerminals\.map\(\(terminal, index\)/);
  assert.match(ptySource, /How should your AI agents work\?/);
  assert.match(ptySource, /terminalSetupProgress\("mode"\)/);
  assert.match(ptySource, /terminalSetupProgress\("setup"\)/);
  assert.doesNotMatch(ptySource, /terminal-tabs-progress/);
  assert.doesNotMatch(ptySource, /What are we building/);
  assert.match(ptySource, /data-terminal-batch-cancel/);
  assert.match(runtimeSource, /terminal-project-hidden/);
  assert.match(runtimeSource, /if \(terminalBatchSetupOpen\)/);
  assert.match(runtimeSource, /terminalGridMeta\(projectTerminals\.length\)/);
});
