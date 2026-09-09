import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The iPhone connection is a switch. Everything here is a cross-file contract
// that only shows up in the running app: a stray address field, a command that
// still wants one, or an approval prompt that never gets mounted would each
// bring back the setup the user had to do by hand.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("the phone pane asks for nothing but the switch", async () => {
  const pane = await read("src/components/settings/SettingsPhonePane.tsx");
  assert.match(pane, /<Switch\b/, "the pane turns the connection on with the house switch");
  assert.doesNotMatch(pane, /<input\b/, "no address is typed in");
  assert.doesNotMatch(pane, /phone_detect_address|Use current network/, "no address is hunted for");
});

test("configuring the connection carries only the switch", async () => {
  const ipc = await read("src/ipc/phone.ts");
  assert.match(ipc, /invoke\("phone_configure", \{ enabled \}\)/);
  const command = await read("src-tauri/src/commands/phone.rs");
  assert.match(command, /pub async fn phone_configure\(state: State<'_, AppState>, enabled: bool\)/);
  assert.doesNotMatch(command, /phone_detect_address/, "the address probe command is gone");
  const registry = await read("src-tauri/src/commands/registry.rs");
  assert.doesNotMatch(registry, /phone_detect_address/, "and is not still registered");
});

test("a pairing request reaches the workspace, not just Settings", async () => {
  const workspace = await read("src/components/layout/WorkspaceApp.tsx");
  assert.match(workspace, /<PhoneApprovalModal \/>/, "the prompt is mounted outside Settings");
  assert.match(workspace, /usePhoneWatch\(\);/, "and something is polling for requests");
  const modal = await read("src/components/phone/PhoneApprovalModal.tsx");
  for (const answer of [/answer\(request\.id, false\)/, /answer\(request\.id, true\)/]) {
    assert.match(modal, answer, "both answers are one click away");
  }
});

test("the listener follows this Mac's network on its own", async () => {
  const phone = await read("src-tauri/src/phone/mod.rs");
  assert.match(phone, /pub fn refresh\(&mut self, manager: Arc<PtyManager>\)/);
  assert.match(phone, /json!\(\{ "enabled": enabled \}\)/, "no address is persisted to go stale");
  const watch = await read("src-tauri/src/phone/watch.rs");
  assert.match(watch, /refresh\(manager\.clone\(\)\)/, "the watcher rebinds after a network change");
  const state = await read("src-tauri/src/state.rs");
  assert.match(state, /crate::phone::watch\(phone\.clone\(\), manager\.clone\(\)\)/, "and it is started");
});
