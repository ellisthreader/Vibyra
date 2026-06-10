import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import {
  checkPairingRateLimit,
  clearPairingRateLimitsForTests,
  expirePairingRequest,
  isValidPairRequestId,
  PAIRING_APPROVED_TTL_MS,
  PAIRING_PENDING_TTL_MS,
  readPairingBody,
  sendPairingRateLimit
} from "./pairingSecurity.mjs";
import { pairStatus } from "./pairingHandlers.mjs";
import { appState, makePairCode } from "./state.mjs";

test.afterEach(() => {
  clearPairingRateLimitsForTests();
  delete process.env.VIBYRA_PAIR_RATE_LIMIT_ENABLED;
  appState.desktopAccount = null;
  appState.pendingPair = null;
});

test("pair codes use the expected unambiguous alphabet", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(makePairCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  }
});

test("pairing body accepts bounded fields and rejects oversized input", async () => {
  assert.deepEqual(await readPairingBody(request({
    accountId: 7,
    autoPair: true,
    requestId: "phone-pair-12345678",
    deviceName: "Ellis iPhone"
  })), {
    accountId: 7,
    autoPair: true,
    code: "",
    deviceName: "Ellis iPhone",
    requestId: "phone-pair-12345678"
  });

  await assert.rejects(
    readPairingBody(request({ requestId: "phone-pair-12345678", deviceName: "x".repeat(5000) })),
    (error) => error?.status === 413
  );
  await assert.rejects(
    readPairingBody(request({ requestId: "short" })),
    (error) => error?.status === 400 && /request ID format/i.test(error.message)
  );
});

test("pair status IDs are bounded before entering rate-limit storage", () => {
  assert.equal(isValidPairRequestId("phone-pair-12345678"), true);
  assert.equal(isValidPairRequestId("short"), false);
  assert.equal(isValidPairRequestId(`phone-pair-${"x".repeat(200)}`), false);
  assert.equal(isValidPairRequestId("phone pair with spaces"), false);
});

test("pending and approved pairing requests expire independently", () => {
  const now = Date.now();
  const pending = expirePairingRequest({
    id: "pending",
    status: "pending",
    requestedAt: new Date(now - PAIRING_PENDING_TTL_MS - 1).toISOString()
  }, now);
  const approved = expirePairingRequest({
    id: "approved",
    status: "approved",
    requestedAt: new Date(now).toISOString(),
    approvedAt: new Date(now - PAIRING_APPROVED_TTL_MS - 1).toISOString()
  }, now);

  assert.equal(pending.status, "expired");
  assert.equal(approved.status, "expired");
});

test("expired pairing status cannot issue a credential", async () => {
  appState.desktopAccount = { id: 7 };
  appState.pendingPair = {
    id: "phone-pair-expired",
    clientRequestId: "phone-pair-expired",
    accountId: 7,
    deviceName: "Expired Phone",
    requestedAt: new Date(Date.now() - PAIRING_PENDING_TTL_MS - 1).toISOString(),
    status: "pending"
  };
  const res = response();

  await pairStatus(res, appState.pendingPair.id, { socket: { remoteAddress: "192.168.1.20" } });

  assert.equal(res.status, 410);
  assert.equal(res.body.status, "expired");
  assert.equal("token" in res.body, false);
});

test("normal idempotent status polling stays below generous limits", () => {
  const req = { socket: { remoteAddress: "::ffff:192.168.1.20" } };
  for (let index = 0; index < 180; index += 1) {
    assert.equal(checkPairingRateLimit(req, "status", "phone-pair-idempotent", 1000), null);
  }
});

test("pairing rate limits return Retry-After and support emergency rollback", () => {
  const req = { socket: { remoteAddress: "192.168.1.20" } };
  for (let index = 0; index < 12; index += 1) {
    assert.equal(checkPairingRateLimit(req, "pair", "phone-pair-repeated", 1000), null);
  }
  const blocked = checkPairingRateLimit(req, "pair", "phone-pair-repeated", 1000);
  assert.equal(blocked.allowed, false);

  const res = response();
  sendPairingRateLimit(res, blocked);
  assert.equal(res.status, 429);
  assert.equal(res.headers["Retry-After"], "60");

  process.env.VIBYRA_PAIR_RATE_LIMIT_ENABLED = "false";
  assert.equal(checkPairingRateLimit(req, "pair", "phone-pair-repeated", 1000), null);
});

function request(body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.socket = { remoteAddress: "192.168.1.20" };
  return req;
}

function response() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(payload) {
      this.body = JSON.parse(payload);
    }
  };
}
