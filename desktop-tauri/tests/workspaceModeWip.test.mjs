import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  availableAppModes,
  isWipAppMode,
} from "../src/lib/workspaceModePolicy.ts";

test("only Code mode is available while Agent and Chat are unfinished", () => {
  assert.equal(isWipAppMode("agent"), true);
  assert.equal(isWipAppMode("chat"), true);
  assert.equal(isWipAppMode("code"), false);
  assert.deepEqual(availableAppModes(["agent", "code", "chat"]), ["code"]);
});

test("marks both modes WIP and closes every navigation bypass", async () => {
  const [switcher, workspace, store, palette, shortcuts, actions] = await Promise.all([
    readFile(new URL("../src/components/layout/ModeSwitch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/WorkspaceApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/state/agentModeStore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/paletteAgentEntries.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/agentShortcuts.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/notificationActions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(switcher, /disabled=\{wip\}/);
  assert.match(switcher, /mode-switch__wip-label">WIP/);
  assert.match(store, /if \(isWipAppMode\(mode\)\) return/);
  assert.match(store, /useAgentModeStore\.setState\(\{ mode: "code" \}\)/);
  assert.match(workspace, /const safeMode = isWipAppMode\(mode\) \? "code" : mode/);
  assert.match(palette, /if \(isWipAppMode\(entry\.id\)\) continue/);
  assert.match(palette, /return entries/);
  assert.match(shortcuts, /AVAILABLE_MODES\.length < 2/);
  assert.match(actions, /if \(isWipAppMode\("agent"\)\) return/g);
});
