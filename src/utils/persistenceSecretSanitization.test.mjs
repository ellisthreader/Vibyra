import assert from "node:assert/strict";
import test from "node:test";
import { loadPersistenceSecrets as loadHelpers } from "./persistenceSecrets.testSupport.mjs";


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
