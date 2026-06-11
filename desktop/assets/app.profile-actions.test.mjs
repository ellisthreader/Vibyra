import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("./app.settings-actions.js", import.meta.url), "utf8");

test("profile and account operations use the local account bridge", () => {
  assert.match(source, /fetch\("\/desktop\/account-api\/profile"/);
  assert.match(source, /fetch\("\/desktop\/account-api\/account"/);
  assert.match(settings, /\/desktop\/account-api\/provider-delete\/\$\{provider\}\/start/);
  assert.match(settings, /\/desktop\/account-api\/provider-delete\/\$\{provider\}\/status/);
});

test("renderer account requests do not expose cloud URLs or bearer headers", () => {
  assert.doesNotMatch(source, /appApiBaseUrl|desktopAccountHeaders|Authorization|Bearer/);
  assert.doesNotMatch(source, /\/api\/account|\/api\/billing|\/api\/referrals/);
  assert.doesNotMatch(settings, /Authorization|Bearer|appApiBaseUrl|desktopAccountHeaders/);
});
