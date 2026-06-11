import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PTY Team launch resolves stored plan assignments instead of renderer task text", async () => {
  const source = await readFile(new URL("./ptyTerminals.mjs", import.meta.url), "utf8");

  assert.match(source, /terminalTeamAssignmentForPlan/);
  assert.match(source, /body\.teamPlanId/);
  assert.match(source, /teamAssignment: plannedAssignment\.assignment/);
  assert.match(source, /teamPlannerMode: plannedAssignment\.plannerMode/);
  assert.match(source, /teamPlannerFallbackReason: plannedAssignment\.fallbackReason/);
  assert.match(source, /missing, stale, or does not match this role/);
});

test("renderer includes the bridge plan id in the authoritative PTY request", async () => {
  const teamSource = await readFile(
    new URL("../assets/app.terminals-team.js", import.meta.url),
    "utf8"
  );
  const runtimeSource = await readFile(
    new URL("../assets/app.terminals-pty-runtime.js", import.meta.url),
    "utf8"
  );

  assert.match(teamSource, /teamPlanId/);
  assert.match(teamSource, /return \{ teamId, teamSize, teamGoal, teamRoleKey,[\s\S]*teamPlanId/);
  assert.match(runtimeSource, /\.\.\.teamFields/);
});
