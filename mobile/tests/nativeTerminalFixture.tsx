import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { SessionScreen } from '../src/ui/SessionScreen';
import { ThemeContext, palettes } from '../src/theme';

// Renders the real terminal session screen against an isolated Host, so the
// native WebView, keyboard and layout are reviewed as a phone lays them out.
// Only this screen is mounted: pulling in the whole app shell would make a
// terminal check fail for unrelated work elsewhere in the tree.
const endpoint = 'http://127.0.0.1:8093';
const disabledAccount = async (): Promise<never> => { throw new Error('Accounts are disabled in this fixture'); };
function TerminalFixture() {
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
  const [inset, setInset] = useState(0);
  const started = useRef(false);
  const post = (body: object) => fetch(`${endpoint}/result`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  useEffect(() => {
    let alive = true;
    void (async () => {
      await store.initialize();
      const config = await fetch(`${endpoint}/config`).then(response => response.json());
      if (alive) await store.actions.connect(config.invitation);
    })().catch(error => { store.report(error); void post({ error: String(error) }); });
    return () => { alive = false; store.dispose(); };
  }, [store]);
  useEffect(() => {
    if (state.status !== 'connected' || started.current) return;
    started.current = true;
    void (async () => {
      await store.actions.createSession(state.projects[0].id, 'shell', 'checkout');
      const script = await fetch(`${endpoint}/script`).then(response => response.json());
      setInset(Number(script.keyboardInset ?? 0));
      for (const line of script.commands as string[]) {
        await new Promise(resolve => setTimeout(resolve, 900));
        await store.actions.sendInput(`${line}\r`);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      const current = store.snapshot();
      const open = current.sessions.find(item => item.id === current.selectedSessionId);
      void post({ status: current.status, control: current.control, kind: open?.kind,
        runner: open?.runner, sessionStatus: open?.status, output: current.output.length });
    })().catch(error => { store.report(error); void post({ error: String(error) }); });
  }, [state, store]);
  const session = state.sessions.find(item => item.id === state.selectedSessionId);
  return <SafeAreaProvider><SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: palettes.dark.background }}>
    <View style={{ flex: 1, paddingBottom: inset }}>
    <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
      <RuntimeBridge ref={bridge} onMessage={notice => store.deps.rpc.receive(notice)} />
      {session ? <SessionScreen session={session} workspace={{ ...state, actions: store.actions }} />
        : <Text style={{ color: palettes.dark.text, margin: 20 }}>{state.error ?? 'Connecting the secure native runtime…'}</Text>}
    </ThemeContext.Provider>
    </View>
  </SafeAreaView></SafeAreaProvider>;
}
registerRootComponent(TerminalFixture);
