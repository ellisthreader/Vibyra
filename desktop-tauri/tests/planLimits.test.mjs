import assert from "node:assert/strict";
import test from "node:test";

import { allows, canAddProject, limitsOf, OPEN_LIMITS, FREE_LIMITS, planLimitFrom, projectLocked, trialDaysLeft } from "../src/lib/planLimits.ts";
import { membershipView } from "../src/lib/membership.ts";

const FREE = { enforced: true, plan: "free", trial: false, paidUntil: null, maxTerminals: 2, maxProjects: 1,
  safeWorktrees: false, preview: false, review: false, agents: false, remoteAccess: false };
const account = (planLimits, changes = {}) => ({
  name: "Ada", email: "ada@vibyra.app", provider: "email", plan: "free", emailVerified: true,
  welcomeKey: "vw_test", twoFactorEnabled: false, createdAt: null, planBillingCycle: "monthly",
  planRenewsAt: null, creditsResetAt: null, membershipEndsAt: null, membershipCancelAtPeriodEnd: false,
  billingProvider: null, canManageStripeBilling: false, hasAvatar: false, planLimits, ...changes,
});

test("a native plan limit becomes an upgrade notice wherever it sits in an error", () => {
  const raw = "plan-limit:terminals: Free runs 2 terminals at once. Close one, or get Vibyra Pro for unlimited terminals.";
  assert.deepEqual(planLimitFrom(raw), {
    feature: "terminals",
    message: "Free runs 2 terminals at once. Close one, or get Vibyra Pro for unlimited terminals.",
  });
  const wrapped = `Safe mode can't run in Orbit (${"plan-limit:worktrees: Safe mode worktrees are part of Vibyra Pro."}). Turn Safe mode off.`;
  assert.equal(planLimitFrom(wrapped)?.feature, "worktrees");
  assert.equal(planLimitFrom(wrapped)?.message, "Safe mode worktrees are part of Vibyra Pro.");
  assert.equal(planLimitFrom("settings error: Connect GitHub first"), null);
  assert.equal(planLimitFrom(null), null);
});

test("Free holds back worktrees, Agents and the cloud; Pro and older servers do not", () => {
  const free = account(FREE);
  assert.equal(allows(free, "safeWorktrees"), false);
  assert.equal(allows(free, "agents"), false);
  assert.equal(allows(free, "remoteAccess"), false);
  const pro = account({ ...FREE, plan: "pro_v2", maxTerminals: null, safeWorktrees: true, agents: true, remoteAccess: true });
  assert.equal(allows(pro, "agents"), true);
  // Limits not yet switched on, or a server that sends none, keep everything open.
  assert.equal(allows(account({ ...FREE, enforced: false }), "safeWorktrees"), true);
  assert.equal(allows(account(undefined), "agents"), true);
  assert.deepEqual(limitsOf(null), OPEN_LIMITS);
});

test("Free keeps one project usable and locks the rest; Preview and Review are Pro", () => {
  const free = account(FREE);
  assert.equal(projectLocked(free, 0), false);
  assert.equal(projectLocked(free, 1), true);
  assert.equal(canAddProject(free, 0), true);
  assert.equal(canAddProject(free, 1), false);
  assert.equal(allows(free, "preview"), false);
  assert.equal(allows(free, "review"), false);
  const pro = account({ ...FREE, plan: "pro_v2", maxProjects: null, preview: true, review: true });
  assert.equal(projectLocked(pro, 40), false);
  assert.equal(allows(pro, "preview"), true);
  assert.equal(planLimitFrom("plan-limit:projects: Free includes 1 project.")?.feature, "projects");
  assert.equal(planLimitFrom("plan-limit:review: Review is part of Vibyra Pro.")?.feature, "review");
});

test("a trial counts down in whole days and ends today rather than going negative", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const trial = (paidUntil) => account({ ...FREE, trial: true, paidUntil, maxTerminals: null });
  assert.equal(trialDaysLeft(trial("2026-10-12T12:00:00Z"), now), 14);
  assert.equal(trialDaysLeft(trial("2026-09-29T09:00:00Z"), now), 1);
  assert.equal(trialDaysLeft(trial("2026-09-27T12:00:00Z"), now), 0);
  assert.equal(trialDaysLeft(account(FREE), now), null);
});

test("the membership summary names a trial and offers nothing to manage", () => {
  const view = membershipView(account({ ...FREE, trial: true, plan: "pro_v2", paidUntil: "2026-10-12T00:00:00Z" },
    { plan: "pro_v2", billingProvider: "trial", membershipEndsAt: "2026-10-12T00:00:00Z" }));
  assert.equal(view.plan, "Pro trial");
  assert.equal(view.paid, true);
  assert.equal(view.state, "Ends on 12 October 2026");
  assert.equal(view.manage, null);
  assert.equal(view.billing, null);
});


test("cached trials and subscriptions expire for new admissions without changing saved state", () => {
  const boundary = Date.parse("2026-10-02T12:00:00Z");
  for (const trial of [true, false]) {
    const limits = { ...OPEN_LIMITS, enforced: true, plan: "pro_v2", trial,
      paidUntil: "2026-10-02T12:00:00Z" };
    const profile = account(limits);
    assert.equal(limitsOf(profile, boundary - 1), limits);
    assert.deepEqual(limitsOf(profile, boundary), FREE_LIMITS);
    assert.equal(profile.planLimits, limits);
    assert.equal(profile.planLimits.preview, true);
  }
});

test("malformed dated access fails to Free; undated and unenforced grants are preserved", () => {
  const invalid = { ...OPEN_LIMITS, enforced: true, paidUntil: "invalid" };
  assert.deepEqual(limitsOf(account(invalid), 0), FREE_LIMITS);
  const undated = { ...OPEN_LIMITS, enforced: true };
  assert.equal(limitsOf(account(undated), Number.MAX_SAFE_INTEGER), undated);
  const legacy = { ...invalid, enforced: false };
  assert.equal(limitsOf(account(legacy), 0), legacy);
});
