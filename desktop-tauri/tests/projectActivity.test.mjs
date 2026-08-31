import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  activityBarWidth,
  activityDays,
  activitySummary,
} from "../src/lib/projectActivityPolicy.ts";

const zero = { additions: 0, deletions: 0, changedFiles: 0, commits: 0, binaryFiles: 0 };
const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("seven local days are stable and working changes stay on Today", () => {
  const result = {
    isGit: true,
    truncated: false,
    days: [
      { date: "2026-08-27", additions: 20, deletions: 4, changedFiles: 2, commits: 1, binaryFiles: 0 },
    ],
    workingTree: { additions: 8, deletions: 3, changedFiles: 1, commits: 0, binaryFiles: 0 },
  };
  const days = activityDays(result, new Date(2026, 7, 28, 9));
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-08-28");
  assert.equal(days[0].label, "Today");
  assert.equal(days[0].additions, 8);
  assert.equal(days[0].includesWorkingTree, true);
  assert.equal(days[1].additions, 20);
  assert.equal(days[1].includesWorkingTree, false);
  assert.deepEqual(
    activitySummary(days),
    { additions: 28, deletions: 7, changedFiles: 3, commits: 1, binaryFiles: 0 },
  );
});

test("zero activity remains legible and tiny bars stay visible", () => {
  const days = activityDays({ isGit: true, days: [], workingTree: zero, truncated: false }, new Date(2026, 7, 28));
  assert.equal(days.every((day) => day.additions === 0 && !day.includesWorkingTree), true);
  assert.equal(activityBarWidth(0, 100), "0%");
  assert.equal(activityBarWidth(1, 100), "4%");
  assert.equal(activityBarWidth(50, 100), "50%");
});

test("the only project-close path is the two-stage dialog", async () => {
  const dialog = await read("src/components/projects/CloseProjectDialog.tsx");
  const actions = await read("src/components/projects/ProjectActions.tsx");
  const card = await read("src/components/home/HomeProjectCard.tsx");
  assert.match(dialog, /setStep\(2\)/);
  assert.match(dialog, /await remove\(project\.id\)/);
  assert.match(dialog, /step === 1 \? <button[\s\S]*setStep\(2\)[\s\S]*: <button[\s\S]*finish\(\)/);
  assert.match(actions, /createPortal\(overlay, document\.body\)/);
  assert.doesNotMatch(card, /\.remove|Remove project|confirming/);
});

test("native activity is explicitly routed off the runtime thread", async () => {
  const command = await read("src-tauri/src/commands/project_activity.rs");
  assert.match(command, /pub async fn project_activity/);
  assert.match(command, /run_blocking_core/);
});
