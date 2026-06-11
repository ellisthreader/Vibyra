import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./app.auth-billing.js", import.meta.url), "utf8");
const plans = readFileSync(new URL("./app.billing-plans.js", import.meta.url), "utf8");

test("browser billing opens a placeholder before awaiting the portal request", () => {
  const electronIndex = source.indexOf('typeof isElectronShell === "function"');
  const openIndex = source.indexOf('window.open("about:blank"');
  const fetchIndex = source.indexOf("await fetch");

  assert.ok(electronIndex >= 0);
  assert.ok(openIndex >= 0);
  assert.ok(fetchIndex > openIndex);
  assert.match(source, /electronShell \? null : window\.open\("about:blank"/);
  assert.match(source, /popup\.location\.replace\(result\.url\)/);
});

test("billing errors stay in the Billing surface", () => {
  assert.match(source, /setDesktopBillingStatus\(false, .*true\)/);
  assert.doesNotMatch(source, /showAuthError/);
});

test("paid membership changes use the explicit change endpoint", () => {
  assert.match(source, /changeDesktopMembership/);
  assert.match(source, /"\/desktop\/account-api\/billing\/change"/);
  assert.match(source, /storeDesktopAuthSession\(token, result\.user\)/);
  assert.match(plans, /paid && typeof changeDesktopMembership/);
  assert.match(plans, /changeDesktopMembership\(plan, planPickerCycle\)/);
});

test("all billing operations use the local bridge without renderer auth headers", () => {
  assert.match(source, /\/desktop\/account-api\/billing\/checkout/);
  assert.match(source, /\/desktop\/account-api\/billing\/change/);
  assert.match(source, /\/desktop\/account-api\/billing\/portal/);
  assert.doesNotMatch(source, /appApiBaseUrl|desktopAccountHeaders|Authorization|Bearer|\/api\/billing/);
});

test("external billing refreshes account state when the user returns", () => {
  assert.match(source, /refreshBillingAfterExternalReturn/);
  assert.match(source, /window\.addEventListener\("focus"/);
  assert.match(source, /refreshDesktopAccountSession/);
});
