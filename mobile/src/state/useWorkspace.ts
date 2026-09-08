import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { randomUUID } from 'expo-crypto';
import type { BridgeHandle } from '../transport/Bridge.types';
import { RpcClient } from '../transport/RpcClient';
import { createAccountApi } from '../account/accountApi';
import { deleteFlag, readFlag, writeFlag } from '../transport/deviceFlags';
import { deleteSecure, readSecure, writeSecure } from '../transport/secureStorage';
import { WorkspaceStore } from './WorkspaceStore';

export function useWorkspace() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => new WorkspaceStore({
    rpc: new RpcClient(message => {
      if (!bridge.current) throw new Error('Secure connection support is starting. Try again in a moment.');
      bridge.current.post(message);
    }, randomUUID),
    storage: { read: readSecure, write: writeSecure, delete: deleteSecure },
    flags: { read: readFlag, write: writeFlag, delete: deleteFlag }, uuid: randomUUID,
    account: createAccountApi({ baseUrl: String(Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app'),
      deviceName: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'Vibyra web' }),
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
