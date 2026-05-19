import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { appState, TOKEN } from "./state.mjs";
import { verifyAndSetDesktopAccount } from "./desktopAccount.mjs";
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
      creditsBalance: 520,
      creditsUsed: 30,
      monthlyCredits: 550,
      dailyCreditsCap: 100,
      allowedModelTiers: ["free", "budget", "balanced", "premium"]
    }
  }));

  assert.equal(account.plan, "starter");
  assert.equal(account.planBillingCycle, "annual");
  assert.equal(account.creditsBalance, 520);
  assert.equal(account.monthlyCredits, 550);
  assert.deepEqual(account.allowedModelTiers, ["free", "budget", "balanced", "premium"]);
  assert.equal(appState.desktopAccountToken, "session-token");
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

test("approved pairing status returns the desktop token for the same account", async () => {
  resetPairingState();
  appState.desktopAccount = { id: 7, email: "desktop@example.test", name: "Desktop User", plan: "free" };
  const pair = await requestPair({ autoPair: true, accountId: 7, requestId: "phone-pair-test" });
  appState.pendingPair = { ...appState.pendingPair, status: "approved" };

  const res = makeRes();
  await pairStatus(res, pair.body.requestId);

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "approved");
  assert.equal(res.body.token, TOKEN);
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
  appState.pendingPair = null;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  appState.cachedProjects = [];
  appState.events = [];
}
