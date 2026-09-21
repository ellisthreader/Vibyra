import { phonePublishWorkspace } from "../ipc/phone";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { phoneWorkspacePayload } from "./phoneWorkspace";

// Impure glue: watches the four stores that decide what the Projects page
// shows and republishes to Rust when any of them changes what a phone would
// see. The decision itself lives in `phoneWorkspace.ts`.

const DEBOUNCE_MS = 300;

function payload() {
  const chats = useConversationTerminals.getState();
  return phoneWorkspacePayload(
    useSettingsStore.getState().settings?.projects ?? [],
    useTerminalStore.getState().panes,
    useProjectStore.getState().homeDir,
    { loaded: chats.loaded, sessions: chats.sessions, open: chats.open },
  );
}

export function startPhoneWorkspacePublishing(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const publish = () => {
    const { projects, panes, chats } = payload();
    void phonePublishWorkspace(projects, panes, chats).catch(() => {});
  };
  // Identity of what a phone would draw — renames included, activity ticks and
  // focus excluded, so the store writes that happen constantly send nothing.
  let last = JSON.stringify(payload());
  publish();
  // The chat list is otherwise only read while a project's terminals are on
  // screen; a phone connecting while Home is up still needs the real list.
  void useConversationTerminals.getState().refresh();
  const onChange = () => {
    const next = JSON.stringify(payload());
    if (next === last) return;
    last = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(publish, DEBOUNCE_MS);
  };
  const stops = [
    useTerminalStore.subscribe(onChange),
    useSettingsStore.subscribe(onChange),
    useProjectStore.subscribe(onChange),
    useConversationTerminals.subscribe(onChange),
  ];
  return () => {
    if (timer) clearTimeout(timer);
    for (const stop of stops) stop();
  };
}
