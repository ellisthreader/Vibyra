import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Cross-file contracts for the work bus, in the same spirit as
// `desktopInvariants`: both of these failed silently in the running app rather
// than in any unit, and both are a single call being in the right file.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("the decisions badge is fed from above every mode, not from a panel", async () => {
  // The defect this pins: approvals were loaded only by DecisionsPanel — a
  // 10s poll that stopped on unmount — so the rail count and the mode-switch
  // pip froze at their last value the moment you left the panel that showed
  // them. A count that is only right while you are looking at the thing it
  // counts is worse than no count.
  //
  // A mount test would be the honest version of this, and this suite has no
  // DOM. So the structural fact is pinned instead: the bus is mounted by the
  // always-present workspace, and it is the thing holding the listener.
  const workspace = await read("src/components/layout/WorkspaceApp.tsx");
  assert.match(
    workspace,
    /useAgentWorkBus\(\)/,
    "WorkspaceApp must mount the work bus — mounted inside AgentMode it would " +
      "die in Code Mode, which is where the pip has to be true",
  );

  const bus = await read("src/lib/agentWorkBus.ts");
  assert.match(bus, /listen<string>\("routine-status"/, "the bus holds the scheduler's listener");
  assert.match(bus, /listen\("approval-raised"/, "and the broker's");
  assert.match(bus, /loadApprovals/, "and refreshes the queue the badge counts");

  // The panel may still refresh on mount, but it must not be the only thing
  // that does — that is the shape of the original bug.
  const panel = await read("src/components/agentMode/DecisionsPanel.tsx");
  assert.ok(
    !/setInterval/.test(panel),
    "DecisionsPanel must not own a poll: the bus is the mechanism now",
  );
});

test("one routine-status event refetches one routine's history", async () => {
  // A tick with forty routines and one due must not reload forty histories:
  // the scheduler's thread is never allowed to be why the UI stutters over
  // live terminals.
  const bus = await read("src/lib/agentWorkBus.ts");
  assert.match(
    bus,
    /loadRuns\(payload\)/,
    "the payload is the routine's own id — only that row reloads",
  );
});
