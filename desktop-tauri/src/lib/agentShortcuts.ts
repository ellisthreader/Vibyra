import type { AppMode } from "../agentTypes";
import { useAgentChatStore } from "../state/agentChatStore";
import { useAgentModeStore } from "../state/agentModeStore";

// Agent and Chat Mode's keyboard.
//
// Every binding here is refused while Code Mode has the window. A terminal
// must keep every key it is sent — a shortcut that quietly eats Ctrl-N from a
// running CLI is worse than no shortcut at all — so the mode check comes
// first and there is no exception to it.
//
// Kept out of `useGlobalShortcuts` because that file is at the line limit and
// because these are the only bindings in the app that are scoped to a mode.

const MODES: AppMode[] = ["agent", "code", "chat"];

/** The chats of whichever surface is showing, in the order the rail lists them. */
function visibleChats(): { id: string }[] {
  const { mode, agentId } = useAgentModeStore.getState();
  const key = mode === "chat" ? "detached" : agentId;
  if (!key) return [];
  return useAgentChatStore.getState().chats[key] ?? [];
}

function stepChat(delta: number): void {
  const chats = visibleChats();
  if (chats.length === 0) return;
  const { chatId, selectChat } = useAgentModeStore.getState();
  const current = chats.findIndex((chat) => chat.id === chatId);
  // From nowhere, forward lands on the first and back on the last.
  const next = current < 0 ? (delta > 0 ? 0 : chats.length - 1) : current + delta;
  const target = chats[(next + chats.length) % chats.length];
  selectChat(target.id);
  void useAgentChatStore.getState().openChat(target.id);
}

function startChat(): void {
  const { mode, agentId, selectChat } = useAgentModeStore.getState();
  const owner = mode === "chat" ? null : agentId;
  if (mode !== "chat" && !owner) return;
  void useAgentChatStore
    .getState()
    .newChat(owner, "claude")
    .then((chat) => chat && selectChat(chat.id));
}

function focusComposer(): void {
  const field = document.querySelector<HTMLTextAreaElement>(".composer__field textarea");
  if (!field || field.disabled) return;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

function stopTurn(): void {
  const chatId = useAgentModeStore.getState().chatId;
  if (!chatId) return;
  const store = useAgentChatStore.getState();
  if (store.running[chatId]) void store.cancel(chatId);
}

/**
 * Handles one key press. Returns true when it was consumed.
 *
 * Mode cycling is the exception that runs everywhere, because it is the way
 * *into* the other two modes and a binding you can only use once you are
 * already there would be useless.
 */
export function handleAgentShortcut(event: KeyboardEvent): boolean {
  const command = event.ctrlKey || event.metaKey;
  if (!command) return false;
  const store = useAgentModeStore.getState();

  if (event.shiftKey && event.code === "KeyM") {
    store.setMode(MODES[(MODES.indexOf(store.mode) + 1) % MODES.length]);
    return true;
  }

  // Everything below belongs to a chat surface. A modal has its own keyboard
  // and must not have keys taken out from under it.
  if (store.mode === "code") return false;
  if (document.querySelector("[aria-modal='true']")) return false;

  if (event.code === "Period" && !event.shiftKey) {
    stopTurn();
    return true;
  }
  if (event.code === "KeyN" && !event.shiftKey) {
    startChat();
    return true;
  }
  if (event.code === "KeyL" && !event.shiftKey) {
    focusComposer();
    return true;
  }
  if (event.code === "PageDown" || (event.altKey && event.code === "ArrowDown")) {
    stepChat(1);
    return true;
  }
  if (event.code === "PageUp" || (event.altKey && event.code === "ArrowUp")) {
    stepChat(-1);
    return true;
  }
  return false;
}
