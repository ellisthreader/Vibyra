import test from "node:test";
import assert from "node:assert/strict";
import { numeric, planCount, seriesTotal, downloadCoverage, utc, recent, isGuest, licenseStatus } from "../resources/js/portal/owner/ownerData.js";
import { chartModel } from "../resources/js/portal/owner/chartGeometry.js";
import { formatCount, formatExactCount, formatMoney } from "../resources/js/portal/owner/format.js";
import { readLocation, locationFor } from "../resources/js/portal/owner/ownerNavigation.js";
import { reportForIdentity } from "../resources/js/portal/owner/reportIdentity.js";

test("unavailable numbers never become recorded zeroes", () => {
  for (const value of [null, undefined, "", false, true, NaN, Infinity, "missing"]) {
    assert.equal(numeric(value), null);
    assert.equal(formatCount(value), "—");
    assert.equal(formatMoney(value), "—");
  }
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount("12"), "12");
  assert.equal(formatExactCount(123456), "123,456");
  assert.equal(formatExactCount(null), "—");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(6240), "< $0.01");
});

test("current plan counts distinguish missing, zero and incomplete rows", () => {
  assert.equal(planCount(null, "pro"), null);
  assert.equal(planCount([], "pro"), null);
  assert.equal(planCount([{ plan: "free", count: 8 }], "pro"), 0);
  assert.equal(planCount([{ plan: "pro", count: null }], "pro"), null);
  assert.equal(planCount([{ plan: "pro", count: 2 }, { plan: "free", count: 8 }], "pro"), 2);
});

test("download coverage makes different populations and missing history visible", () => {
  assert.equal(seriesTotal([{ downloads: 0 }, { downloads: 2 }], "downloads"), 2);
  assert.equal(seriesTotal([{ downloads: 2 }, { downloads: null }], "downloads"), null);
  assert.match(downloadCoverage({ overview: { website: { downloads: 9 } }, series: { website: [{ downloads: 2 }] } }), /differ/);
  assert.match(downloadCoverage({ series: { website: [] } }), /unavailable/);
});

test("small charts use unique integer ticks and preserve an isolated point", () => {
  const model = chartModel([{ date: "2026-10-12", count: 1 }], ["count"]);
  assert.deepEqual(model.ticks, [0, 1]);
  assert.equal(model.series[0].points[0].x, 360);
  assert.equal(model.series[0].points[0].value, 1);
  assert.equal(model.hasValues, true);
  assert.equal(chartModel([{ count: 0 }], ["count"]).hasValues, true);
});

test("missing days leave gaps rather than drawing a line to zero", () => {
  const model = chartModel([{ count: 2 }, { count: null }, { count: 1 }], ["count"]);
  assert.equal(model.series[0].points[1], null);
  assert.equal((model.series[0].path.match(/M/g) || []).length, 2);
  assert.doesNotMatch(model.series[0].path, /L/);
  assert.equal(chartModel([{ count: null }], ["count"]).hasValues, false);
});

test("SQL and ISO dates consistently render in UTC", () => {
  assert.equal(utc("2026-10-12 09:34:00"), utc("2026-10-12T09:34:00Z"));
  assert.equal(utc("not a date"), "Not recorded");
  assert.equal(utc(null), "Not recorded");
  assert.equal(recent(null), "No activity received");
});

test("only the real guest email suffix classifies an account as guest", () => {
  assert.equal(isGuest({ email: "abc@guests.vibyra.invalid" }), true);
  assert.equal(isGuest({ name: "Guest", email: "guest@example.test" }), false);
  assert.equal(isGuest({ email: "a@guests.vibyra.invalid.example.test" }), false);
});

test("license statuses handle all states without guessing missing expiry", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.equal(licenseStatus({ revoked_at: "2026-10-01" }, now), "Revoked");
  assert.equal(licenseStatus({ redeemed_at: "2026-10-01", ends_at: "2027-01-01T12:00:00Z" }, now), "Active");
  assert.equal(licenseStatus({ redeemed_at: "2026-10-01", ends_at: "2026-10-10 12:00:00" }, now), "Expired");
  assert.equal(licenseStatus({ claim_by: "2027-01-01 12:00:00" }, now), "Ready to claim");
  assert.equal(licenseStatus({ claim_by: "2026-10-01 12:00:00" }, now), "Unclaimed · expired");
  assert.equal(licenseStatus({ redeemed_at: "2026-10-01" }, now), "Status unavailable");
});

test("navigation supports shareable sections and only API-supported periods", () => {
  assert.deepEqual(readLocation("?view=website&tab=journeys&days=7"), { view: "website", tab: "journeys", days: 7 });
  assert.deepEqual(readLocation("?view=invalid&tab=licenses&days=1"), { view: "overview", tab: undefined, days: 30 });
  const state = readLocation("?view=memberships&tab=licenses&days=90");
  assert.deepEqual(readLocation(locationFor(state).split("?")[1]), state);
  assert.equal(readLocation("?view=usage&tab=invalid").tab, "desktop");
});

test("private reports are never shared across account changes or logout", () => {
  const snapshot = { userId: 1, data: { private: true } };
  assert.equal(reportForIdentity(snapshot, 1), snapshot);
  assert.equal(reportForIdentity(snapshot, 2), null);
  assert.equal(reportForIdentity(snapshot, null), null);
});
