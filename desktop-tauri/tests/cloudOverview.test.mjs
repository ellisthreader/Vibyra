import assert from "node:assert/strict";
import test from "node:test";
import { cloudMoving, cloudReady, cloudSentence, overviewRows } from "../src/lib/cloudOverview.ts";
import { parseCloudOverview } from "../src/lib/cloudOverviewParsing.ts";
import { CloudProgressClock, cloudOverall, cloudTimeLine } from "../src/lib/cloudOverviewProgress.ts";
import { cloudAccountsLine, cloudCapacityLine } from "../src/lib/cloudOverviewCapacity.ts";
import { cloudLoginCanAllow, cloudLoginWords } from "../src/lib/cloudOverviewLogin.ts";

const key = id => id.repeat(32);
const now = Date.UTC(2026, 9, 7, 14);
const iso = offset => new Date(now + offset).toISOString();
const project = (id, phase, extra = {}) => ({ projectKey: key(id), name: `Project ${id}`, allowed: true,
  cloud: { state: "synced", syncedAt: iso(-1000), status: { phase, ...extra } } });
const local = (id, extra = {}) => ({ id, projectKey: key(id), name: `Project ${id}`, enabled: true, state: "synced", pendingChange: null, ...extra });
const sync = (projects = [local("a")], extra = {}) => ({ projects, paused: false, ...extra });
function overview(projects = [project("a", "uploading")], computer = {}, access = {}) {
  return parseCloudOverview({ computer: { enabled: true, connected: true, consentVersion: 3,
    computer: { state: "running", online: true, sessionsActive: 0, login: { claude: true, codex: false }, ...computer } },
  access: { projects, providers: { claude: { enabled: true }, codex: { enabled: false } }, integrations: { github: { enabled: true } }, ...access } });
}

test("server apply receipts alone establish readiness; a local synced upload remains sending, saved or applying", () => {
  for (const phase of ["uploading", "saved", "applying"]) {
    const row = overviewRows(overview([project("a", phase)]), sync(), now)[0];
    assert.equal(row.phase, phase); assert.equal(cloudReady(row), false); assert.equal(cloudMoving(row), true);
    assert.equal(cloudSentence([row], "running"), "Vibyra Cloud is syncing…");
  }
  for (const phase of ["ready", "diverged", "running"]) {
    const row = overviewRows(overview([project("a", phase)]), sync(), now)[0];
    assert.equal(cloudReady(row), true);
  }
  const unknown = overviewRows(overview([project("a", "future_phase")]), sync(), now)[0];
  assert.equal(unknown.phase, "unknown"); assert.equal(cloudReady(unknown), false);
});

test("duplicate names do not link different folders or expose one project's local changes", () => {
  const server = [{ ...project("b", "ready"), name: "Same name" }];
  const row = overviewRows(overview(server), sync([local("a", { name: "Same name", state: "notChosen", pendingChange: { files: [{}] } })]), now)[0];
  assert.equal(row.localId, null); assert.equal(row.changes, 0);
  const exact = overviewRows(overview(server), sync([local("b", { pendingChange: { files: [{}] } })]), now)[0];
  assert.equal(exact.localId, "b"); assert.equal(exact.changes, 1);
});

test("account deselection wins over stale local state and no selection is never interpreted as all projects", () => {
  assert.deepEqual(overviewRows(overview([{ ...project("a", "ready"), allowed: false }]), sync(), now), []);
  assert.deepEqual(overviewRows(overview([]), sync([local("a", { state: "notChosen" })]), now), []);
  assert.equal(cloudSentence([], "running"), "Nothing in Cloud yet");
});

test("stopped, failed, paused and unavailable computers do not claim moving sync", () => {
  for (const state of ["stopped", "error"]) {
    const row = overviewRows(overview([project("a", "applying")], { state, online: false }), sync(), now)[0];
    assert.equal(cloudMoving(row), false);
    assert.equal(row.hold, state === "error" ? "cloud_failed" : "cloud");
  }
  const paused = overviewRows(overview(), sync([local("a")], { paused: true }), now)[0];
  assert.equal(paused.hold, "computer_paused"); assert.equal(cloudMoving(paused), false);
  const away = overviewRows(overview([project("b", "preparing")], {}, { macs: [{ id: "old", state: "offline", lastSeenAt: iso(-600_000) }] }), sync([]), now)[0];
  assert.equal(away.hold, "computer_away"); assert.equal(cloudMoving(away), false);
  const ready = overviewRows(overview([project("a", "ready")]), sync([local("a")], { paused: true }), now)[0];
  assert.equal(cloudReady(ready), true, "pausing local uploads does not destroy an already applied cloud copy");
});

test("saved auto-wake grace expires into an actionable hold instead of syncing indefinitely", () => {
  const recent = overview([project("a", "saved", { syncedAt: iso(-30_000) })], { state: "stopped", online: false });
  assert.equal(overviewRows(recent, sync(), now)[0].hold, undefined);
  assert.equal(overviewRows(recent, sync(), now + 100_000)[0].hold, "cloud");
});

test("aggregate session counts never assign running to an unrelated project", () => {
  const row = overviewRows(overview([project("a", "ready")], { sessionsActive: 4 }), sync(), now)[0];
  assert.equal(row.phase, "ready");
  assert.equal(cloudSentence([row], "running"), "1 project ready");
});

test("progress estimates are scoped, held work is still, and clocks never manufacture readiness", () => {
  const row = overviewRows(overview([project("a", "uploading", { sent: 42, total: 100 })]), sync(), now)[0];
  const clock = new CloudProgressClock();
  const initial = clock.progress(row, now), late = clock.progress(row, now + 3_600_000);
  assert.equal(initial.progress, late.progress, "measured bytes do not advance with elapsed time");
  assert.ok(late.progress < 1); assert.equal(cloudReady(row), false);
  const applying = { ...row, phase: "applying", upload: undefined };
  clock.progress(applying, now);
  const slow = clock.progress(applying, now + 3_600_000);
  assert.ok(slow.progress < 1); assert.equal(slow.slow, true);
  assert.match(cloudTimeLine({ a: slow }, now + 3_600_000), /taking longer/);
  assert.equal(clock.progress({ ...row, hold: "cloud" }, now).moving, false);
  const otherScope = new CloudProgressClock().progress(applying, now + 3_600_000);
  assert.equal(otherScope.slow, false, "another account or connection starts a fresh clock");
  assert.ok(cloudOverall([applying], { [applying.key]: slow }) < 1);
});

test("raw native envelopes validate required state and preserve unknown provider capability", () => {
  for (const raw of [null, {}, { computer: { enabled: true, connected: true }, access: { error: "denied" } }]) {
    assert.throws(() => parseCloudOverview(raw), /incomplete update/);
  }
  const parsed = overview([], { state: "running", online: false, login: {} }, { providers: {}, integrations: {} });
  assert.equal(parsed.computer.chip, "starting");
  assert.equal(parsed.providers.claude.enabled, null); assert.equal(parsed.providers.claude.signedIn, null);
  assert.equal(cloudAccountsLine(parsed), "Sign-in status unavailable");
});

test("capacity is drawn from actual limits and provider policy is separate from sign-in", () => {
  const parsed = overview([], {}, { capacity: { storage: { usedBytes: 1288490188, limitBytes: 5368709120 }, idleStopSeconds: 300 } });
  assert.equal(cloudCapacityLine(parsed.capacity, parsed.computer), "1.2 GB of 5 GB · stops after 5 min idle");
  assert.equal(cloudAccountsLine(parsed), "Claude ✓"); assert.equal(parsed.providers.codex.enabled, false);
  assert.equal(parsed.providers.codex.signedIn, false);
  assert.equal(cloudCapacityLine(null, null), null);
});

test("a Cloud login upload receipt never claims that runtime authentication succeeded", () => {
  const done = { id: "codex", state: "done", error: null };
  const provider = { enabled: true, signedIn: false, pending: true, appliedAt: null };
  assert.equal(cloudLoginWords(done, provider), "Sign-in sent. Waiting for Vibyra Cloud…");
  assert.equal(cloudLoginCanAllow(done, provider), false);
  const signed = { ...provider, pending: false, signedIn: true, appliedAt: iso(0) };
  assert.equal(cloudLoginWords(done, signed), "Signed in on Vibyra Cloud.");
  const expired = { ...signed, signedIn: false };
  assert.equal(cloudLoginWords(done, expired), "Cloud needs a new sign-in.");
  assert.equal(cloudLoginCanAllow(done, expired), true, "historical installation does not hide a revoked runtime login");
  assert.equal(cloudLoginWords(done, { ...signed, signedIn: null }), "Sign-in received by Cloud. Checking…");
  assert.equal(cloudLoginCanAllow({ ...done, state: "waitingForCloud" }, { ...provider, pending: false }), true,
    "an explicit retry remains available after the first Cloud start publishes its key");
});
