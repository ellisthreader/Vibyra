import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import { Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { ThemeContext, palettes } from '../src/theme';

const endpoint = 'http://127.0.0.1:8094';
const disabledAccount = async (): Promise<never> => { throw new Error('Accounts are disabled in this fixture'); };
function LiveFixture() {
  const dark = useColorScheme() !== 'light';
  const palette = dark ? palettes.dark : palettes.light;
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => {
    const values = new Map<string, string>();
    const memory = { read: async (key: string) => values.get(key) ?? null,
      write: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); } };
    return new WorkspaceStore({ rpc: new RpcClient(message => bridge.current?.post(message), randomUUID),
      uuid: randomUUID, iosConversations: true, storage: memory, flags: memory,
      account: { signup: disabledAccount, login: disabledAccount, session: disabledAccount, logout: disabledAccount, sendHostLink: disabledAccount } });
  });
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const started = useRef(false);
  const finished = useRef(false);
  const notices = useRef<{ type: string; message?: string }[]>([]);
  const post = (body: object) => fetch(`${endpoint}/result`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  useEffect(() => {
    let alive = true;
    void (async () => {
      await store.initialize();
      const config = await fetch(`${endpoint}/config`).then(response => response.json());
      if (alive) await store.actions.connect(config.invitation);
    })().catch(error => { store.report(error); void post({ error: String(error), notices: notices.current }); });
    return () => { alive = false; store.dispose(); };
  }, [store]);
  useEffect(() => {
    if (state.status === 'connected' && !started.current) {
      started.current = true;
      void (async () => {
        const session = state.sessions.find(item => item.runner === 'conversation');
        if (!session) throw new Error('Desktop shared chat is missing');
        store.actions.selectSession(session.id);
      })().catch(error => { store.report(error); void post({ error: String(error) }); });
    }
    const conversation = state.conversation;
    void post({status:state.status,control:state.control,turnState:conversation?.turnState,
      error:state.error,sessionId:conversation?.sessionId,items:conversation?.items});
    if (conversation?.turnState === 'completed' && !finished.current) {
      finished.current = true;
      void post({ status: state.status, control: state.control, turnState: conversation.turnState,
        runner: state.sessions.find(item => item.id === state.selectedSessionId)?.runner,
        messages: conversation.items.filter(item => item.kind === 'message' && item.role === 'assistant').map(item => item.text),
        cursor: conversation.cursor, sessionId: conversation.sessionId });
    }
  }, [state, store]);
  const session = state.sessions.find(item => item.id === state.selectedSessionId);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: palette.workspace }}>
    <ThemeContext.Provider value={{ colors: palette, dark }}>
      <RuntimeBridge ref={bridge} onMessage={notice => {
        if (notice && typeof notice === 'object' && 'type' in notice) {
          const value = notice as { type: string; message?: string };
          notices.current.push({ type: value.type, message: value.message });
        }
        store.deps.rpc.receive(notice);
      }} />
      <View style={{ height: 64, paddingHorizontal: 20, justifyContent: 'center' }}><Text style={{ color: palette.text, fontSize: 18 }}>Shared Desktop chat</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>Shared Chat Probe Mac · {state.status}</Text></View>
      <View style={{ flex: 1 }}>{session ? <ConversationSessionScreen session={session} workspace={{ ...state, actions: store.actions }} options={false} onCloseOptions={() => {}} />
        : <Text style={{ color: palette.text, margin: 20 }}>{state.error ?? 'Connecting the secure native runtime…'}</Text>}</View>
    </ThemeContext.Provider>
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(LiveFixture);
