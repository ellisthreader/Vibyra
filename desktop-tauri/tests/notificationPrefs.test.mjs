import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CATEGORIES,
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
    categories: { agentDone: { channel: "everywhere", cue: "airhorn" } },
  });
  assert.deepEqual(prefs.categories.agentDone, DEFAULT_CATEGORIES.agentDone);
});

test("a partial category keeps the half it got right", () => {
  const prefs = normalizeNotifications({ categories: { agentDone: { cue: "chime" } } });
  assert.equal(prefs.categories.agentDone.cue, "chime");
  assert.equal(prefs.categories.agentDone.channel, DEFAULT_CATEGORIES.agentDone.channel);
});

test("every known category is present even when the file names none", () => {
  const prefs = normalizeNotifications({ enabled: false });
  assert.deepEqual(Object.keys(prefs.categories).sort(), Object.keys(DEFAULT_CATEGORIES).sort());
  assert.equal(prefs.enabled, false);
});

test("a category from a newer build survives the round trip", () => {
  // Settings written by a newer Vibyra must not be silently reset by an older one.
  const prefs = normalizeNotifications({
    categories: { somethingNew: { channel: "app", cue: "chime" } },
  });
  assert.deepEqual(prefs.categories.somethingNew, { channel: "app", cue: "chime" });
});

test("booleans fall back per field instead of dropping the whole block", () => {
  const prefs = normalizeNotifications({ enabled: "yes", soundEnabled: false });
  assert.equal(prefs.enabled, DEFAULT_NOTIFICATIONS.enabled);
  assert.equal(prefs.soundEnabled, false);
});

test("going quiet is opt-in", () => {
  assert.equal(DEFAULT_NOTIFICATIONS.agentIdleEnabled, false);
});
