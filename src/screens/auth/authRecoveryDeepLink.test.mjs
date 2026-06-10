import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadParser() {
  const source = await readFile(new URL("./authRecoveryDeepLink.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports.parseAuthRecoveryDeepLink;
}

test("accepts the exact Vibyra password reset link", async () => {
  const parse = await loadParser();
  for (const value of [
    "vibyra://reset-password?email=user%40example.com&token=abc123",
    "https://links.vibyra.app/reset-password?email=user%40example.com&token=abc123"
  ]) {
    assert.deepEqual(parse(value), { email: "user@example.com", token: "abc123" });
  }
});

test("rejects lookalike hosts, paths, insecure URLs, ports, and fragments", async () => {
  const parse = await loadParser();
  for (const value of [
    "vibyra://reset-password.evil?email=a%40b.com&token=x",
    "vibyra://reset-password/extra?email=a%40b.com&token=x",
    "http://links.vibyra.app/reset-password?email=a%40b.com&token=x",
    "https://links.vibyra.app.evil/reset-password?email=a%40b.com&token=x",
    "https://links.vibyra.app/other?email=a%40b.com&token=x",
    "https://links.vibyra.app:444/reset-password?email=a%40b.com&token=x",
    "https://user@links.vibyra.app/reset-password?email=a%40b.com&token=x",
    "vibyra://reset-password?email=a%40b.com&token=x#fragment",
    "https://links.vibyra.app/reset-password?email=a%40b.com&token=x#fragment"
  ]) {
    assert.equal(parse(value), null, value);
  }
});

test("rejects duplicate, missing, extra, and oversized values", async () => {
  const parse = await loadParser();
  for (const value of [
    "vibyra://reset-password?email=a%40b.com&email=c%40d.com&token=x",
    "vibyra://reset-password?email=a%40b.com&token=x&token=y",
    "vibyra://reset-password?email=a%40b.com",
    "vibyra://reset-password?token=x",
    "vibyra://reset-password?email=a%40b.com&token=x&next=https%3A%2F%2Fevil.test",
    `vibyra://reset-password?email=${"a".repeat(321)}&token=x`,
    `vibyra://reset-password?email=a%40b.com&token=${"x".repeat(513)}`
  ]) {
    assert.equal(parse(value), null);
  }
});

test("uses the configured owned HTTPS recovery URL exactly", async () => {
  const previous = process.env.EXPO_PUBLIC_RECOVERY_LINK_URL;
  process.env.EXPO_PUBLIC_RECOVERY_LINK_URL = "https://account.example.test/reset-password";
  try {
    const parse = await loadParser();
    assert.deepEqual(
      parse("https://account.example.test/reset-password?email=a%40b.com&token=x"),
      { email: "a@b.com", token: "x" }
    );
    assert.equal(
      parse("https://links.vibyra.app/reset-password?email=a%40b.com&token=x"),
      null
    );
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_RECOVERY_LINK_URL;
    else process.env.EXPO_PUBLIC_RECOVERY_LINK_URL = previous;
  }
});
