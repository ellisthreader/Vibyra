import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("an update cannot restart past a failed terminal save", async () => {
  const store = await read("../src/state/updateStore.ts");
  assert.match(store, /set\(\{ status: "installing", error: null \}\)/);
  assert.doesNotMatch(store, /^import \{ saveSessionNow \}/m);
  assert.match(
    store,
    /if \(preserveSession\) \{\s*const \{ saveSessionNow \} = await import\("\.\.\/lib\/sessionPersistence"\);\s*await saveSessionNow\(true\);\s*\}\s*markPostUpdateChangelogPending\(update\.version\);\s*await installUpdate\(update\)/,
  );
  assert.match(store, /installAtStartup: \(\) => install\(false\)/);
  assert.match(store, /restart: \(\) => install\(true\)/);
  assert.doesNotMatch(store, /saveSessionNow\(true\)\.catch/);
  assert.match(store, /status: "restartError"/);
});

test("updater operations are explicit, configurable and single-flight", async () => {
  const ipc = await read("../src/ipc/updates.ts");
  const store = await read("../src/state/updateStore.ts");

  assert.match(ipc, /checkForUpdate\(timeoutMs = 30_000\)/);
  assert.match(ipc, /check\(\{ timeout: timeoutMs \}\)/);
  assert.match(store, /check: \(timeoutMs\?: number\) => Promise<boolean>/);
  assert.match(store, /download: \(\) => Promise<boolean>/);
  assert.match(store, /installAtStartup: \(\) => Promise<boolean>/);
  assert.match(store, /restart: \(\) => Promise<boolean>/);

  for (const action of ["check", "download", "install"]) {
    assert.match(store, new RegExp(`let ${action}Flight: Promise<boolean> \\| null = null`));
    assert.match(store, new RegExp(`if \\(${action}Flight\\) return ${action}Flight`));
    assert.match(store, new RegExp(`if \\(${action}Flight === flight\\) ${action}Flight = null`));
  }
});

test("metadata, heartbeat and update saves share one ordered queue", async () => {
  const persistence = await read("../src/lib/sessionPersistence.ts");
  assert.match(persistence, /let saveQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(persistence, /const save = saveQueue\.then/);
  assert.match(persistence, /saveQueue = save\.catch/);
});

test("a failed check is recorded rather than swallowed", async () => {
  // It stays out of the banner, but a feed that has been down for days has to
  // be discoverable somewhere — otherwise a broken updater looks exactly like
  // an app that is already current.
  const store = await read("../src/state/updateStore.ts");
  assert.match(store, /set\(\{ checkState: "checking", checkError: null \}\)/);
  assert.match(store, /set\(\{ checkState: "failed", checkError: String\(error\) \}\)/);
  assert.match(store, /lastCheckedAt: Date\.now\(\)/);
});

test("a failed check never makes the banner or menu claim a release exists", async () => {
  // Both surfaces gate on `status`; if either ever read `checkState`, a network
  // blip would render an update card for a version that does not exist.
  // The banner became a notification when the two systems merged, so the
  // guard moved with it: `idle` maps to no tier, and no tier is no notice.
  const notices = await read("../src/lib/updateNotifications.ts");
  assert.match(notices, /idle: null,/);
  assert.match(notices, /if \(!tier \|\| !state\.version\) return null;/);

  // The titlebar chip became an account-menu entry when the shell was
  // simplified; it still gates through `navUpdateCopy`, which is null while
  // idle, and the entry is only rendered when that copy exists.
  const menu = await read("../src/components/layout/AccountMenu.tsx");
  assert.match(menu, /const update = navUpdateCopy\(updateStatus, updateVersion, updateProgress\);/);
  assert.match(menu, /\{update && \(/);

  for (const source of [notices, menu]) assert.doesNotMatch(source, /checkState/);
});

test("the updater is reachable from settings, not only from the notification", async () => {
  const modal = await read("../src/components/settings/SettingsModal.tsx");
  assert.match(modal, /id: "updates"/);
  assert.match(modal, /updates: <SettingsUpdatesPane \/>/);

  const pane = await read("../src/components/settings/SettingsUpdatesPane.tsx");
  assert.match(pane, /getVersion\(\)/, "the pane has to show which build is installed");
  assert.match(pane, /store\.check\(\)/, "a check must be forceable without waiting for the poll");
});
