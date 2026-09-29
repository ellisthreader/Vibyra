import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { SessionScreen } from '../src/ui/SessionScreen';
import { ThemeContext, palettes } from '../src/theme';

// The terminal session screen against a real Host in a browser, so typing into
// the box can be driven by a keyboard and checked against the computer. The
// invitation arrives in the URL because pairing has no code page to drive.
const disabledAccount = async (): Promise<never> => { throw new Error('Accounts are disabled in this fixture'); };
const uuid = () => crypto.randomUUID();
function TerminalHostFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => {
    const values = new Map<string, string>();
    const memory = { read: async (key: string) => values.get(key) ?? null,
      write: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); } };
    return new WorkspaceStore({ rpc: new RpcClient(message => bridge.current?.post(message), uuid),
      uuid, iosConversations: new URLSearchParams(location.search).has('conversation'), storage: memory, flags: memory,
      account: { signup: disabledAccount, login: disabledAccount, session: disabledAccount, logout: disabledAccount, sendHostLink: disabledAccount } });
  });
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const started = useRef(false);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('conversation')) return;
    Object.assign(window, { sharedChatFixture: store });
    return () => { delete (window as Window & { sharedChatFixture?: unknown }).sharedChatFixture; };
  }, [store]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      await store.initialize();
      const invitation = new URLSearchParams(location.search).get('invitation');
      if (invitation && alive) await store.actions.connect(invitation);
    })().catch(error => store.report(error));
    return () => { alive = false; store.dispose(); };
  }, [store]);
  // `?existing` opens a terminal the computer already has instead of starting
  // one: a Vibyra Desktop never lets a phone start one, it shares its own.
  useEffect(() => {
    if (state.status !== 'connected' || started.current || !state.projects[0]) return;
    if (new URLSearchParams(location.search).has('existing')) {
      if (!state.sessions[0]) return;
      started.current = true;
      store.actions.selectSession(state.sessions[0].id);
      return;
    }
    started.current = true;
    void store.actions.createSession(state.projects[0].id, 'shell', 'checkout')
      .catch(error => store.report(error));
  }, [state, store]);
  const session = state.sessions.find(item => item.id === state.selectedSessionId);
  // `?theme=light` reviews the light palette, which no other harness renders.
  const dark = new URLSearchParams(location.search).get('theme') !== 'light';
  const colors = dark ? palettes.dark : palettes.light;
  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: colors.background }}>
    <ThemeContext.Provider value={{ colors, dark }}>
      <RuntimeBridge ref={bridge} onMessage={notice => store.deps.rpc.receive(notice)} />
      {session ? session.runner === 'conversation' ? <ConversationSessionScreen session={session} workspace={{ ...state, actions: store.actions }} options={false} onCloseOptions={() => {}} /> : <SessionScreen session={session} workspace={{ ...state, actions: store.actions }} />
        : <Text style={{ color: colors.text, margin: 20 }}>{state.error ?? 'Connecting…'}</Text>}
    </ThemeContext.Provider>
  </View></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<TerminalHostFixture />);
