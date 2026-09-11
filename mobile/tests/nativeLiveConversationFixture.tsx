import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { ThemeContext, palettes } from '../src/theme';

const endpoint = 'http://127.0.0.1:8093';
const disabledAccount = async (): Promise<never> => { throw new Error('Accounts are disabled in this fixture'); };
function LiveFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => {
    const values = new Map<string, string>();
    const memory = { read: async (key: string) => values.get(key) ?? null,
      write: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); } };
    return new WorkspaceStore({ rpc: new RpcClient(message => bridge.current?.post(message), randomUUID),
      uuid: randomUUID, iosConversations: true, storage: memory, flags: memory,
      account: { signup: disabledAccount, login: disabledAccount, session: disabledAccount, logout: disabledAccount } });
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
        const session = await store.actions.createSession(state.projects[0].id, 'codex', 'Native live verification');
        if (!session || session.runner !== 'conversation') throw new Error('Host did not create a structured conversation');
        await store.actions.submitTurn!('Reply with exactly: Native iPhone conversation verified. Do not use tools, inspect files, or run commands.');
      })().catch(error => { store.report(error); void post({ error: String(error) }); });
    }
    const conversation = state.conversation;
    if (conversation?.turnState === 'completed' && !finished.current) {
      finished.current = true;
      void post({ status: state.status, control: state.control, turnState: conversation.turnState,
        runner: state.sessions.find(item => item.id === state.selectedSessionId)?.runner,
        messages: conversation.items.filter(item => item.kind === 'message' && item.role === 'assistant').map(item => item.text),
        cursor: conversation.cursor, sessionId: conversation.sessionId });
    }
  }, [state, store]);
  const session = state.sessions.find(item => item.id === state.selectedSessionId);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: palettes.dark.workspace }}>
    <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
      <RuntimeBridge ref={bridge} onMessage={notice => {
        if (notice && typeof notice === 'object' && 'type' in notice) {
          const value = notice as { type: string; message?: string };
          notices.current.push({ type: value.type, message: value.message });
        }
        store.deps.rpc.receive(notice);
      }} />
      <View style={{ padding: 20 }}><Text style={{ color: palettes.dark.text, fontSize: 18 }}>Native live verification</Text>
        <Text style={{ color: palettes.dark.muted, fontSize: 12 }}>Isolated test computer · {state.status}</Text></View>
      {session ? <ConversationSessionScreen session={session} workspace={{ ...state, actions: store.actions }} />
        : <Text style={{ color: palettes.dark.text, margin: 20 }}>{state.error ?? 'Connecting the secure native runtime…'}</Text>}
    </ThemeContext.Provider>
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(LiveFixture);
