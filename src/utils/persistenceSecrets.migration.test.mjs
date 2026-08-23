import assert from "node:assert/strict";
import test from "node:test";
import {
  desktop,
  loadPersistenceSecrets,
  memoryPublic,
  memorySecrets
} from "./persistenceSecrets.testSupport.mjs";

const helpers = await loadPersistenceSecrets();

test("legacy migration verifies secrets before sanitizing public storage", async () => {
  const publicStorage = memoryPublic(JSON.stringify({
    authToken: "login-token",
    rememberedDesktops: [desktop("desktop-token")],
    user: { rememberedDesktops: [desktop("nested-token")] }
  }));
  const secretStorage = memorySecrets();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  const loaded = await persistence.load();
  const publicValue = JSON.parse(publicStorage.value());

  assert.equal(loaded.authToken, "login-token");
  assert.equal(loaded.rememberedDesktops[0].token, "desktop-token");
  assert.equal(publicValue.authToken, undefined);
  assert.equal(publicValue.rememberedDesktops[0].token, undefined);
  assert.equal(publicValue.user.rememberedDesktops[0].token, undefined);
  assert.match(secretStorage.value(), /login-token/);
});

test("failed migration retains legacy secrets for the current launch", async () => {
  const legacy = JSON.stringify({
    authToken: "legacy-login",
    rememberedDesktops: [desktop("legacy-desktop")]
  });
  const publicStorage = memoryPublic(legacy);
  const secretStorage = {
    read: async () => null,
    write: async () => { throw new Error("keychain unavailable"); },
    delete: async () => {}
  };
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  const loaded = await persistence.load();

  assert.equal(loaded.authToken, "legacy-login");
  assert.equal(loaded.rememberedDesktops[0].token, "legacy-desktop");
  assert.equal(publicStorage.value(), legacy);
});

test("failed migration verification does not sanitize legacy storage", async () => {
  const legacy = JSON.stringify({ authToken: "legacy-login" });
  const publicStorage = memoryPublic(legacy);
  const secretStorage = { read: async () => null, write: async () => {}, delete: async () => {} };
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  const loaded = await persistence.load();

  assert.equal(loaded.authToken, "legacy-login");
  assert.equal(publicStorage.value(), legacy);
});

test("secure desktop tokens merge only into matching public metadata", async () => {
  const publicStorage = memoryPublic(JSON.stringify({
    rememberedDesktops: [
      desktop(undefined, "http://one", "PAIR1"),
      desktop(undefined, "http://two", "PAIR2")
    ]
  }));
  const secretStorage = memorySecrets(JSON.stringify({
    authToken: "",
    desktopTokens: [
      { url: "http://two", pairCode: "PAIR2", token: "matched" },
      { url: "http://missing", pairCode: "PAIR3", token: "ignored" }
    ]
  }));
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  const loaded = await persistence.load();

  assert.equal(loaded.rememberedDesktops[0].token, undefined);
  assert.equal(loaded.rememberedDesktops[1].token, "matched");
});

test("ordinary saves remove auth and remembered-desktop credentials", async () => {
  const publicStorage = memoryPublic();
  const secretStorage = memorySecrets();
  const persistence = helpers.createSecretSessionPersistence(publicStorage, secretStorage);

  assert.equal(await persistence.save({
    authToken: "login",
    rememberedDesktops: [desktop("top")],
    user: { rememberedDesktops: [desktop("nested")], appState: { token: "also-secret" } }
  }), true);

  const publicValue = JSON.parse(publicStorage.value());
  assert.equal(publicValue.authToken, undefined);
  assert.equal(publicValue.rememberedDesktops[0].token, undefined);
  assert.equal(publicValue.user.rememberedDesktops[0].token, undefined);
  assert.equal(publicValue.user.appState.token, "also-secret");
  assert.doesNotMatch(secretStorage.value(), /also-secret/);
});
