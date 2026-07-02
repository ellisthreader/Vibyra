import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDeviceCredentialStore } from "./deviceCredentials.mjs";
import { assertOwnerOnlySecretFile } from "./secretFileTestHelpers.mjs";
import { loadOrCreateDesktopToken } from "./state.mjs";

test("device credentials are distinct and persist only hashed secrets", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-device-credentials-"));
  const filePath = join(home, "device-credentials.json");
  const store = createDeviceCredentialStore({ filePath });
  try {
    const first = store.issue({ accountId: 7, deviceName: "Phone One" });
    const second = store.issue({ accountId: 7, deviceName: "Phone Two" });
    const persisted = await readFile(filePath, "utf8");
    const payload = JSON.parse(persisted);

    assert.match(first.token, /^vdc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.notEqual(first.token, second.token);
    assert.equal(payload.credentials.length, 2);
    assert.equal(persisted.includes(first.token), false);
    assert.equal(persisted.includes(first.token.split(".")[2]), false);
    assert.deepEqual(Object.keys(payload.credentials[0]).sort(), [
      "accountId",
      "createdAt",
      "credentialId",
      "deviceName",
      "expiresAt",
      "lastUsedAt",
      "minimumProtocol",
      "phoneDeviceId",
      "revocationGeneration",
      "revocationReason",
      "revokedAt",
      "rotatedAt",
      "rotatedFrom",
      "scopes",
      "secretHash"
    ]);
    assert.match(payload.credentials[0].secretHash, /^[a-f0-9]{64}$/);
    await assertOwnerOnlySecretFile(filePath);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("device credentials enforce account binding and revocation", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-device-auth-"));
  const filePath = join(home, "device-credentials.json");
  let currentTime = new Date("2026-06-09T10:00:00.000Z");
  const store = createDeviceCredentialStore({ filePath, now: () => currentTime });
  try {
    const issued = store.issue({ accountId: 7, deviceName: "Bound Phone" });
    assert.equal(store.authenticate(issued.token, { accountId: 8 }), null);
    currentTime = new Date("2026-06-09T10:01:00.000Z");
    assert.equal(store.authenticate(issued.token, { accountId: 7 }).deviceName, "Bound Phone");
    assert.equal(store.list()[0].lastUsedAt, currentTime.toISOString());
    currentTime = new Date("2026-06-09T10:01:30.000Z");
    assert.equal(store.authenticate(issued.token, { accountId: 7 }).deviceName, "Bound Phone");
    assert.equal(store.list()[0].lastUsedAt, "2026-06-09T10:01:00.000Z");
    currentTime = new Date("2026-06-09T10:02:00.000Z");
    assert.equal(store.authenticate(issued.token, { accountId: 7 }).deviceName, "Bound Phone");
    assert.equal(store.list()[0].lastUsedAt, currentTime.toISOString());
    assert.equal(store.revoke(issued.credentialId), true);
    assert.equal(store.authenticate(issued.token, { accountId: 7 }), null);
    assert.equal(store.list()[0].revokedAt, currentTime.toISOString());
    assert.equal(store.list()[0].revocationReason, "removed");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("device credentials rotate, expire, scope principals, and pin protocol floors", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-device-lifecycle-"));
  const filePath = join(home, "device-credentials.json");
  let currentTime = new Date("2026-06-09T10:00:00.000Z");
  const store = createDeviceCredentialStore({ filePath, now: () => currentTime });
  try {
    const issued = store.issue({
      accountId: 7,
      deviceName: "Lifecycle Phone",
      phoneDeviceId: "phone-install-7",
      scopes: ["preview", "desktop:rpc"]
    });
    assert.equal(store.updateMinimumProtocol(issued.credentialId, 2), true);
    assert.equal(store.authenticate(issued.token, { accountId: 7, protocol: 1 }), null);
    const principal = store.authenticate(issued.token, { accountId: 7, protocol: 2 });
    assert.equal(principal.phoneDeviceId, "phone-install-7");
    assert.deepEqual(principal.scopes, ["desktop:rpc", "preview"]);
    assert.equal(principal.minimumProtocol, 2);

    const rotated = store.rotate(issued.credentialId);
    assert.equal(store.authenticate(issued.token, { accountId: 7, protocol: 2 }), null);
    assert.equal(rotated.rotatedFrom, issued.credentialId);
    assert.equal(store.authenticate(rotated.token, { accountId: 7, protocol: 2 }).credentialId, rotated.credentialId);
    assert.equal(store.list().find((item) => item.credentialId === issued.credentialId).revocationReason, "rotated");

    currentTime = new Date("2026-09-08T10:00:01.000Z");
    assert.equal(store.authenticate(rotated.token, { accountId: 7, protocol: 2 }), null);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("fresh desktop tokens use 32 crypto-random bytes without rotating existing files", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-desktop-token-"));
  const tokenPath = join(home, "desktop-token");
  try {
    const token = loadOrCreateDesktopToken({ tokenPath });
    const encoded = token.replace(/^vibyra-/, "");
    assert.equal(Buffer.from(encoded, "base64url").length, 32);
    await assertOwnerOnlySecretFile(tokenPath);

    await writeFile(tokenPath, "existing-phone-token\n", { mode: 0o600 });
    assert.equal(loadOrCreateDesktopToken({ tokenPath }), "existing-phone-token");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
