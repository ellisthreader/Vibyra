import assert from "node:assert/strict";
import test from "node:test";

import { membershipView, pounds, sameDay } from "../src/lib/membership.ts";

const base = {
  name: "Ada", email: "ada@vibyra.app", provider: "email", plan: "free",
  emailVerified: true, welcomeKey: "vw_test", twoFactorEnabled: false,
  createdAt: null, planBillingCycle: "monthly", planRenewsAt: null,
  creditsResetAt: null, membershipEndsAt: null, membershipCancelAtPeriodEnd: false,
  billingProvider: null, canManageStripeBilling: false, hasAvatar: false,
};
const profile = (changes) => ({ ...base, ...changes });

test("a free account is offered nothing to manage", () => {
  const view = membershipView(profile({}));
  assert.equal(view.plan, "Free");
  assert.equal(view.paid, false);
  assert.equal(view.state, null);
  assert.equal(view.manage, null);
});

test("no profile at all reads as free rather than as a broken plan", () => {
  assert.deepEqual(membershipView(null), {
    plan: "Free", paid: false, state: null, billing: null, cycle: null, manage: null,
    stateDate: null,
  });
});

test("a card subscription says when it renews and offers the portal", () => {
  const view = membershipView(profile({
    plan: "builder", billingProvider: "stripe", canManageStripeBilling: true,
    planRenewsAt: "2026-10-12T00:00:00.000Z",
  }));
  assert.equal(view.plan, "Pro 10×");
  assert.equal(view.state, "Renews on 12 October 2026");
  assert.equal(view.billing, "Card, through Stripe");
  assert.equal(view.cycle, "Monthly");
  assert.equal(view.manage, "stripe");
});

test("an annual card subscription says which cycle it is on", () => {
  const view = membershipView(profile({
    plan: "pro", billingProvider: "stripe", canManageStripeBilling: true,
    planBillingCycle: "annual", planRenewsAt: "2027-02-01T00:00:00.000Z",
  }));
  assert.equal(view.cycle, "Yearly");
  assert.equal(view.state, "Renews on 1 February 2027");
});

test("a cancellation ends on its paid-through date, and never claims a renewal", () => {
  const view = membershipView(profile({
    plan: "builder", billingProvider: "stripe", canManageStripeBilling: true,
    membershipCancelAtPeriodEnd: true, membershipEndsAt: "2026-10-03T00:00:00.000Z",
    planRenewsAt: "2026-10-03T00:00:00.000Z",
  }));
  assert.equal(view.state, "Ends on 3 October 2026");
});

test("a cancellation with only a renewal date still says when access ends", () => {
  const view = membershipView(profile({
    plan: "builder", billingProvider: "stripe", membershipCancelAtPeriodEnd: true,
    planRenewsAt: "2026-10-03T00:00:00.000Z",
  }));
  assert.equal(view.state, "Ends on 3 October 2026");
});

test("a store membership is paid through a date, not renewed on one", () => {
  const view = membershipView(profile({
    plan: "pro", billingProvider: "iap-apple",
    membershipEndsAt: "2026-09-30T00:00:00.000Z", planRenewsAt: "2026-09-30T00:00:00.000Z",
  }));
  assert.equal(view.state, "Paid through 30 September 2026");
  assert.equal(view.billing, "App Store");
  assert.equal(view.manage, "appstore", "Apple owns cancelling what Apple sold");
});

test("a card account with no Stripe customer is not offered a portal it has no session for", () => {
  const view = membershipView(profile({
    plan: "starter", billingProvider: "stripe", canManageStripeBilling: false,
    planRenewsAt: "2026-10-12T00:00:00.000Z",
  }));
  assert.equal(view.manage, null);
});

test("an unparseable date is left unsaid rather than printed as Invalid Date", () => {
  const view = membershipView(profile({
    plan: "builder", billingProvider: "stripe", planRenewsAt: "soon",
  }));
  assert.equal(view.state, null);
});

test("the date a card states is handed back, so nothing below repeats it", () => {
  const view = membershipView(profile({
    plan: "pro", billingProvider: "iap-apple", membershipEndsAt: "2026-10-13T00:00:00.000Z",
  }));
  assert.equal(view.stateDate, "2026-10-13T00:00:00.000Z");
  assert.equal(sameDay(view.stateDate, "2026-10-13T22:30:00.000Z"), true, "same day, different hour");
  assert.equal(sameDay(view.stateDate, "2026-10-14T00:00:00.000Z"), false);
  assert.equal(sameDay(null, "2026-10-13T00:00:00.000Z"), false);
  assert.equal(sameDay(view.stateDate, "not a date"), false);
});

test("prices read as pounds", () => {
  assert.equal(pounds(2000), "£20.00");
  assert.equal(pounds(15200), "£152.00");
});
