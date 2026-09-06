import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { randomUUID } from 'expo-crypto';
import type { BridgeHandle } from '../transport/Bridge.types';
import { RpcClient } from '../transport/RpcClient';
import { deleteSecure, readSecure, writeSecure } from '../transport/secureStorage';
import { WorkspaceStore } from './WorkspaceStore';

export function useWorkspace() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => new WorkspaceStore({
    rpc: new RpcClient(message => {
      if (!bridge.current) throw new Error('Secure connection support is starting. Try again in a moment.');
      bridge.current.post(message);
    }, randomUUID),
    storage: { read: readSecure, write: writeSecure, delete: deleteSecure }, uuid: randomUUID,
  }));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    let mounted = true;
    const openLink = (url: string | null) => {
      if (!mounted || !url?.startsWith('vibyra://pair')) return;
      void store.actions.connect(url).catch(error => store.report(error));
    };
    void store.initialize().then(async () => { openLink(await Linking.getInitialURL()); }).catch(error => store.report(error));
    const links = Linking.addEventListener('url', event => openLink(event.url));
    const lifecycle = AppState.addEventListener('change', status => { if (status !== 'active') store.suspend(); });
    return () => { mounted = false; links.remove(); lifecycle.remove(); store.dispose(); };
  }, [store]);
  return { bridge, onMessage: store.deps.rpc.receive, workspace: { ...state, actions: store.actions } };
}
