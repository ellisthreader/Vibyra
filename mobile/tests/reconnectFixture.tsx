import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';

const disabled = async (): Promise<never> => { throw new Error('Account access is disabled in this fixture'); };
// Backed by localStorage rather than a Map, so reloading the page is the app
// relaunch this fixture exists to put a real computer behind.
const storage = {
  read: async (key: string) => localStorage.getItem(key),
  write: async (key: string, value: string) => { localStorage.setItem(key, value); },
  delete: async (key: string) => { localStorage.removeItem(key); },
};
function ReconnectFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => new WorkspaceStore({
    rpc: new RpcClient(message => bridge.current?.post(message), () => crypto.randomUUID()),
    uuid: () => crypto.randomUUID(), storage, flags: storage,
    account: { signup: disabled, login: disabled, session: disabled, logout: disabled },
  }));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    const link = new URLSearchParams(location.search).get('pair');
    // Exactly what the app does on launch, and nothing more: no screen here
    // asks for a computer, so anything that connects did so by itself.
    void store.initialize()
      .then(() => (link && !store.saved ? store.actions.connect(link) : undefined))
      .catch(() => {});
    return () => store.dispose();
  }, [store]);
  const line = `STATUS ${state.status}${state.reconnecting ? ' RECONNECTING' : ''}`;
  return <View style={{ flex: 1, padding: 16, backgroundColor: '#101115' }}>
    <RuntimeBridge ref={bridge} onMessage={notice => store.deps.rpc.receive(notice)} />
    <Text style={{ color: '#fff', fontSize: 16 }}>{line}</Text>
    <Text style={{ color: '#8b8f9a', fontSize: 13 }}>HOST {state.host?.name ?? 'none'}</Text>
    <Text style={{ color: '#8b8f9a', fontSize: 13 }}>ERROR {state.error ?? 'none'}</Text>
    <Pressable accessibilityRole="button" onPress={() => void store.actions.disconnect()}>
      <Text style={{ color: '#fff', padding: 12 }}>Disconnect</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => void store.actions.reconnect?.().catch(() => {})}>
      <Text style={{ color: '#fff', padding: 12 }}>Reconnect</Text>
    </Pressable>
  </View>;
}
createRoot(document.getElementById('root')!).render(<ReconnectFixture />);
