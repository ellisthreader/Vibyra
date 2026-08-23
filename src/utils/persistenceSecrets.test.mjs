import assert from "node:assert/strict";
import test from "node:test";
import {
  delayedSecretStorage,
  desktop,
  loadPersistenceSecrets,
  memoryPublic,
  memorySecrets
} from "./persistenceSecrets.testSupport.mjs";

const helpers = await loadPersistenceSecrets();

test("serialized saves leave logout as the final secret state", async () => {
  const publicStorage = memoryPublic();
  let secretValue = null;
  let releaseFirstWrite;
  const firstWriteBlocked = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let writes = 0;
  const secretStorage = {
    read: async () => secretValue,
    write: async (value) => {
      writes += 1;
      if (writes === 1) await firstWriteBlocked;
      secretValue = value;
    },
    delete: async () => { secretValue = null; }
  };
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  const staleSave = persistence.save({ authToken: "stale", rememberedDesktops: [desktop("stale")] });
  const logoutSave = persistence.save({ authToken: "", rememberedDesktops: [], user: null });
  releaseFirstWrite();
  await Promise.all([staleSave, logoutSave]);

  assert.equal(secretValue, null);
  assert.deepEqual(JSON.parse(publicStorage.value()), { rememberedDesktops: [], user: null });
});

test("cache clear keeps login while deleting desktop credentials", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = memorySecrets();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  await persistence.save({ authToken: "login", rememberedDesktops: [] });

  assert.deepEqual(JSON.parse(secretStorage.value()), {
    authToken: "login",
    desktopTokens: []
  });
});

test("session expiry deletes login only and preserves desktop credentials", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = memorySecrets();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  await persistence.save({ authToken: "", rememberedDesktops: [desktop("desktop")] });

  assert.deepEqual(JSON.parse(secretStorage.value()), {
    authToken: "",
    desktopTokens: [{
      url: "http://desktop",
      pairCode: "ABC123",
      token: "desktop"
    }]
  });
});

test("clearAllSecrets serializes after a stale save", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = delayedSecretStorage();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage.adapter);

  const staleSave = persistence.save({
    authToken: "login",
    rememberedDesktops: [desktop("desktop")]
  });
  const clear = persistence.clearAllSecrets();
  secretStorage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.equal(secretStorage.value(), null);
});

test("clearAuthToken serializes after a stale save and preserves desktop tokens", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = delayedSecretStorage();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage.adapter);

  const staleSave = persistence.save({
    authToken: "login",
    rememberedDesktops: [desktop("desktop")]
  });
  const clear = persistence.clearAuthToken();
  secretStorage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.deepEqual(JSON.parse(secretStorage.value()), {
    authToken: "",
    desktopTokens: [{
      url: "http://desktop",
      pairCode: "ABC123",
      token: "desktop"
    }]
  });
});

test("clearDesktopTokens serializes after a stale save and preserves login", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = delayedSecretStorage();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage.adapter);

  const staleSave = persistence.save({
    authToken: "login",
    rememberedDesktops: [desktop("desktop")]
  });
  const clear = persistence.clearDesktopTokens();
  secretStorage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.deepEqual(JSON.parse(secretStorage.value()), {
    authToken: "login",
    desktopTokens: []
  });
});
