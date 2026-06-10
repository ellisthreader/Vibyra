import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(fileName) {
  const source = await readFile(new URL(fileName, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const helpers = await loadTypeScriptModule("./persistenceSecrets.ts");

function memoryPublic(initial = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => { value = next; },
    value: () => value
  };
}

function memorySecrets(initial = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => { value = next; },
    delete: async () => { value = null; },
    value: () => value
  };
}

function desktop(token, url = "http://desktop", pairCode = "ABC123") {
  return { url, pairCode, token, machineName: "Workstation", status: "offline" };
}

function delayedSecretStorage() {
  let value = null;
  let releaseFirstWrite;
  const firstWriteBlocked = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let writes = 0;
  return {
    adapter: {
      read: async () => value,
      write: async (next) => {
        writes += 1;
        if (writes === 1) await firstWriteBlocked;
        value = next;
      },
      delete: async () => { value = null; }
    },
    releaseFirstWrite,
    value: () => value
  };
}

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
  const secretStorage = {
    read: async () => null,
    write: async () => {},
    delete: async () => {}
  };
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
