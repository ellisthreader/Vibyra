import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadHelpers() {
  const source = await readFile(new URL("./persistenceSecrets.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const helpers = await loadHelpers();

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

function createPersistence(secretStorage) {
  let publicValue = null;
  return helpers.createSecretSessionPersistence({
    read: async () => publicValue,
    write: async (value) => { publicValue = value; }
  }, secretStorage);
}

function staleSession() {
  return {
    authToken: "login-token",
    rememberedDesktops: [{
      url: "http://desktop",
      pairCode: "ABC123",
      token: "desktop-token"
    }]
  };
}

test("explicit clear-all runs after a stale save", async () => {
  const storage = delayedSecretStorage();
  const persistence = createPersistence(storage.adapter);

  const staleSave = persistence.save(staleSession());
  const clear = persistence.clearAllSecrets();
  storage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.equal(storage.value(), null);
});

test("explicit auth clear runs after a stale save and preserves desktop tokens", async () => {
  const storage = delayedSecretStorage();
  const persistence = createPersistence(storage.adapter);

  const staleSave = persistence.save(staleSession());
  const clear = persistence.clearAuthToken();
  storage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.deepEqual(JSON.parse(storage.value()), {
    authToken: "",
    desktopTokens: [{
      url: "http://desktop",
      pairCode: "ABC123",
      token: "desktop-token"
    }]
  });
});

test("explicit desktop clear runs after a stale save and preserves login", async () => {
  const storage = delayedSecretStorage();
  const persistence = createPersistence(storage.adapter);

  const staleSave = persistence.save(staleSession());
  const clear = persistence.clearDesktopTokens();
  storage.releaseFirstWrite();
  await Promise.all([staleSave, clear]);

  assert.deepEqual(JSON.parse(storage.value()), {
    authToken: "login-token",
    desktopTokens: []
  });
});
