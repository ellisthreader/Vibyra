import assert from "node:assert/strict";
import test from "node:test";
import { providerActivitySignal } from "./aiTerminalActivity.mjs";

test("Codex completion ignores spinner titles and accepts its restored idle title", () => {
  assert.equal(providerActivitySignal("codex", "\x1b]0;⠋ SaaS\x07"), "busy");
  assert.equal(providerActivitySignal("codex", "\x1b]0;SaaS\x07"), "ready");
  assert.equal(providerActivitySignal("codex", "\x1b]0;SaaS\x07\x1b]0;⠋ SaaS\x07"), "busy");
});

test("Codex completion recognizes its idle composer placeholders", () => {
  assert.equal(providerActivitySignal("codex", "\x1b[2mWrite tests for @filename\x1b[0m"), "ready");
});

test("Vibyra completion recognizes the restored readline prompt", () => {
  assert.equal(providerActivitySignal("vibyra", "\x1b[1G\x1b[0J❯ auto \x1b[8G"), "ready");
});

test("Vibyra completion recognizes every provider-native composer prompt", () => {
  assert.equal(providerActivitySignal("vibyra", "\x1b[1G\x1b[0J› \x1b[3G"), "ready");
  assert.equal(providerActivitySignal("vibyra", "\x1b[1G\x1b[0J❯ \x1b[3G"), "ready");
  assert.equal(providerActivitySignal("vibyra", "\x1b[1G\x1b[0J│ > \x1b[5G"), "ready");
  assert.equal(providerActivitySignal("vibyra", "\x1b[1G\x1b[0Jdeepseek › \x1b[12G"), "ready");
});

test("Vibyra activity remains compatible with recovered legacy Codex-backed sessions", () => {
  assert.equal(providerActivitySignal("vibyra", "\x1b]0;⠋ Working\x07"), "busy");
  assert.equal(providerActivitySignal("vibyra", "\x1b]0;Codex\x07"), "ready");
});

test("native Claude composer clears terminal startup state", () => {
  const output = "\x1b[2JClaude Code v2.1.169\r\n❯\u00a0Try \"fix linter errors\"\r\n? for shortcuts";
  assert.equal(providerActivitySignal("claude", output), "ready");
});

test("native Gemini trust and composer screens clear terminal startup state", () => {
  assert.equal(
    providerActivitySignal("gemini", "Do you trust the files in this folder?\r\n● 1. Trust folder (SaaS)"),
    "ready"
  );
  assert.equal(
    providerActivitySignal("gemini", "\r\n> Type your message or @path/to/file"),
    "ready"
  );
});
