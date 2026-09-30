import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("empty terminal launch offers one direct AI-account recovery path", () => {
  const picker = source("../src/components/rail/LaunchModelPicker.tsx");
  const launcher = source("../src/components/rail/LaunchSettings.tsx");
  // The startup effect moved out of WorkspaceApp into this hook; the rule it
  // encodes — account refresh is fire-and-forget, never awaited — is unchanged.
  const startup = source("../src/lib/useWorkspaceRuntime.ts");

  assert.match(picker, /Connect your AI accounts/);
  assert.match(picker, /Open Settings → AI accounts/);
  assert.match(picker, /onConnectAccounts\(\)/);
  assert.match(launcher, /openSettingsSection\("ai", "terminalAccounts"\)/);
  assert.match(launcher, /\{selected && \(/);
  assert.match(launcher, /!agentsLoaded \|\| !accountsLoaded/);
  assert.match(startup, /void refreshConnectedAccounts\(\)/);
  assert.doesNotMatch(startup, /await refreshConnectedAccounts\(\)/);
});

test("direct Settings navigation makes AI accounts the active section", () => {
  const workspace = source("../src/state/workspaceStore.ts");
  const settings = source("../src/components/settings/SettingsModal.tsx");

  assert.match(workspace, /openSettingsSection: \(settingsSection, panel\) =>\s*set\(\{ settingsOpen: true, settingsSection, settingsPanel: panel \?\? null \}\)/);
  assert.match(settings, /state\.settingsSection/);
  assert.match(source("../src/components/settings/SettingsNav.tsx"), /state\.setSettingsSection/);
});
