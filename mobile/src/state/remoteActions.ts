import type { WorkspaceActions } from '../ui/types';
import { connect } from './connection';
import { relayPairing } from './remote';
import type { WorkspaceStore } from './WorkspaceStore';
import { secureGrant } from '../remote/secureGrant';

/** Reaching a computer through Vibyra Cloud. Absent where the phone has no
 *  cloud API at all (the sample, the tests), so the screens offer nothing. */
export function remoteActions(
  store: WorkspaceStore,
): Pick<WorkspaceActions, 'listComputers' | 'connectComputer'> {
  const remote = store.deps.remote;
  if (!remote) return {};
  let listGeneration = 0;
  return {
    listComputers: async () => {
      const owner = store.token, epoch = store.epoch, generation = ++listGeneration;
      store.ownedRemoteHosts = null;
      const result = await remote.computers();
      // Only this account and connection may use this list for local teardown.
      if (generation === listGeneration && owner && owner === store.token && store.current(epoch) && Array.isArray(result?.computers)
        && result.computers.every(item => item && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)))
        store.ownedRemoteHosts = { owner, epoch, ids: result.computers.map(item => item.id) };
      return result;
    },
    // The grant becomes an ordinary pairing and takes the ordinary road: the
    // computer's key is pinned, it approves this phone once, trust is saved.
    connectComputer: async (hostId, permissions) => {
      store.auto.stop();
      store.disconnect();
      store.cloudSecurityScope = { owner: store.token, hostId };
      store.update({ status: 'connecting', throughCloud: true, error: null });
      const epoch = store.epoch;
      const owner = store.token;
      const account = store.state.account?.email;
      let secured;
      let grant;
      try {
        secured = remote.security ? await secureGrant(store, hostId, permissions, true) : null;
        grant = secured?.grant ?? await remote.connect(hostId);
      } catch (error) {
        if (store.current(epoch)) store.update({ status: 'error', remoteSecurity: undefined,
          error: error instanceof Error ? error.message : 'Secure connection could not continue.' });
        throw error;
      }
      store.assertCurrent(epoch);
      if (owner !== store.token || account !== store.state.account?.email)
        throw new Error('The signed-in account changed. Connect again from your current account.');
      store.update({ status: 'offline' });
      await connect(store, JSON.stringify(relayPairing(grant)), true, secured?.privateKey);
    },
  };
}
