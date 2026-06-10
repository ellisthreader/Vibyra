import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./app.modals.js", import.meta.url), "utf8");
const pairing = readFileSync(new URL("./app.pairing.js", import.meta.url), "utf8");
const pairingStyles = readFileSync(new URL("./app.pairing.css", import.meta.url), "utf8");
const pairingPermissionStyles = readFileSync(new URL("./app.pairing-permission.css", import.meta.url), "utf8");
const pairingSuccessStyles = readFileSync(new URL("./app.pairing-success.css", import.meta.url), "utf8");
const desktopRoutes = readFileSync(new URL("../lib/desktopRoutes.mjs", import.meta.url), "utf8");

test("paid accounts do not render Manage billing in the account dropdown", () => {
  assert.match(source, /const upgradeSection = tier\.key === "free"/);
  assert.doesNotMatch(source, /const upgradeLabel = .*Manage billing/);
  assert.doesNotMatch(source, /else manageDesktopBilling\(\)/);
});

test("free accounts retain the Upgrade plan shortcut", () => {
  assert.match(source, /data-account-action="upgrade"/);
  assert.match(source, />Upgrade plan</);
});

test("closing settings collapses membership management", () => {
  assert.match(source, /profileBillingManageOpen = false/);
  assert.match(source, /profileBillingCancelOpen = false/);
});

test("pairing modal renders separate waiting, approval, phone confirmation, and connected states", () => {
  assert.match(source, /pairingWaitingView/);
  assert.match(source, /pairingApprovalView/);
  assert.match(source, /pairStatus === "approved"/);
  assert.match(source, /pairingPhonePermissionView/);
  assert.match(source, /pairingConnectedView/);
  assert.match(pairing, /desktop\/pair-qr\.svg/);
  assert.match(pairing, /Pairing stays on this Wi-Fi/);
  assert.match(pairing, /Waiting for your phone/);
  assert.match(pairing, /Confirm the permission request in Vibyra/);
  assert.doesNotMatch(pairing, /token|account identity/i);
});

test("pairing UI stays compact, responsive, and reduced-motion aware", () => {
  assert.match(pairingStyles, /\.pair-modal-panel/);
  assert.match(pairingStyles, /max-width: 590px/);
  assert.match(pairingStyles, /prefers-reduced-motion/);
  assert.match(pairingStyles, /max-width: 460px/);
  assert.match(pairingPermissionStyles, /pair-flow--phone-permission/);
  assert.match(pairingPermissionStyles, /prefers-reduced-motion/);
});

test("production pairing does not expose the temporary test connection path", () => {
  assert.doesNotMatch(pairing, /test-pair-connected|Test connected state/);
  assert.doesNotMatch(source, /desktop\/pair-test-connect/);
  assert.doesNotMatch(pairingStyles, /pair-test-button/);
  assert.doesNotMatch(desktopRoutes, /desktop\/pair-test-connect|Test phone/);
});

test("connected pairing celebrates once and respects reduced motion", () => {
  assert.match(pairing, /role="status" aria-live="polite"/);
  assert.match(pairing, /pair-success-burst/);
  assert.match(pairing, /pair-success-ring/);
  assert.match(pairingSuccessStyles, /@keyframes pair-success-check/);
  assert.match(pairingSuccessStyles, /@keyframes pair-success-particle/);
  assert.match(pairingSuccessStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(pairingSuccessStyles, /infinite/);
});
