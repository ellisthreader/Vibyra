import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectingStep } from '../src/connection/ConnectingStep';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { ThemeContext, palettes } from '../src/theme';

const disabled = async (): Promise<never> => { throw new Error('Account access is disabled in this fixture'); };
function NearbyHostFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const [open, setOpen] = useState(true);
  const [computer] = useState(() => JSON.parse(new URLSearchParams(location.search).get('computer')!));
  const [store] = useState(() => {
    const values = new Map<string, string>();
    const memory = { read: async (key: string) => values.get(key) ?? null,
      write: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); } };
    return new WorkspaceStore({ rpc: new RpcClient(message => bridge.current?.post(message), () => crypto.randomUUID()),
      uuid: () => crypto.randomUUID(), iosConversations: false, storage: memory, flags: memory,
      account: { signup: disabled, login: disabled, session: disabled, logout: disabled } });
  });
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => () => store.dispose(), [store]);
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <View style={{ flex: 1, backgroundColor: palettes.dark.background }}>
      <RuntimeBridge ref={bridge} onMessage={notice => store.deps.rpc.receive(notice)} />
      {open ? <>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
          <Text style={{ color: palettes.dark.muted, padding: 12 }}>Close connection fixture</Text>
        </Pressable>
        <ConnectingStep computer={computer} workspace={{ ...state, actions: store.actions }}
          onDone={() => setOpen(false)} onSearch={() => setOpen(false)} />
      </> : <Text style={{ color: palettes.dark.text, padding: 20 }}>
        {state.status === 'connected' ? `Connected to ${state.host?.name}` : `Connection ${state.status}`}
      </Text>}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<NearbyHostFixture />);
