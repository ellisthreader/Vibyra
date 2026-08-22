import assert from "node:assert/strict";
import test from "node:test";

import {
  createOsGate,
  cueFor,
  shouldEscalate,
  shouldShow,
} from "../src/lib/notificationPolicy.ts";

const CATEGORIES = [
  "agentAttention",
  "agentDone",
  "agentFailed",
  "performance",
  "preview",
  "aiSpend",
  "models",
  "system",
];

function prefs(overrides = {}, channel = "system", cue = "done") {
  const categories = {};
  for (const id of CATEGORIES) categories[id] = { channel, cue };
  return {
    enabled: true,
    soundEnabled: true,
    volume: 0.8,
    osEnabled: true,
    osOnlyWhenAway: true,
    agentIdleEnabled: false,
    categories,
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    id: 1,
    at: 0,
    count: 1,
    read: false,
    category: "agentDone",
    severity: "success",
    title: "Agent finished",
    ...overrides,
  };
}

function escalates(p, i, ctx = {}) {
  return shouldEscalate(p, i, { focused: false, isRepeat: false, now: 0, ...ctx }, createOsGate());
}

test("in-app visibility follows the master switch and the channel", () => {
  assert.equal(shouldShow(prefs(), item()), true);
  assert.equal(shouldShow(prefs({ enabled: false }), item()), false);
  assert.equal(shouldShow(prefs({}, "off"), item()), false);
  // Prefs have not loaded yet: show it rather than swallow it.
  assert.equal(shouldShow(null, item()), true);
});

test("the cue is silent until prefs load, and honours volume and the channel", () => {
  assert.equal(cueFor(prefs(), item()), "done");
  assert.equal(cueFor(null, item()), "none");
  assert.equal(cueFor(prefs({ soundEnabled: false }), item()), "none");
  assert.equal(cueFor(prefs({ volume: 0 }), item()), "none");
  assert.equal(cueFor(prefs({}, "off"), item()), "none");
  // An explicit cue on the item overrides the category default.
  assert.equal(cueFor(prefs(), item({ cue: "blip" })), "blip");
});

test("each rung of the escalation matrix blocks on its own", () => {
  assert.equal(escalates(prefs(), item()), true);
  assert.equal(escalates(prefs({ enabled: false }), item()), false);
  assert.equal(escalates(prefs({ osEnabled: false }), item()), false);
  assert.equal(escalates(prefs({}, "app"), item()), false);
  assert.equal(escalates(prefs(), item({ severity: "info" })), false);
  assert.equal(escalates(prefs(), item({ osEligible: false })), false);
  assert.equal(escalates(prefs(), item(), { isRepeat: true }), false);
});

test("osOnlyWhenAway blocks while the window is focused, and can be turned off", () => {
  assert.equal(escalates(prefs(), item(), { focused: true }), false);
  assert.equal(escalates(prefs({ osOnlyWhenAway: false }), item(), { focused: true }), true);
});

test("a blocked notification does not spend an OS slot", () => {
  const gate = createOsGate();
  const ctx = { focused: false, isRepeat: false, now: 0 };
  shouldEscalate(prefs(), item({ severity: "info" }), ctx, gate);
  assert.equal(shouldEscalate(prefs(), item(), ctx, gate), true);
});

test("the OS gate allows one per five seconds", () => {
  const gate = createOsGate();
  const send = (now) =>
    shouldEscalate(prefs(), item(), { focused: false, isRepeat: false, now }, gate);
  assert.equal(send(0), true);
  assert.equal(send(4_999), false);
  assert.equal(send(5_000), true);
});

test("the OS gate refuses a seventh inside one minute, then recovers", () => {
  const gate = createOsGate();
  const send = (now) =>
    shouldEscalate(prefs(), item(), { focused: false, isRepeat: false, now }, gate);
  for (let i = 0; i < 6; i += 1) assert.equal(send(i * 5_000), true);
  assert.equal(send(30_000), false);
  // The first send falls out of the rolling minute and a slot frees up.
  assert.equal(send(60_001), true);
});
