import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { APP_API_URL, appState, TOKEN } from "./state.mjs";
import { desktopAppApiUrl } from "./appApiConfig.mjs";
import {
  persistDesktopAccountSession,
  removeDesktopAccountSession,
  restoreDesktopAccountSessionSnapshot,
  verifyAndSetDesktopAccount
} from "./desktopAccount.mjs";
import { pairDevice, pairStatus } from "./pairingHandlers.mjs";

test("pairing rejects LAN requests before desktop account verification", async () => {
  resetPairingState();
  const res = await requestPair({ autoPair: true, accountId: 1 });

  assert.equal(res.status, 403);
  assert.match(res.body.error, /Log in to Vibyra Desktop/);
  assert.equal(appState.pendingPair, null);
});

test("desktop account verification keeps billing and model tier fields", async () => {
  resetPairingState();

  const account = await verifyAndSetDesktopAccount("session-token", async () => jsonResponse({
    user: {
      id: 3,
      email: "member@example.test",
      name: "Member",
      plan: "starter",
      planBillingCycle: "annual",
      billingProvider: "stripe",
      canManageStripeBilling: true,
      creditsResetAt: "2026-07-09T10:00:00.000Z",
      planPricePence: 9900,
      creditsBalance: 520,
      creditsUsed: 30,
      monthlyCredits: 550,
      dailyCreditsCap: 100,
      allowedModelTiers: ["free", "budget", "balanced", "premium"]
    }
  }));

  assert.equal(account.plan, "starter");
  assert.equal(account.planBillingCycle, "annual");
  assert.equal(account.billingProvider, "stripe");
  assert.equal(account.canManageStripeBilling, true);
  assert.equal(account.creditsResetAt, "2026-07-09T10:00:00.000Z");
  assert.equal(account.planPricePence, 9900);
  assert.equal(account.creditsBalance, 520);
  assert.equal(account.monthlyCredits, 550);
  assert.deepEqual(account.allowedModelTiers, ["free", "budget", "balanced", "premium"]);
  assert.equal(appState.desktopAccountToken, "session-token");
});

test("desktop state exposes the backend used for account verification", () => {
  assert.match(APP_API_URL, /^https?:\/\//);
});

test("direct desktop startup uses the app backend from the root environment", () => {
  assert.equal(desktopAppApiUrl({}), "https://vibyra-production.up.railway.app");
});

test("explicit desktop backend configuration overrides the app environment", () => {
  assert.equal(desktopAppApiUrl({
    EXPO_PUBLIC_API_URL: "https://phone.example.test",
    VIBYRA_DESKTOP_API_URL: "http://127.0.0.1:8000/"
  }), "http://127.0.0.1:8000");
});

test("failed desktop account verification clears an older bridge session", async () => {
  resetPairingState();
  appState.desktopAccount = { id: 7, name: "Old account" };
  appState.desktopAccountToken = "stale-token";

  await assert.rejects(
    verifyAndSetDesktopAccount("expired-token", async () => jsonResponse({
      ok: false,
      error: "Your session expired. Please log in again."
    }, 401)),
    (error) => error?.status === 401 && /session expired/i.test(error?.message)
  );

  assert.equal(appState.desktopAccount, null);
  assert.equal(appState.desktopAccountToken, null);
});

test("desktop account session persists privately and restores after a bridge restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-desktop-session-"));
  const sessionPath = join(home, "desktop-account-session.json");
  const account = { id: 7, email: "desktop@example.test", name: "Desktop User", plan: "free" };
  try {
    persistDesktopAccountSession("session-token", account, { sessionPath });
    assert.equal((await stat(sessionPath)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(sessionPath, "utf8")).token, "session-token");

    appState.desktopAccount = null;
    appState.desktopAccountToken = null;
    assert.deepEqual(restoreDesktopAccountSessionSnapshot({ sessionPath }), {
      token: "session-token",
      account
    });
    assert.deepEqual(appState.desktopAccount, account);
    assert.equal(appState.desktopAccountToken, "session-token");

    removeDesktopAccountSession({ sessionPath });
    await assert.rejects(readFile(sessionPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("pairing rejects phones signed into a different account", async () => {
  resetPairingState();
  appState.desktopAccount = { id: 2, email: "desktop@example.test", name: "Desktop User", plan: "free" };
  const res = await requestPair({ autoPair: true, accountId: 1 });

  assert.equal(res.status, 403);
  assert.match(res.body.error, /different Vibyra account/);
  assert.equal(appState.pendingPair, null);
});

test("pairing stores the verified desktop account id with the pending request", async () => {
  resetPairingState();
  appState.desktopAccount = { id: 7, email: "desktop@example.test", name: "Desktop User", plan: "free" };
  const res = await requestPair({ autoPair: true, accountId: 7, requestId: "phone-pair-test" });

  assert.equal(res.status, 202);
  assert.equal(res.body.status, "pending");
  assert.equal(appState.pendingPair.accountId, 7);
});

test("approved pairing status is denied if the desktop account changes", async () => {
  resetPairingState();
  appState.desktopAccount = { id: 7, email: "desktop@example.test", name: "Desktop User", plan: "free" };
  const pair = await requestPair({ autoPair: true, accountId: 7, requestId: "phone-pair-test" });
  appState.pendingPair = { ...appState.pendingPair, status: "approved" };
  appState.desktopAccount = { id: 8, email: "other@example.test", name: "Other User", plan: "free" };

  const res = makeRes();
  await pairStatus(res, pair.body.requestId);

  assert.equal(res.status, 403);
  assert.equal(res.body.status, "denied");
});

test("approved pairing status returns a per-device token for the same account", async () => {
  const home = await mkdtemp(join(tmpdir(), "vibyra-pairing-account-"));
  const previousPath = process.env.VIBYRA_DEVICE_CREDENTIALS_PATH;
  process.env.VIBYRA_DEVICE_CREDENTIALS_PATH = join(home, "device-credentials.json");
  resetPairingState();
  try {
    appState.desktopAccount = { id: 7, email: "desktop@example.test", name: "Desktop User", plan: "free" };
    const pair = await requestPair({ autoPair: true, accountId: 7, requestId: "phone-pair-test" });
    appState.pendingPair = { ...appState.pendingPair, status: "approved" };

    const res = makeRes();
    await pairStatus(res, pair.body.requestId);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "approved");
    assert.match(res.body.token, /^vdc1\./);
    assert.notEqual(res.body.token, TOKEN);
  } finally {
    if (previousPath === undefined) delete process.env.VIBYRA_DEVICE_CREDENTIALS_PATH;
    else process.env.VIBYRA_DEVICE_CREDENTIALS_PATH = previousPath;
    await rm(home, { recursive: true, force: true });
  }
});

async function requestPair(body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.headers = {};
  const res = makeRes();
  await pairDevice(req, res);
  return res;
}

function makeRes() {
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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function resetPairingState() {
  appState.desktopAccount = null;
  appState.desktopAccountToken = null;
  appState.pendingPair = null;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  appState.cachedProjects = [];
  appState.events = [];
}
