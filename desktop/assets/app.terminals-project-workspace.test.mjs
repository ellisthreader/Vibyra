import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-project-workspace.js", import.meta.url), "utf8");

function workspaceContext() {
  const context = {
    activeTerminalProjectKey: () => "web",
    bindTerminalProjectWorkspaceControls() {},
    document: { querySelector: () => null },
    escapeAttribute: String,
    escapeHtml: String,
    icon: (name) => `<${name}>`,
    terminalProject: () => ({
      id: "web",
      name: "Launchpad",
      path: "/projects/launchpad",
      stack: "SaaS product · Next.js + Tailwind",
      detectedBrief: { kindId: "saas", frameworkId: "next-tailwind" }
    }),
    terminalProjectGroups: () => [],
    terminalUnassignedProjectKey: "__unassigned__",
    terminalsForProjectKey: () => []
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test("project workspaces expose framework-aware tools", () => {
  const context = workspaceContext();
  const capabilities = context.terminalWorkspaceCapabilities(context.terminalWorkspaceProject());
  assert.deepEqual(
    JSON.parse(JSON.stringify(capabilities.map((item) => item.label))),
    ["AI", "Memory"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.terminalWorkspaceCapabilities({ stack: "Backend · Laravel" }).map((item) => item.label))),
    ["AI", "Memory", "Services"]
  );
  assert.match(context.terminalWorkspaceEmptyHtml(), /Launchpad/);
  assert.match(context.terminalWorkspaceEmptyHtml(), /data-terminal-workspace-launch="1"/);
  assert.match(context.terminalWorkspaceEmptyHtml(), /data-terminal-workspace-launch="4"/);
  assert.equal(context.terminalWorkspaceQuickActionsHtml(), "");
});

test("project status separates active work from an idle PTY", () => {
  const context = workspaceContext();
  assert.equal(
    context.terminalWorkspaceGroupStatus({ terminals: [{ ptyStatus: "running", providerState: "ready" }] }).label,
    "Ready"
  );
  assert.equal(
    context.terminalWorkspaceGroupStatus({ terminals: [{ ptyStatus: "running", providerState: "busy" }] }).label,
    "Working"
  );
  assert.equal(
    context.terminalWorkspaceGroupStatus({ terminals: [{ ptyStatus: "running", notice: "Approval needed" }] }).label,
    "Needs attention"
  );
});
