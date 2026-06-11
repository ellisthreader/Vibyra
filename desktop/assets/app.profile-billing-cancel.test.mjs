import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./app.profile-billing-cancel.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");

test("cancellation submits structured feedback through the local account bridge", () => {
  assert.match(source, /\/desktop\/account-api\/billing\/cancel/);
  assert.match(source, /JSON\.stringify\(\{ reason, details, confirmed: true \}\)/);
  assert.doesNotMatch(source, /appApiBaseUrl|desktopAccountHeaders|Authorization|Bearer|\/api\/billing/);
});

test("manual scheduling preserves the desktop account while provider flows open externally", () => {
  assert.match(source, /storeDesktopAuthSession\(token, result\.user\)/);
  assert.match(source, /currentState = \{ \.\.\.currentState, desktopAccount: result\.user \}/);
  assert.match(source, /Cancellation scheduled/);
  assert.doesNotMatch(source, /account is now on Free|end immediately/);
  assert.match(source, /window\.open\(result\.url, "_blank", "noopener"\)/);
});

test("profile actions expose show, hide, and submit cancellation controls", () => {
  assert.match(actions, /change-membership/);
  assert.match(actions, /show-membership-management/);
  assert.match(actions, /hide-membership-management/);
  assert.match(actions, /show-billing-cancel/);
  assert.match(actions, /hide-billing-cancel/);
  assert.match(actions, /submit-billing-cancel/);
});
