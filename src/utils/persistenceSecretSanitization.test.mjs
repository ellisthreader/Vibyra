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

test("unrelated token fields survive sanitization and are not extracted", async () => {
  const helpers = await loadHelpers();
  const value = {
    authToken: "login",
    appState: {
      token: "chat-cursor",
      messages: [{ token: "stream-marker" }]
    },
    rememberedDesktops: [{
      url: "http://desktop",
      pairCode: "ABC123",
      token: "desktop"
    }]
  };

  const sanitized = helpers.sanitizePersistedSession(value);
  const extracted = helpers.extractPersistedSecrets(value);

  assert.equal(sanitized.appState.token, "chat-cursor");
  assert.equal(sanitized.appState.messages[0].token, "stream-marker");
  assert.equal(sanitized.rememberedDesktops[0].token, undefined);
  assert.deepEqual(extracted.desktopTokens, [{
    url: "http://desktop",
    pairCode: "ABC123",
    token: "desktop"
  }]);
});
