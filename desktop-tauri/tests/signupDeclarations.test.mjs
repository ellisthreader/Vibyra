import assert from "node:assert/strict";
import test from "node:test";

import { signupDeclarations, TERMS_VERSION } from "../src/lib/signupDeclarations.ts";

test("new account declarations require separate Terms, age and UK confirmations", () => {
  const checked = { termsAccepted: true, adultConfirmed: true, ukResidentConfirmed: true };
  assert.deepEqual(signupDeclarations(checked), {
    termsVersion: "2026-09-28", termsAccepted: true, adultConfirmed: true, countryCode: "GB",
  });
  assert.equal(TERMS_VERSION, "2026-09-28");
  for (const field of Object.keys(checked)) {
    assert.equal(signupDeclarations({ ...checked, [field]: false }), null);
  }
});
