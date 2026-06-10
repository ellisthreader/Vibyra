import assert from "node:assert/strict";
import test from "node:test";

import { encryptRpcEnvelope } from "./lanV2Protocol.mjs";
import { createLanV2SessionStore } from "./lanV2Sessions.mjs";

test("LAN V2 sessions enforce principal binding, replay protection, and directional responses", () => {
  let current = Date.parse("2026-06-09T12:00:00.000Z");
  const phoneSendKey = Buffer.alloc(32, 1);
  const desktopSendKey = Buffer.alloc(32, 2);
  const store = createLanV2SessionStore({
    now: () => current,
    randomBytesImpl: (size) => Buffer.alloc(size, 9)
  });
  const established = store.establish({
    accountId: "7",
    credentialId: "credential-123",
    phoneDeviceId: "phone-123",
    receiveKey: phoneSendKey,
    sendKey: desktopSendKey,
    scopes: ["desktop:rpc"]
  });
  const request = encryptRpcEnvelope({
    key: phoneSendKey,
    sessionId: established.sessionId,
    route: "/projects",
    requestId: "request-12345678",
    sequence: 1,
    timestamp: new Date(current).toISOString(),
    payload: { list: true },
    randomBytesImpl: (size) => Buffer.alloc(size, 3)
  });
  const decrypted = store.decryptRequest(request);
  assert.deepEqual(decrypted.payload, { list: true });
  assert.deepEqual(decrypted.principal, {
    accountId: "7",
    credentialId: "credential-123",
    phoneDeviceId: "phone-123",
    scopes: ["desktop:rpc"]
  });
  assert.throws(() => store.decryptRequest(request), (error) => error?.code === "LAN_V2_REPLAY");

  const response = store.encryptResponse(established.sessionId, {
    route: "/projects",
    requestId: "request-12345678",
    payload: { projects: [] }
  });
  assert.equal(response.sequence, 1);
  assert.equal(response.sessionId, established.sessionId);
});

test("LAN V2 sessions expire on idle and revoke all sessions for a credential", () => {
  let current = 1_000;
  let randomValue = 1;
  const store = createLanV2SessionStore({
    now: () => current,
    idleMs: 100,
    absoluteMs: 1_000,
    randomBytesImpl: (size) => Buffer.alloc(size, randomValue++)
  });
  const first = store.establish(sessionInput("credential-a"));
  const second = store.establish(sessionInput("credential-a"));
  const third = store.establish(sessionInput("credential-b"));
  assert.equal(store.revokeCredential("credential-a"), 2);
  assert.equal(store.get(first.sessionId), null);
  assert.equal(store.get(second.sessionId), null);
  assert.notEqual(store.get(third.sessionId), null);

  current = 1_101;
  store.sweep();
  assert.equal(store.get(third.sessionId), null);
  assert.equal(store.size(), 0);
});

function sessionInput(credentialId) {
  return {
    accountId: "7",
    credentialId,
    phoneDeviceId: "phone-123",
    receiveKey: Buffer.alloc(32, 1),
    sendKey: Buffer.alloc(32, 2)
  };
}
