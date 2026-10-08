import assert from "node:assert/strict";
import test from "node:test";

import {
  groupIdFor,
  groupNotifications,
} from "../src/components/notifications/notificationGroups.ts";

const NOW = new Date(2026, 4, 14, 15, 30, 0).getTime();
const DAY = 86_400_000;

function item(overrides = {}) {
  return {
    id: 1,
    at: NOW,
    count: 1,
    read: false,
    category: "agentDone",
    severity: "success",
    title: "Agent finished",
    ...overrides,
  };
}

test("anything inside the last minute is 'Just now'", () => {
  assert.equal(groupIdFor(NOW, NOW), "now");
  assert.equal(groupIdFor(NOW - 59_000, NOW), "now");
  assert.equal(groupIdFor(NOW - 61_000, NOW), "today");
});

test("buckets fall on calendar boundaries, not fixed 24h windows", () => {
  const startOfToday = new Date(2026, 4, 14, 0, 0, 0).getTime();
  assert.equal(groupIdFor(startOfToday, NOW), "today");
  assert.equal(groupIdFor(startOfToday - 1, NOW), "yesterday");

  const startOfYesterday = new Date(2026, 4, 13, 0, 0, 0).getTime();
  assert.equal(groupIdFor(startOfYesterday, NOW), "yesterday");
  assert.equal(groupIdFor(startOfYesterday - 1, NOW), "earlier");
});

test("groups come back newest-first with adjacent buckets merged", () => {
  const groups = groupNotifications(
    [
      item({ id: 1, at: NOW - 3 * DAY }),
      item({ id: 2, at: NOW - 2_000 }),
      item({ id: 3, at: NOW - DAY }),
      item({ id: 4, at: NOW - 10_000 }),
      item({ id: 5, at: NOW - 4 * 3_600_000 }),
    ],
    NOW,
  );

  assert.deepEqual(
    groups.map((group) => group.id),
    ["now", "today", "yesterday", "earlier"],
  );
  assert.deepEqual(
    groups.map((group) => group.label),
    ["Just now", "Today", "Yesterday", "Earlier"],
  );
  // Both fresh items merged into the single "Just now" section, newest first.
  assert.deepEqual(
    groups[0].items.map((entry) => entry.id),
    [2, 4],
  );
  assert.equal(groups.length, 4, "one section per bucket, never one per item");
});

test("an empty history produces no sections at all", () => {
  assert.deepEqual(groupNotifications([], NOW), []);
});

test("grouping never mutates or reorders the caller's array", () => {
  const items = [item({ id: 1, at: NOW - DAY }), item({ id: 2, at: NOW })];
  groupNotifications(items, NOW);
  assert.deepEqual(
    items.map((entry) => entry.id),
    [1, 2],
  );
});
