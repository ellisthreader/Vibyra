import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
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
  assert.match(await read("src-tauri/src/phone/preferences.rs"), /json!\(\{ "enabled": enabled, "typing": typing, "remote": remote \}\)/,
    "three switches and no address are persisted, so nothing goes stale");
  const watch = await read("src-tauri/src/phone/watch.rs");
  assert.match(watch, /refresh\(manager\.clone\(\)\)/, "the watcher rebinds after a network change");
  const state = await read("src-tauri/src/state.rs");
  assert.match(state, /crate::phone::watch\(phone\.clone\(\), manager\.clone\(\)\)/, "and it is started");
});

test("the phone is served this Mac's own projects, not one invented folder", async () => {
  // The builder is pure but reuses two rules from elsewhere; Vite resolves those
  // specifiers and Node does not, so the extension is supplied here rather than
  // copying the rules and letting them drift.
  const hooks = registerHooks({
    resolve: (specifier, context, next) => next(
      context.parentURL?.endsWith("/phoneWorkspace.ts") && specifier.startsWith("./")
        ? `${specifier}.ts` : specifier, context),
  });
  const { phoneWorkspacePayload, shortenRoot, shownChats } = await import("../src/lib/phoneWorkspace.ts");
  hooks.deregister();
  const projects = [
    { id: "p-1", name: "Vibyra", root: "/Users/ellis/Desktop/Vibyra", color: "#5b7cfa", lastOpenedMs: 1 },
    { id: "p-2", name: "Notes", root: "/opt/notes", color: "#ff9b6a", lastOpenedMs: 2 },
  ];
  const pane = (id, projectId, extra = {}) =>
    ({ id, projectId, title: "zsh", customTitle: null, status: "running", ...extra });
  const payload = phoneWorkspacePayload(projects, [
    pane(1, "p-1", { customTitle: "Landing page" }),
    pane(2, "p-2"),
    pane(3, "p-1", { status: "suspended" }),
    pane(-1, "p-1", { customTitle: "Restored last launch" }),
  ], "/Users/ellis");

  assert.deepEqual(payload.projects, [
    { id: "p-1", name: "Vibyra", path: "~/Desktop/Vibyra" },
    { id: "p-2", name: "Notes", path: "/opt/notes" },
  ], "the phone lists the same folders under the same names");
  assert.deepEqual(payload.panes, [
    { id: 1, projectId: "p-1", title: "Landing page" },
    { id: 2, projectId: "p-2", title: "zsh" },
  ], "each live terminal carries the project and the name the desktop shows");
  // A restored pane's placeholder id is not a session id; publishing one would
  // be rejected outright, taking the real terminals in the same call with it.
  assert.equal(payload.panes.some((pane) => pane.id < 0), false);
  // A folder that merely starts with the same letters is a different folder.
  assert.equal(shortenRoot("/Users/ellison/work", "/Users/ellis"), "/Users/ellison/work");
  // Until the chat list has been read this run, the window cannot say which
  // chats it shows, and says nothing rather than "none" — which would empty
  // the phone's list of every chat until a project's terminals were opened.
  assert.equal(payload.chats, null);
  assert.equal(shownChats({ loaded: false, sessions: [{ id: "c-1" }], open: ["c-1"] }), null);
  // Once read, only the chats whose cards are up are terminals to the phone;
  // the engine keeps every conversation ever had, and those are history — as
  // is one saved by a past run, whose card this window never put up.
  assert.deepEqual(shownChats({ loaded: true, sessions: [{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }], open: ["c-1", "c-3"] }), ["c-1", "c-3"]);
  assert.deepEqual(shownChats({ loaded: true, sessions: [{ id: "c-1" }], open: [] }), []);
  assert.deepEqual(shownChats({ loaded: true, sessions: [], open: [] }), []);
});

test("the desktop republishes its workspace whenever the window changes it", async () => {
  const publisher = await read("src/lib/phoneWorkspaceSync.ts");
  for (const store of ["useTerminalStore.subscribe", "useSettingsStore.subscribe", "useConversationTerminals.subscribe"]) {
    assert.match(publisher, new RegExp(store.replace(".", "\\.")), `${store} keeps the phone current`);
  }
  const lifecycle = await read("src/lib/useSessionLifecycle.ts");
  assert.match(lifecycle, /startPhoneWorkspacePublishing\(\)/, "and the publisher is actually started");
  // The whole chain, because every link is in a different language and a broken
  // one fails silently: the phone simply keeps showing the folders it had.
  const ipc = await read("src/ipc/phone.ts");
  assert.match(ipc, /invoke\("phone_publish_workspace", \{ projects, panes, chats \}\)/);
  const command = await read("src-tauri/src/commands/phone.rs");
  assert.match(command, /pub fn phone_publish_workspace\(/);
  assert.match(command, /state\.phone\.lock\(\)\.publish\(projects, panes, chats\)/);
  const registry = await read("src-tauri/src/commands/registry.rs");
  assert.match(registry, /phone::phone_publish_workspace/, "the webview is allowed to call it");
  const backend = await read("src-tauri/src/phone/backend.rs") + await read("src-tauri/src/phone/backend/protocol.rs");
  assert.doesNotMatch(backend, /Mac desktop terminals/, "the invented single folder is gone");
  assert.match(backend, /folders\(unfiled\)/, "the served folders come from what the window published");
  const shared = await read("src-tauri/src/phone/shared_backend.rs");
  assert.match(shared, /workspace\.shows_chat\(id\)/, "and only the chats the window shows are served as terminals");
});

test("typing from the phone is its own switch, turned on only on this Mac", async () => {
  const pane = await read("src/components/settings/SettingsPhonePane.tsx");
  assert.match(pane, /label="Typing from your phone"/, "the pane offers a second switch");
  assert.match(pane, /setTyping\(next\)/);
  const ipc = await read("src/ipc/phone.ts");
  assert.match(ipc, /invoke\("phone_set_typing", \{ enabled \}\)/);
  const command = await read("src-tauri/src/commands/phone.rs");
  assert.match(command, /pub fn phone_set_typing\(state: State<'_, AppState>, enabled: bool\)/);
  const registry = await read("src-tauri/src/commands/registry.rs");
  assert.match(registry, /phone::phone_set_typing/, "the webview is allowed to call it");
  // The prompt promises what a phone can do the moment it is allowed, so with
  // typing on it must not still say the phone cannot type.
  const modal = await read("src/components/phone/PhoneApprovalModal.tsx");
  assert.match(modal, /status\?\.typing === true/);
  assert.match(modal, /It can view and interact with your shared work/);
  // Nothing a phone sends can switch it on: its side only ever reads it.
  for (const path of ["src-tauri/src/phone/backend.rs", "src-tauri/src/phone/control.rs"]) {
    assert.doesNotMatch(await read(path), /typing\.store\(/, `${path} never sets the switch`);
  }
});

test("remote access is its own switch under the connection, with the emergency cut beside it", async () => {
  const pane = await read("src/components/settings/SettingsPhonePane.tsx");
  assert.match(pane, /<RemoteAccessRow remote=\{status\?\.remote\}/, "the cloud switch lives under the connection switch");
  const row = await read("src/components/settings/RemoteAccessRow.tsx");
  assert.match(row, /label="Remote access"/);
  assert.match(row, /Disconnect all remote sessions/, "every cloud session can be ended in one click");
  assert.doesNotMatch(row, /<input\b/, "nothing is typed: the account decides who may connect");
  const ipc = await read("src/ipc/phone.ts");
  assert.match(ipc, /invoke\("phone_set_remote", \{ enabled \}\)/);
  assert.match(ipc, /invoke\("phone_remote_disconnect_all"\)/);
  const registry = await read("src-tauri/src/commands/registry.rs");
  for (const command of [/phone::phone_set_remote/, /phone::phone_remote_disconnect_all/]) assert.match(registry, command);
  const remote = await read("src-tauri/src/phone/remote.rs");
  assert.match(remote, /Endpoint::RemoteRegister/, "the Mac registers itself with the account before every relay connection");
  assert.match(remote, /starts_with\("wss:\/\/"\)/, "and only follows a secure relay address");
});
