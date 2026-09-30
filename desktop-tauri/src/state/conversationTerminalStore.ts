import { useAccountStore } from './accountStore';
import { readConversationLayout, writeConversationLayout } from '../lib/conversationLayout';
import { create } from 'zustand';
import { listSharedChats, type SharedSession } from '../ipc/sharedChats';
import { openConversationCards } from '../lib/conversationCards';
import { useTerminalStore } from './terminalStore';
import { useWorkspaceStore } from './workspaceStore';

interface ConversationTerminals {
  sessions: SharedSession[];
  /** Whether the list has been read once this run; `sessions` is only empty
   * for real after that. The phone publisher waits on it. */
  loaded: boolean;
  /** Explicitly open cards survive relaunch; closed history does not reopen. */
  open: string[];
  focused: string | null;
  zoomed: string | null;
  dismissed: string[];
  error: string;
  saveError: string;
  layoutReady: boolean;
  refresh: () => Promise<void>;
  reveal: (id: string) => void;
  dismiss: (id: string) => void;
  toggleZoom: (id: string) => void;
}
const account = () => useAccountStore.getState().snapshot.profile?.email;
function savedLayout() {
  try { return { ...readConversationLayout(localStorage, account()), saveError: '', layoutReady: true }; }
  catch { return { open: [], dismissed: [], saveError: 'Saved terminal layout could not be read. It has not been overwritten.', layoutReady: false }; }
}
export function saveConversationLayoutNow() {
  const state = useConversationTerminals.getState();
  if (!state.layoutReady) throw new Error(state.saveError);
  writeConversationLayout(localStorage, account(), { open: state.open, dismissed: state.dismissed });
}
function persist() {
  const state = useConversationTerminals.getState();
  if (!state.layoutReady) return;
  try { saveConversationLayoutNow();
    if (state.saveError) useConversationTerminals.setState({ saveError: '' });
  } catch { useConversationTerminals.setState({ saveError: 'Open terminals could not be saved. Keep Vibyra open and free some disk space before quitting.' }); }
}
export const useConversationTerminals = create<ConversationTerminals>((set, get) => ({
  sessions: [], loaded: false, ...savedLayout(), focused: null, zoomed: null, error: '',
  refresh: async () => {
    try {
      const owner = account();
      const sessions = await listSharedChats();
      if (account() !== owner) return;
      if (JSON.stringify(sessions) !== JSON.stringify(get().sessions)) set({ sessions });
      const open = openConversationCards(sessions, get().open, get().dismissed);
      if (JSON.stringify(open) !== JSON.stringify(get().open)) { set({ open }); persist(); }
      if (!get().loaded) set({ loaded: true });
      if (get().error) set({ error: '' });
    } catch (error) { set({ error: String(error) }); }
  },
  reveal: id => {
    useWorkspaceStore.getState().setProjectMode('terminals');
    useTerminalStore.setState({ zoomedId: null, focusedId: null });
    const dismissed = get().dismissed.filter(item => item !== id);
    set({ focused: id, zoomed: null, dismissed, open: [...new Set([...get().open, id])] });
    persist();
    requestAnimationFrame(() => document.getElementById(`conversation-${id}`)?.scrollIntoView({ block: 'nearest' }));
  },
  dismiss: id => {
    const dismissed = [...new Set([...get().dismissed, id])];
    set({ dismissed, open: get().open.filter(item => item !== id), zoomed: get().zoomed === id ? null : get().zoomed });
    persist();
  },
  toggleZoom: id => {
    useTerminalStore.setState({ zoomedId: null, focusedId: null });
    set({ zoomed: get().zoomed === id ? null : id, focused: id });
  },
}));

useAccountStore.subscribe((next, previous) => {
  if (next.snapshot.profile?.email !== previous.snapshot.profile?.email) {
    useConversationTerminals.setState({ ...savedLayout(), sessions: [], loaded: false, focused: null, zoomed: null });
  }
});
