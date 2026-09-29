import type { RemoteDashboardApi } from '../remote/dashboardApi';
import type { RemoteDevice } from '../remote/securityTypes';
import type { WorkspaceStore } from './WorkspaceStore';

/** Transient authorization metadata, never persisted with connection credentials. */
export interface CloudSecurityScope { owner: string | null; hostId: string; deviceId?: string; sessionId?: string }

/** Restrictive security actions stop matching control before server/persistence I/O.
 * Nearby account-wide teardown requires a current authenticated ownership list. */
export function remoteSecurityDashboard(store: WorkspaceStore, api?: RemoteDashboardApi): RemoteDashboardApi | undefined {
  if (!api) return undefined;
  let devices: { owner: string; epoch: number; rows: RemoteDevice[] } | null = null;
  let deviceGeneration = 0;
  const run = async (matches: (scope: CloudSecurityScope | null) => boolean, work: () => Promise<void>, nearbyTarget: boolean | string = false) => {
    const owner = api.identity();
    if (!owner || store.token !== owner) throw new Error('The signed-in account changed. Review remote access again.');
    const scope = store.cloudSecurityScope;
    const cloud = scope?.owner === owner && (store.state.throughCloud || store.state.status !== 'connected');
    const owned = store.ownedRemoteHosts;
    const matchingDevice = typeof nearbyTarget === 'string' && devices?.owner === owner && devices.epoch === store.epoch
      && /^[a-f0-9]{64}$/.test(store.saved?.deviceId ?? '') && devices.rows.some(device => device.id === nearbyTarget
        && device.hostId === store.saved?.pairing.publicKey && device.publicKey === store.saved?.deviceId);
    const nearby = !cloud && (nearbyTarget === true || matchingDevice) && owned?.owner === owner && owned.epoch === store.epoch
      && !!store.saved && owned.ids.includes(store.saved.pairing.publicKey);
    const stopped = (!!cloud && matches(scope)) || nearby;
    let persistence = Promise.resolve();
    if (stopped) {
      store.auto.stop();
      store.disconnect(); // Advances the epoch, fencing every in-flight Cloud grant.
      if (store.saved && (nearby || store.saved.pairing.publicKey === scope?.hostId)) {
        const saved = store.saved = { ...store.saved, autoConnect: false };
        persistence = Promise.resolve().then(() => store.deps.storage.write('connection', JSON.stringify(saved))).catch(async () => {
          // Failure to save cannot block the server revocation. Removing only the
          // same remembered connection also prevents reconnect after a relaunch.
          if (store.saved === saved && store.token === owner) await store.deps.storage.delete('connection');
        });
      }
    }
    const [remote, local] = await Promise.allSettled([Promise.resolve().then(() => {
      if (store.token !== owner || api.identity() !== owner) throw new Error('Account changed.');
      return work();
    }), persistence]);
    if (remote.status === 'rejected') throw new Error((stopped ? 'This phone disconnected. ' : '')
      + 'The remote security change is unconfirmed. Try again when Vibyra is reachable.'
      + (local.status === 'rejected' ? ' Keep Vibyra closed until device storage is available.' : ''));
    if (local.status === 'rejected') throw new Error('This phone disconnected, but its reconnect setting could not be saved. Keep Vibyra closed until device storage is available.');
  };
  return {
    ...api,
    devices: async () => {
      const owner = api.identity(), epoch = store.epoch, generation = ++deviceGeneration;
      devices = null;
      const rows = await api.devices();
      if (generation === deviceGeneration && owner && api.identity() === owner && store.token === owner && store.current(epoch) && Array.isArray(rows)
        && rows.every(row => row && typeof row.id === 'string' && /^[a-f0-9]{64}$/.test(row.hostId)
          && /^[a-f0-9]{64}$/.test(row.publicKey))) devices = { owner, epoch, rows: rows.map(row => ({ ...row })) };
      return rows;
    },
    disconnect: id => run(scope => scope?.sessionId === id, () => api.disconnect(id)),
    revoke: id => run(scope => scope?.deviceId === id, () => api.revoke(id), id),
    removePasskey: id => run(() => true, () => api.removePasskey(id), true),
    disconnectAll: ids => run(() => true, () => api.disconnectAll(ids)),
    revokeAll: () => run(() => true, () => api.revokeAll(), true),
    disable: () => run(() => true, () => api.disable(), true),
  };
}
