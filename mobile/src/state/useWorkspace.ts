import { createNotificationsApi } from '../notifications/api';
import { createReportApi } from '../report/api';
import { refreshAccount } from '../account/accountActions';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { BridgeHandle } from '../transport/Bridge.types';
import { RpcClient } from '../transport/RpcClient';
import { createAccountApi } from '../account/accountApi';
import { localDiscovery } from '../connection/localDiscovery';
import { locateComputer } from '../connection/locateComputer';
import { signInWithProvider } from '../account/providerSignIn';
import { deleteWithProvider } from '../account/providerDeletion';
import { deleteFlag, readFlag, writeFlag } from '../transport/deviceFlags';
import { deleteSecure, readSecure, writeSecure } from '../transport/secureStorage';
import { WorkspaceStore } from './WorkspaceStore';
import { createVibesApi } from '../vibes/api';
import { createAgentsApi } from '../agents/api';
import { createRemoteApi } from '../remote/remoteApi';
import { createIntegrationsApi } from '../integrations/api';
import { createPreferencesApi } from '../vibes/preferencesApi';
import { prepareGuest } from '../vibes/guestSession';
import { GUEST_TOKEN_KEY } from '../vibes/guestKeys';

export function useWorkspace() {
  const bridge = useRef<BridgeHandle>(null);
  // The cloud API asks the store for its token on every call, and the store
  // does not exist until this initialiser returns; the box bridges the gap.
  const self = useRef<WorkspaceStore | null>(null);
  const [store] = useState(
    () =>
      new WorkspaceStore({
        rpc: new RpcClient((message) => {
          if (!bridge.current)
            throw new Error('Secure connection support is starting. Try again in a moment.');
          bridge.current.post(message);
        }, randomUUID),
        storage: { read: readSecure, write: writeSecure, delete: deleteSecure },
        flags: { read: readFlag, write: writeFlag, delete: deleteFlag },
        uuid: randomUUID,
        iosConversations: Platform.OS === 'ios',
        previewNative:
          Platform.OS === 'ios' && requireOptionalNativeModule('VibyraPreviewProof') !== null,
        account: accountApi(),
        locate: (publicKey) => locateComputer(localDiscovery, publicKey),
        remote: createRemoteApi(
          String(Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app'),
          () => self.current?.token ?? null,
          deviceLabel(),
        ),
      }),
  );
  self.current = store;
  // One base URL for both: integrations are part of the same account, reached with the
  // same session token, and read fresh from the store rather than captured.
  const apiUrl = String(
    Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app',
  );
  const [vibesApi] = useState(() => createVibesApi(apiUrl, () => store.token));
  const [notifications] = useState(() => createNotificationsApi(apiUrl, () => store.token));
  const [reports] = useState(() => createReportApi(apiUrl, () => store.token));
  const [agentsApi] = useState(() => createAgentsApi(apiUrl, () => store.token));
  const [integrationsApi] = useState(() =>
    createIntegrationsApi(apiUrl, async (prepare) => {
      if (store.token) return store.token;
      if (prepare) await prepareGuest(vibesApi);
      return store.token ?? (await readSecure(GUEST_TOKEN_KEY));
    }),
  );
  // Personality and Memory ask as the Vibes chat does: the account, else the guest
  // session VibesProvider keeps in secure storage (sign-in deletes it, so it never outlives one).
  const [preferences] = useState(() =>
    createPreferencesApi(
      apiUrl,
      async () => store.token ?? (await readSecure(GUEST_TOKEN_KEY).catch(() => null)),
    ),
  );
  const state = useSyncExternalStore(store.subscribeView, store.viewSnapshot, store.viewSnapshot);
  const started = useRef(false);
  useEffect(() => {
    let mounted = true;
    const openLink = (url: string | null) => {
      if (!mounted || !url?.startsWith('vibyra://pair')) return;
      void store.actions.connect(url).catch((error) => store.report(error));
    };
    // Once per store, not once per run of this effect. The store lives in state
    // for the life of the app, but Fast Refresh re-runs this effect on every
    // save: disposing and re-initialising the live store there tore down the
    // connection being made ("The connection changed…") and left the store no
    // longer listening to its transport. Only the listeners below come and go.
    if (!started.current) {
      started.current = true;
      void store
        .initialize()
        .then(async () => {
          openLink(await Linking.getInitialURL());
        })
        .catch((error) => store.report(error));
    }
    const links = Linking.addEventListener('url', (event) => openLink(event.url));
    // 'inactive' is the app switcher, a pulled-down notification or a system
    // alert. The person has not left, so the computer is left where it is.
    const lifecycle = AppState.addEventListener('change', (status) => {
      if (status === 'background') store.suspend();
      else if (status === 'active') {
        store.resume();
        void refreshAccount(store);
      }
    });
    // Losing signal is a real reason to be disconnected; getting it back is a
    // real reason to stop being, without waiting for the next launch.
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected) store.resume();
    });
    return () => {
      mounted = false;
      links.remove();
      lifecycle.remove();
      network.remove();
    };
  }, [store]);
  return {
    refreshMembership: () => {
      void refreshAccount(store);
    },
    agentsApi,
    vibesApi,
    integrationsApi,
    bridge,
    onMessage: store.deps.rpc.receive,
    workspace: {
      ...state,
      preferences,
      notifications,
      reports,
      actions: store.actions,
      terminalOutput: store.terminalOutput,
    },
  };
}
const deviceLabel = () =>
  Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'Vibyra web';
function accountApi() {
  const api = createAccountApi({
    baseUrl: String(
      Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app',
    ),
    deviceName: deviceLabel(),
  });
  return {
    ...api,
    socialLogin: (provider: 'apple' | 'google', signal: AbortSignal) =>
      signInWithProvider(api, provider, signal),
    providerDeletion: (provider: 'apple' | 'google', token: string, signal: AbortSignal) =>
      deleteWithProvider(api, provider, token, signal),
  };
}
