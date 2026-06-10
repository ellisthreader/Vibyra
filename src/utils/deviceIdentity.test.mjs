import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identity = readFileSync(new URL("./deviceIdentity.ts", import.meta.url), "utf8");
const pairing = readFileSync(new URL("../context/pairingDiscovery.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../context/useAuthContextActions.ts", import.meta.url), "utf8");
const validation = readFileSync(new URL("../context/useSessionValidation.ts", import.meta.url), "utf8");

test("native device identity is shared by auth, pairing, and session refresh", () => {
  assert.match(identity, /Constants\.deviceName/);
  assert.match(identity, /Android phone/);
  assert.match(identity, /iPhone/);
  assert.match(auth, /deviceName: appDeviceName\(\)/);
  assert.match(pairing, /deviceName: appDeviceName\(\)/);
  assert.match(validation, /\/api\/account\/session\/device/);
  assert.match(validation, /deviceName: appDeviceName\(\)/);
});

test("pairing no longer sends a generic phone label", () => {
  assert.doesNotMatch(pairing, /deviceName: "Vibyra Phone"/);
});
