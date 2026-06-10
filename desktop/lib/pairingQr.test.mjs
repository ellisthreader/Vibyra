import assert from "node:assert/strict";
import test from "node:test";
import { pairingDeepLink } from "./pairingQr.mjs";

test("pairing QR carries only the code and reachable desktop URL", () => {
  const link = pairingDeepLink("ABCD23", ["http://192.168.1.20:4317"]);
  const parsed = new URL(link);
  assert.equal(parsed.protocol, "vibyra:");
  assert.equal(parsed.hostname, "pair");
  assert.equal(parsed.searchParams.get("code"), "ABCD23");
  assert.equal(parsed.searchParams.get("url"), "http://192.168.1.20:4317");
  assert.doesNotMatch(link, /token|account|email/i);
});

test("pairing QR is unavailable without a phone-reachable URL", () => {
  assert.equal(pairingDeepLink("ABCD23", []), "");
  assert.equal(pairingDeepLink("bad code", ["http://192.168.1.20:4317"]), "");
});
