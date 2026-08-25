import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_KINDS,
  DEFAULT_NOTIFICATIONS,
  normalizeNotifications,
} from "../src/lib/notificationPrefs.ts";

test("an absent block returns the defaults by identity, not by value", () => {
  // Identity is the point: this object is read through a zustand selector, and
  // a freshly built default on every snapshot would loop useSyncExternalStore.
  assert.equal(normalizeNotifications(undefined), DEFAULT_NOTIFICATIONS);
  assert.equal(normalizeNotifications(null), DEFAULT_NOTIFICATIONS);
  assert.equal(normalizeNotifications("nonsense"), DEFAULT_NOTIFICATIONS);
});

test("volume is clamped, and NaN falls back rather than poisoning the gain node", () => {
  assert.equal(normalizeNotifications({ volume: -1 }).volume, 0);
  assert.equal(normalizeNotifications({ volume: 2 }).volume, 1);
  assert.equal(normalizeNotifications({ volume: Number.NaN }).volume, DEFAULT_NOTIFICATIONS.volume);
  assert.equal(normalizeNotifications({ volume: "loud" }).volume, DEFAULT_NOTIFICATIONS.volume);
  assert.equal(normalizeNotifications({ volume: 0.25 }).volume, 0.25);
});

test("a value outside the union is coerced back into it", () => {
  const prefs = normalizeNotifications({
    kinds: { agent: { channel: "everywhere", cue: "airhorn" } },
  });
  assert.deepEqual(prefs.kinds.agent, DEFAULT_KINDS.agent);
});

test("a partial kind keeps the half it got right", () => {
  const prefs = normalizeNotifications({ kinds: { agent: { cue: "chime" } } });
  assert.equal(prefs.kinds.agent.cue, "chime");
  assert.equal(prefs.kinds.agent.channel, DEFAULT_KINDS.agent.channel);
});

test("every known kind is present even when the file names none", () => {
  const prefs = normalizeNotifications({ enabled: false });
  assert.deepEqual(Object.keys(prefs.kinds).sort(), Object.keys(DEFAULT_KINDS).sort());
  assert.equal(prefs.enabled, false);
});

test("a kind from a newer build survives the round trip", () => {
  // Settings written by a newer Vibyra must not be silently reset by an older one.
  const prefs = normalizeNotifications({
    kinds: { somethingNew: { channel: "app", cue: "chime" } },
  });
  assert.deepEqual(prefs.kinds.somethingNew, { channel: "app", cue: "chime" });
});

test("booleans fall back per field instead of dropping the whole block", () => {
  const prefs = normalizeNotifications({ enabled: "yes", soundEnabled: false });
  assert.equal(prefs.enabled, DEFAULT_NOTIFICATIONS.enabled);
  assert.equal(prefs.soundEnabled, false);
});

test("going quiet is opt-in", () => {
  assert.equal(DEFAULT_NOTIFICATIONS.agentIdleEnabled, false);
});
