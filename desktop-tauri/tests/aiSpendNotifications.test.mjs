import assert from "node:assert/strict";
import test from "node:test";

import { timeoutFor } from "../src/lib/notificationTiers.ts";

import { spendNotification, spendTier } from "../src/lib/aiSpendNotifications.ts";

const limits = { dailyCalls: 0, hourlyCalls: 0, dailySpendUsd: 2, monthlySpendUsd: 20 };
const usage = (day, month) => ({ spendTodayUsd: day, spendMonthUsd: month });

test("ordinary spending says nothing", () => {
  assert.equal(spendTier(usage(0.5, 4), limits), "none");
});

test("four fifths of a cap is the warning point", () => {
  assert.equal(spendTier(usage(1.6, 4), limits), "near");
  assert.equal(spendTier(usage(1.59, 4), limits), "none");
});

test("either cap can be the one that bites", () => {
  assert.equal(spendTier(usage(0.1, 16), limits), "near");
  assert.equal(spendTier(usage(0.1, 20), limits), "reached");
});

test("reaching a cap outranks merely nearing the other", () => {
  assert.equal(spendTier(usage(2, 16), limits), "reached");
});

test("a cap of zero is no cap at all", () => {
  // Zero disables that guardrail in Rust, so it must not warn either.
  assert.equal(spendTier(usage(99, 99), { ...limits, dailySpendUsd: 0, monthlySpendUsd: 0 }), "none");
});

test("the warning explains what happens next, the alarm is sticky", () => {
  assert.equal(spendNotification("none"), null);
  assert.equal(spendNotification("near").kind, "spend");
  assert.equal(spendNotification("near").tier, "risk");
  assert.equal(spendNotification("near").osEligible, false);
  // Sticky now comes from the tier rather than a hand-set timeout, so the two
  // can never drift apart.
  assert.equal(spendNotification("reached").tier, "fail");
  assert.equal(timeoutFor(spendNotification("reached").tier), 0);
  assert.equal(spendNotification("reached").action.id, "openAiSettings");
});
