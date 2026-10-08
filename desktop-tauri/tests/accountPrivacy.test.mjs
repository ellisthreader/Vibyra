import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nativeRegistry = () => readFileSync(new URL("../src-tauri/src/commands/registry/account_and_billing.rs", import.meta.url), "utf8");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the five data commands are registered once each, and the renderer wrapper calls only those", () => {
  const registry = nativeRegistry();
  const names = ["account_export_status", "account_export_request", "account_export_open", "account_retention", "account_retention_set"];
  for (const name of names) assert.equal(registry.split(`account_privacy::${name},`).length, 2, name);
  const wrapper = read("../src/ipc/accountPrivacy.ts");
  const invoked = [...wrapper.matchAll(/invoke\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(invoked.sort(), [...names].sort());
});

test("the signed download link never reaches the renderer", () => {
  const wrapper = read("../src/ipc/accountPrivacy.ts");
  const block = read("../src/components/settings/AccountDataBlock.tsx");
  assert.doesNotMatch(wrapper + block, /\blink\b\s*[:=]\s*string|\.link\b/);
  const native = read("../src-tauri/src/account_privacy.rs");
  assert.match(native, /"hasLink"/);
  assert.match(native, /starts_with\(&format!\("\{\}\/account-export\/", base_url\(\)\)\)/);
});

test("Privacy & data owns account data while Account retains activity", () => {
  const pane = read("../src/components/settings/SettingsAccountPane.tsx");
  assert.match(pane, /<AccountActivityBlock/);
  assert.doesNotMatch(pane, /<AccountDataBlock/);
  assert.match(read("../src/components/settings/SettingsPrivacyPane.tsx"), /<AccountDataBlock key=\{owner\}/);
  const block = read("../src/components/settings/AccountDataBlock.tsx");
  assert.ok(block.split("\n").length <= 200);
  assert.match(block, /Download my data/);
  assert.match(block, /Keep run history for/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,6}\b|style=\{\{[^}]*color/); // no new colours
  // A server that does not offer a row draws nothing for it.
  assert.match(block, /if \(!exp && !retention\)/);
});
