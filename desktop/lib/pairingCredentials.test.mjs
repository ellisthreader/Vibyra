import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  clearPairingCredentialIssuancesForTests,
  createDeviceCredentialStore
} from "./deviceCredentials.mjs";
import {
  isAuthed,
  pairDevice,
  pairStatus
} from "./pairingHandlers.mjs";
import { appState, disconnectPhone, TOKEN } from "./state.mjs";

test("approved pair status is idempotent and distinct devices get distinct credentials", async () => {
  await withCredentialHome(async (filePath) => {
    const first = await approvedPairToken("pair-one", "Phone One");
    const firstAgain = await statusToken("pair-one");
    appState.pendingPair = null;
    const second = await approvedPairToken("pair-two", "Phone Two");
    const persisted = JSON.parse(await readFile(filePath, "utf8"));

    assert.equal(firstAgain, first);
    assert.notEqual(second, first);
    assert.equal(persisted.credentials.length, 2);
  });
});

test("per-device auth is account-bound, revocable, and survives session-only disconnect", async () => {
  await withCredentialHome(async (filePath) => {
    const token = await approvedPairToken("pair-auth", "Remembered Phone");
    const credentialId = token.split(".")[1];
    const req = authRequest(token);

    assert.equal(isAuthed(req), true);
    disconnectPhone();
    assert.equal(isAuthed(req), true);
    appState.desktopAccount = { id: 8 };
    assert.equal(isAuthed(req), false);
    appState.desktopAccount = { id: 7 };
    assert.equal(createDeviceCredentialStore({ filePath }).revoke(credentialId), true);
    assert.equal(isAuthed(req), false);
  });
});

test("credential issuance rollback returns the global token without writing a device record", async () => {
  await withCredentialHome(async (filePath) => {
    process.env.VIBYRA_DEVICE_CREDENTIALS_ENABLED = "false";
    const token = await approvedPairToken("pair-rollback", "Rollback Phone");

    assert.equal(token, TOKEN);
    await assert.rejects(readFile(filePath, "utf8"), { code: "ENOENT" });
  });
});

test("legacy global token compatibility can be disabled independently", async () => {
  await withCredentialHome(async () => {
    appState.desktopAccount = { id: 7 };
    assert.equal(isAuthed(authRequest(TOKEN)), true);
    process.env.VIBYRA_LEGACY_PHONE_TOKEN_ENABLED = "false";
    assert.equal(isAuthed(authRequest(TOKEN)), false);
  });
});

async function approvedPairToken(requestId, deviceName) {
  appState.desktopAccount = { id: 7 };
  const pair = await requestPair({ autoPair: true, accountId: 7, requestId, deviceName });
  appState.pendingPair = { ...appState.pendingPair, status: "approved" };
  return statusToken(pair.body.requestId);
}

async function statusToken(requestId) {
  const res = makeRes();
  await pairStatus(res, requestId);
  assert.equal(res.status, 200);
  return res.body.token;
}

async function requestPair(body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.headers = {};
  const res = makeRes();
  await pairDevice(req, res);
  return res;
}

function authRequest(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

function makeRes() {
  return {
    status: 0,
    body: null,
    writeHead(status) {
      this.status = status;
    },
    end(payload) {
      this.body = JSON.parse(payload);
    }
  };
}

async function withCredentialHome(run) {
  const home = await mkdtemp(join(tmpdir(), "vibyra-pairing-credentials-"));
  const filePath = join(home, "device-credentials.json");
  const previousPath = process.env.VIBYRA_DEVICE_CREDENTIALS_PATH;
  const previousCredentialsFlag = process.env.VIBYRA_DEVICE_CREDENTIALS_ENABLED;
  const previousLegacyFlag = process.env.VIBYRA_LEGACY_PHONE_TOKEN_ENABLED;
  try {
    process.env.VIBYRA_DEVICE_CREDENTIALS_PATH = filePath;
    delete process.env.VIBYRA_DEVICE_CREDENTIALS_ENABLED;
    delete process.env.VIBYRA_LEGACY_PHONE_TOKEN_ENABLED;
    resetState();
    clearPairingCredentialIssuancesForTests();
    await run(filePath);
  } finally {
    restoreEnv("VIBYRA_DEVICE_CREDENTIALS_PATH", previousPath);
    restoreEnv("VIBYRA_DEVICE_CREDENTIALS_ENABLED", previousCredentialsFlag);
    restoreEnv("VIBYRA_LEGACY_PHONE_TOKEN_ENABLED", previousLegacyFlag);
    resetState();
    clearPairingCredentialIssuancesForTests();
    await rm(home, { recursive: true, force: true });
  }
}

function resetState() {
  appState.desktopAccount = null;
  appState.pendingPair = null;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  appState.cachedProjects = [];
  appState.events = [];
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
