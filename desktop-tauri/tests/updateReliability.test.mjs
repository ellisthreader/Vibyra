import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("an update cannot restart past a failed terminal save", async () => {
  const store = await read("../src/state/updateStore.ts");
  assert.match(store, /set\(\{ status: "installing", error: null \}\)/);
  assert.match(store, /await saveSessionNow\(true\);\s*\n\s*await installUpdate\(update\)/);
  assert.doesNotMatch(store, /saveSessionNow\(true\)\.catch/);
  assert.match(store, /status: "restartError"/);
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
  assert.match(store, /set\(\{ checkState: "checking" \}\)/);
  assert.match(store, /set\(\{ checkState: "failed", checkError: String\(error\) \}\)/);
  assert.match(store, /lastCheckedAt: Date\.now\(\)/);
});

test("a failed check never makes the banner or chip claim a release exists", async () => {
  // Both surfaces gate on `status`; if either ever read `checkState`, a network
  // blip would render an update card for a version that does not exist.
  const banner = await read("../src/components/layout/UpdateBanner.tsx");
  assert.match(banner, /if \(status === "idle" \|\| !version\) return null;/);

  // The chip gates through `navUpdateCopy`, which returns null while idle.
  const nav = await read("../src/components/layout/UpdateNavAction.tsx");
  assert.match(nav, /const copy = navUpdateCopy\(status, version, progress\);/);
  assert.match(nav, /if \(!copy\) return null;/);

  for (const source of [banner, nav]) assert.doesNotMatch(source, /checkState/);
});

test("the updater is reachable from settings, not only from the notification", async () => {
  const modal = await read("../src/components/settings/SettingsModal.tsx");
  assert.match(modal, /id: "updates"/);
  assert.match(modal, /updates: <SettingsUpdatesPane \/>/);

  const pane = await read("../src/components/settings/SettingsUpdatesPane.tsx");
  assert.match(pane, /getVersion\(\)/, "the pane has to show which build is installed");
  assert.match(pane, /store\.check\(\)/, "a check must be forceable without waiting for the poll");
});
