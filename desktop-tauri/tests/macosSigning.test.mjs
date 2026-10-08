import test from "node:test";
import assert from "node:assert/strict";
import { requireReleaseIdentity, selectLocalIdentity, validateSignatureDetails, verifyMacSignature } from "../scripts/macos-signing.mjs";

const signed = `Authority=Developer ID Application: Vibyra (ABCDEFGHIJ)
TeamIdentifier=ABCDEFGHIJ
designated => identifier "app.vibyra.desktop" and anchor apple generic and certificate leaf[subject.OU] = "ABCDEFGHIJ"`;
const adhoc = 'Signature=adhoc\nTeamIdentifier=not set\n# designated => cdhash H"1234"';

test("release identity cannot silently fall back to ad-hoc or development signing", () => {
  for (const identity of [undefined, "", "-", "Apple Development: Example"]) {
    assert.throws(() => requireReleaseIdentity({ APPLE_SIGNING_IDENTITY: identity }), /Developer ID/);
  }
  requireReleaseIdentity({ APPLE_SIGNING_IDENTITY: "Developer ID Application: Vibyra (ABCDEFGHIJ)" });
});

test("actual signature needs stable Developer ID requirement and team", () => {
  validateSignatureDetails(signed);
  validateSignatureDetails(signed.replace("designated =>", "# designated =>"));
  for (const details of [adhoc, "", signed.replace("ABCDEFGHIJ\ndesignated", "not set\ndesignated"),
    signed.replace("anchor apple generic", 'cdhash H"1234"'),
    signed.replace("Developer ID Application:", "Apple Development:")]) {
    assert.throws(() => validateSignatureDetails(details), /stable Developer ID/);
  }
});

test("disposable ad-hoc installs need an explicit opt-in; invalid signatures still fail", () => {
  validateSignatureDetails(adhoc, true);
  assert.throws(() => validateSignatureDetails("", true), /stable Developer ID/);
});

test("native verifier rejects a missing bundle even with local opt-in", { skip: process.platform !== "darwin" }, () => {
  assert.throws(() => verifyMacSignature("/private/tmp/vibyra-nonexistent-signature-test.app", { allowAdHoc: true }));
});

test("local builds select one Developer ID identity and reject absent or ambiguous identities", () => {
  const first = 'Developer ID Application: Example (ABCDEFGHIJ)';
  assert.equal(selectLocalIdentity(`1) HASH "${first}"`), first);
  assert.throws(() => selectLocalIdentity('0 valid identities found'), /exactly one/);
  assert.throws(() => selectLocalIdentity(`1) HASH "${first}"\n2) HASH "Developer ID Application: Other (KLMNOPQRST)"`), /exactly one/);
});

const signedTestApp = process.env.VIBYRA_SIGNED_TEST_APP;
test("native codesign accepts the installed signature's inline requirement", {
  skip: process.platform !== "darwin" || !signedTestApp,
}, () => {
  verifyMacSignature(signedTestApp, { previous: signedTestApp });
});
