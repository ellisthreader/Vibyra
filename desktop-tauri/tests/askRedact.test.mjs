import assert from "node:assert/strict";
import test from "node:test";

import { redactSecrets, redactedTail } from "../src/lib/askRedact.ts";

// Assembled at runtime rather than written out. These are invented, but they
// are shaped exactly like the real thing, and a literal one in the file trips
// GitHub's push protection — which blocks the whole release. Joining the parts
// keeps the identical string reaching `redactSecrets` with nothing for a
// scanner to match on disk.
const shaped = (...parts) => parts.join("");

test("removes token shapes that can only ever be credentials", () => {
  const cases = [
    [shaped("sk-", "proj-", "abcdefghijklmnopqrstuvwxyz012345"), "an OpenAI key"],
    [shaped("ghp", "_", "abcdefghijklmnopqrstuvwxyz0123456789"), "a GitHub token"],
    [shaped("github", "_pat_", "11ABCDEFG0abcdefghijklmnop"), "a fine-grained GitHub token"],
    [shaped("AKIA", "IOSFODNN7", "EXAMPLE"), "an AWS access key id"],
    [shaped("xoxb", "-123456789012-", "abcdefghijklmno"), "a Slack token"],
    [shaped("AIza", "SyD-1234567890", "abcdefghijklmnopqrstuv"), "a Google API key"],
    [
      shaped("eyJhbGciOiJIUzI1NiJ9.", "eyJzdWIiOiIxMjM0NTY3ODkwIn0.", "dQw4w9WgXcQabcdefgh"),
      "a JWT",
    ],
  ];
  for (const [secret, what] of cases) {
    const { text, count } = redactSecrets(`token is ${secret} ok`);
    assert.equal(text.includes(secret), false, `leaked ${what}`);
    assert.match(text, /\[redacted\]/);
    assert.equal(count, 1, `miscounted ${what}`);
  }
});

test("removes secrets that only their label identifies", () => {
  const source = [
    "DATABASE_PASSWORD=hunter2correct",
    'STRIPE_SECRET_KEY="sk_live_plainlooking"',
    "Authorization: Basic dXNlcjpwYXNz",
    "curl -H 'bearer abcdefghijklmnop'",
    "--token abc123def456",
    "postgres://admin:s3cr3tpw@db.internal:5432/app",
  ].join("\n");
  const { text, count } = redactSecrets(source);

  assert.equal(text.includes("hunter2correct"), false);
  assert.equal(text.includes("sk_live_plainlooking"), false);
  assert.equal(text.includes("dXNlcjpwYXNz"), false);
  assert.equal(text.includes("abcdefghijklmnop"), false);
  assert.equal(text.includes("abc123def456"), false);
  assert.equal(text.includes("s3cr3tpw"), false);
  assert.equal(count, 6);

  // The label survives so the reader still knows what was there, and the URL
  // keeps everything that is not the password.
  assert.match(text, /DATABASE_PASSWORD=/);
  assert.match(text, /postgres:\/\/admin:\[redacted\]@db\.internal:5432\/app/);
});

test("takes out a whole private key block, not just its header", () => {
  const key = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEowIBAAKCAQEAxGZi9Q9k1PbW",
    "cnRhaW5seSBub3QgYSByZWFsIGtleQ==",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");
  const { text, count } = redactSecrets(`before\n${key}\nafter`);
  assert.equal(text.includes("MIIEowIBAAKCAQEAxGZi9Q9k1PbW"), false);
  assert.equal(text.includes("BEGIN RSA PRIVATE KEY"), false);
  assert.match(text, /before/);
  assert.match(text, /after/);
  assert.equal(count, 1);
});

test("leaves ordinary output alone", () => {
  // Over-redaction is its own failure: an assistant that cannot see what
  // happened is worse than one that sees a little less. Commit SHAs, hashes
  // and paths are exactly what makes a scrollback worth reading.
  const source = [
    "  115bfd661656cc5032cdf1863323c946f4577f91  Vibyra safe-mode snapshot",
    "  ✓ 440 tests passed in 1.46s",
    "  ERROR in src/auth/session.ts:42 — Type 'string' is not assignable",
    "  https://github.com/example/repo/pull/12",
  ].join("\n");
  const { text, count } = redactSecrets(source);
  assert.equal(text, source);
  assert.equal(count, 0);
});

test("a tail is cut before it is scanned, and starts on a whole line", () => {
  const noise = "x".repeat(400);
  const source = `${noise}\nSECRET_TOKEN=abcdefghijklmno\nlast line`;
  const { text, count } = redactedTail(source, 60);
  assert.ok(text.length <= 60);
  assert.equal(text.includes("abcdefghijklmno"), false);
  assert.equal(count, 1);
  assert.equal(text.startsWith("x"), false, "should not open mid-line");
});

test("nothing to scan is not an error", () => {
  assert.deepEqual(redactedTail(null, 100), { text: "", count: 0 });
  assert.deepEqual(redactedTail(undefined, 100), { text: "", count: 0 });
  assert.deepEqual(redactedTail("", 100), { text: "", count: 0 });
  assert.deepEqual(redactSecrets(""), { text: "", count: 0 });
});

test("a tail short enough to keep whole is kept whole", () => {
  const { text } = redactedTail("one\ntwo", 500);
  assert.equal(text, "one\ntwo");
});
