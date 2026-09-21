import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("GitHub connect opens the provider's page and watches the flow until it lands", () => {
  const hook = source("../src/components/settings/useConnectors.ts");
  assert.match(hook, /connectors\/\$\{id\}\/start/, "the backend starts the OAuth flow");
  assert.match(hook, /invoke\("shared_chat_open_link", \{ url: data\.url \}\)/, "the returned URL is opened, not just stored");
  assert.match(hook, /connectors\/flows\/\$\{current\.id\}/, "the flow is polled");
  assert.match(hook, /connectors\/\$\{id\}\/disconnect/, "and can be disconnected");
  const permitted = source("../src-tauri/src/commands/teammates.rs");
  assert.match(permitted, /\["connectors", slug, "start" \| "disconnect"\]/, "the native bridge allows exactly those calls");
  const link = source("../src-tauri/src/commands/shared_chats.rs");
  assert.match(link, /parsed\.scheme\(\) != "https"/, "only HTTPS pages can be opened");
});

test("Obsidian asks which vault only after Connect, and the vault is a native command", () => {
  const block = source("../src/components/settings/IntegrationsBlock.tsx");
  assert.match(block, /onClick=\{begin\}>Connect</, "the first action is Connect");
  assert.match(block, /choosing \? \(/, "the vault list is shown while choosing");
  assert.doesNotMatch(block, /suggestions\.length > 0 && \(\s*<select/, "never a picker before Connect");
  const ipc = source("../src/ipc/memory.ts");
  assert.match(ipc, /invoke\("connect_obsidian_vault", \{ project: projectArg\(key\), candidateId \}\)/);
  const command = source("../src-tauri/src/commands/memory.rs");
  assert.match(command, /pub async fn connect_obsidian_vault/);
  assert.match(command, /blocking_pick_folder\(\)/, "no candidate means the native folder picker");
});

test("a phone can be disconnected without being forgotten", () => {
  const pane = source("../src/components/settings/SettingsPhonePane.tsx");
  assert.match(pane, /void disconnectDevice\(id\)/);
  assert.match(pane, /else void revoke\(id\)/, "remove is the only path that forgets a phone");
  const ipc = source("../src/ipc/phone.ts");
  assert.match(ipc, /invoke\("phone_disconnect_device", \{ id \}\)/);
  const registry = source("../src-tauri/src/commands/registry.rs");
  assert.match(registry, /phone::phone_disconnect_device/);
  const host = source("../../host/crates/server/src/state.rs");
  assert.match(host, /pub fn disconnect\(&self, id: &str\)/);
  assert.match(host, /slot\.notify_one\(\)/, "the connection is told to stand down; trust is untouched");
});
