import assert from "node:assert/strict";
import test from "node:test";
import { loadPersistenceSecrets, memoryPublic, memorySecrets } from "./persistenceSecrets.testSupport.mjs";

const { createSecretSessionPersistence } = await loadPersistenceSecrets();

test("a slow store coalesces intermediate snapshots and writes the final state", async () => {
  const secret = memorySecrets();
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const writes = [];
  const persistence = createSecretSessionPersistence({
    read: async () => null,
    write: async (value) => { writes.push(JSON.parse(value)); if (writes.length === 1) await blocked; }
  }, secret);
  const first = persistence.save({ authToken: "fixture", revision: 0 });
  // The first save has entered secure storage; the others share one pending job.
  const pending = Array.from({ length: 100 }, (_, i) => persistence.save({ authToken: "fixture", revision: i + 1 }));
  release();
  assert.ok((await Promise.all([first, ...pending])).every(Boolean));
  assert.deepEqual(writes.map((value) => value.revision), [0, 100]);
});

test("unchanged credentials are read and verified without repeated writes", async () => {
  const secret = memorySecrets();
  let writes = 0;
  const persistence = createSecretSessionPersistence(memoryPublic(), {
    ...secret, write: async (value) => { writes++; await secret.write(value); }
  });
  await persistence.save({ authToken: "fixture", revision: 1 });
  await persistence.save({ authToken: "fixture", revision: 2 });
  assert.equal(writes, 1);
  // Externally removed storage must be restored and reverified, not trusted from cache.
  await secret.delete();
  await persistence.save({ authToken: "fixture", revision: 3 });
  assert.equal(writes, 2);
});

test("a failed secret read prevents public overwrite and later saves can recover", async () => {
  const publicStore = memoryPublic("original");
  const secret = memorySecrets();
  let fail = true;
  const persistence = createSecretSessionPersistence(publicStore, {
    ...secret, read: async () => { if (fail) throw Error("locked"); return secret.read(); }
  });
  assert.equal(await persistence.save({ authToken: "fixture", revision: 1 }), false);
  assert.equal(publicStore.value(), "original");
  fail = false;
  assert.equal(await persistence.save({ authToken: "fixture", revision: 2 }), true);
});
