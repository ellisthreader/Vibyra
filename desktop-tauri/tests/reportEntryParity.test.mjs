import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Mac and Linux share a visible report entry outside Settings", async () => {
  const [button, projectStrip, roster, nav, workspace] = await Promise.all([
    source("components/report/ReportProblemButton.tsx"),
    source("components/layout/ProjectStrip.tsx"),
    source("components/teammates/Roster.tsx"),
    source("components/settings/SettingsNav.tsx"),
    source("components/layout/WorkspaceApp.tsx"),
  ]);

  assert.match(button, /Report a problem/);
  assert.match(button, /useReportStore\.getState\(\)\.begin\(\)/);
  assert.match(projectStrip, /<ReportProblemButton\s*\/>/);
  assert.match(roster, /<ReportProblemButton\s*\/>/);
  assert.doesNotMatch(nav, /Report a problem/, "the entry should not be hidden in Settings");
  assert.doesNotMatch(button, /\bisMac\b|\bisLinux\b|desktopPlatform/, "the action must not depend on the operating system");
  assert.match(workspace, /reportOpen\s*\?\s*<ReportModal\s*\/>/);
});
