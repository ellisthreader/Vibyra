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
