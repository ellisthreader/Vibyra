import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import { randomUUID } from 'expo-crypto';
import type { BridgeHandle } from '../transport/Bridge.types';
import { RpcClient } from '../transport/RpcClient';
import { createAccountApi } from '../account/accountApi';
import { signInWithProvider } from '../account/providerSignIn';
import { deleteFlag, readFlag, writeFlag } from '../transport/deviceFlags';
import { deleteSecure, readSecure, writeSecure } from '../transport/secureStorage';
import { WorkspaceStore } from './WorkspaceStore';
import { createVibesApi } from '../vibes/api';
import { createIntegrationsApi } from '../integrations/api';

export function useWorkspace() {
  const bridge = useRef<BridgeHandle>(null);
  const [store] = useState(() => new WorkspaceStore({
    rpc: new RpcClient(message => {
      if (!bridge.current) throw new Error('Secure connection support is starting. Try again in a moment.');
      bridge.current.post(message);
    }, randomUUID),
    storage: { read: readSecure, write: writeSecure, delete: deleteSecure },
    flags: { read: readFlag, write: writeFlag, delete: deleteFlag }, uuid: randomUUID,
    iosConversations: Platform.OS === 'ios',
    account: accountApi(),
  }));
  // One base URL for both: integrations are part of the same account, reached with the
  // same session token, and read fresh from the store rather than captured.
  const apiUrl = String(Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app');
  const [vibesApi] = useState(() => createVibesApi(apiUrl, () => store.token));
  const [integrationsApi] = useState(() => createIntegrationsApi(apiUrl, () => store.token));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    let mounted = true;
    const openLink = (url: string | null) => {
      if (!mounted || !url?.startsWith('vibyra://pair')) return;
      void store.actions.connect(url).catch(error => store.report(error));
    };
    void store.initialize().then(async () => { openLink(await Linking.getInitialURL()); }).catch(error => store.report(error));
    const links = Linking.addEventListener('url', event => openLink(event.url));
    // 'inactive' is the app switcher, a pulled-down notification or a system
    // alert. The person has not left, so the computer is left where it is.
    const lifecycle = AppState.addEventListener('change', status => {
      if (status === 'background') store.suspend();
      else if (status === 'active') store.resume();
    });
    // Losing signal is a real reason to be disconnected; getting it back is a
    // real reason to stop being, without waiting for the next launch.
    const network = Network.addNetworkStateListener(state => { if (state.isConnected) store.resume(); });
    return () => { mounted = false; links.remove(); lifecycle.remove(); network.remove(); store.dispose(); };
  }, [store]);
  return { vibesApi, integrationsApi, bridge, onMessage: store.deps.rpc.receive, workspace: { ...state, actions: store.actions } };
}
function accountApi() {
  const api = createAccountApi({ baseUrl: String(Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app'),
    deviceName: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'Vibyra web' });
  return { ...api, socialLogin: (provider: 'apple' | 'google', signal: AbortSignal) => signInWithProvider(api, provider, signal) };
}
