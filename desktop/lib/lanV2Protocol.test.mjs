import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadOrCreateDesktopIdentity } from "./lanV2Identity.mjs";
import { assertOwnerOnlySecretFile } from "./secretFileTestHelpers.mjs";
import {
  canonicalJson,
  createEphemeralKeyPair,
  createPairingTranscript,
  decryptRpcEnvelope,
  deriveSessionKeys,
  encryptRpcEnvelope,
  ReplayWindow,
  signPairingTranscript,
  verifyPairingTranscript
} from "./lanV2Protocol.mjs";

test("canonical JSON is deterministic and rejects ambiguous values", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: true, x: ["ok", 2] } }),
    '{"a":{"x":["ok",2],"y":true},"z":1}'
  );
  assert.throws(() => canonicalJson({ value: undefined }), /undefined/);
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/);
});

test("desktop identities persist with restricted permissions and stable fingerprints", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-lan-v2-identity-"));
  const filePath = join(home, "identity.json");
  try {
    const first = loadOrCreateDesktopIdentity({ filePath });
    const second = loadOrCreateDesktopIdentity({ filePath });
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(first.desktopId, second.desktopId);
    assert.match(first.desktopId, /^[A-Za-z0-9_-]{43}$/);
    assert.match(persisted.privateKeyPem, /PRIVATE KEY/);
    await assertOwnerOnlySecretFile(filePath);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("pairing transcripts are signed and bind both ephemeral keys", () => {
  const identity = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" }
  });
  const transcript = fixtureTranscript();
  const signature = signPairingTranscript(transcript, identity.privateKey);
  assert.equal(verifyPairingTranscript(transcript, signature, identity.publicKey), true);
  assert.equal(verifyPairingTranscript({
    ...transcript,
    phoneDeviceId: "different-phone"
  }, signature, identity.publicKey), false);
});

test("X25519 agreement derives matching directional keys and AES-GCM binds metadata", () => {
  const desktop = createEphemeralKeyPair();
  const phone = createEphemeralKeyPair();
  const transcript = fixtureTranscript({
    desktopEphemeralKey: desktop.publicKey,
    phoneEphemeralKey: phone.publicKey
  });
  const desktopKeys = deriveSessionKeys({
    privateKey: desktop.privateKey,
    peerPublicKey: phone.publicKey,
    transcript,
    role: "desktop"
  });
  const phoneKeys = deriveSessionKeys({
    privateKey: phone.privateKey,
    peerPublicKey: desktop.publicKey,
    transcript,
    role: "phone"
  });
  assert.deepEqual(desktopKeys.receiveKey, phoneKeys.sendKey);
  assert.deepEqual(desktopKeys.sendKey, phoneKeys.receiveKey);

  const envelope = encryptRpcEnvelope({
    key: phoneKeys.sendKey,
    sessionId: "session-12345678",
    route: "/projects",
    requestId: "request-12345678",
    sequence: 1,
    timestamp: "2026-06-09T12:00:01.000Z",
    payload: { action: "list" },
    randomBytesImpl: () => Buffer.alloc(12, 7)
  });
  assert.deepEqual(decryptRpcEnvelope(envelope, desktopKeys.receiveKey).payload, { action: "list" });
  assert.throws(
    () => decryptRpcEnvelope({ ...envelope, route: "/files" }, desktopKeys.receiveKey),
    /authenticate|Unsupported state/i
  );
});

test("replay windows accept bounded reordering and reject duplicates or stale sequences", () => {
  const window = new ReplayWindow(4);
  assert.equal(window.accept(1), 1);
  assert.equal(window.accept(3), 3);
  assert.equal(window.accept(2), 2);
  assert.throws(() => window.accept(2), (error) => error?.code === "LAN_V2_REPLAY");
  assert.equal(window.accept(8), 8);
  assert.throws(() => window.accept(4), (error) => error?.code === "LAN_V2_SEQUENCE_OLD");
});

function fixtureTranscript(overrides = {}) {
  return createPairingTranscript({
    accountId: "7",
    assertionId: "assertion-12345678",
    desktopId: "desktop-12345678",
    desktopEphemeralKey: "desktop-key-12345678",
    expiresAt: "2026-06-09T12:02:00.000Z",
    issuedAt: "2026-06-09T12:00:00.000Z",
    phoneDeviceId: "phone-12345678",
    phoneEphemeralKey: "phone-key-12345678",
    requestId: "request-12345678",
    ...overrides
  });
}
