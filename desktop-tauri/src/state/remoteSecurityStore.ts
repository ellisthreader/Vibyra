import { create } from 'zustand';
import { useAccountStore } from './accountStore';
import { remoteSecuritySnapshot, remoteDecideDevice, remoteRevoke, type RemoteDevice, remoteDecideSession, remoteSetMode, remoteDisableAll, type PendingRemoteSession, type RemoteMode, type RemoteSecuritySnapshot } from '../ipc/remoteSecurity';

interface SecurityStore {
  snapshot: RemoteSecuritySnapshot | null; error: string; busy: boolean; generation: number;
  reset(): void; refresh(): Promise<void>; decide(device: RemoteDevice, approve: boolean): Promise<void>;
  decideSession(session: PendingRemoteSession, allow: boolean): Promise<void>;
  setMode(mode: RemoteMode): Promise<void>; disableAll(): Promise<void>;
  revoke(kind: 'device' | 'session' | 'devices' | 'passkey', id?: string): Promise<void>;
}
export const useRemoteSecurity = create<SecurityStore>((set, get) => {
  let loading = false, refreshError = false;
  const act = async (work: (snapshot: RemoteSecuritySnapshot) => Promise<void>) => {
    const snapshot = get().snapshot;
    if (!snapshot || get().busy) return;
    const generation = get().generation;
    refreshError = false;
    set({ busy: true, error: '' });
    try { await work(snapshot); if (get().generation === generation) await get().refresh(); }
    catch (error) { if (get().generation === generation) set({ error: String(error) }); }
    finally { if (get().generation === generation) set({ busy: false }); }
  };
  return {
    snapshot: null, error: '', busy: false, generation: 0,
    reset: () => { refreshError = false; set({ snapshot: null, error: '', busy: false, generation: get().generation + 1 }); },
    refresh: async () => {
      if (loading) return;
      const account = useAccountStore.getState().snapshot.profile?.welcomeKey;
      if (!account) { get().reset(); return; }
      const generation = get().generation; loading = true;
      try {
        const snapshot = await remoteSecuritySnapshot();
        if (generation === get().generation && useAccountStore.getState().snapshot.profile?.welcomeKey === account && snapshot.scope.accountScope === account) {
          if (JSON.stringify(snapshot) !== JSON.stringify(get().snapshot)) set({ snapshot });
          if (refreshError) { refreshError = false; set({ error: '' }); }
        }
      } catch (error) {
        if (generation === get().generation && (!get().error || refreshError)) { refreshError = true; set({ error: String(error) }); }
      }
      finally { loading = false; }
    },
    decide: (device, approve) => act(snapshot => remoteDecideDevice(snapshot.scope, device, approve)),
    decideSession: (session, allow) => act(snapshot => remoteDecideSession(snapshot.scope, session, allow)),
    setMode: mode => act(snapshot => remoteSetMode(snapshot.scope, mode)),
    disableAll: () => act(snapshot => remoteDisableAll(snapshot.scope)),
    revoke: (kind, id = '') => act(snapshot => {
      const device = kind === 'device' ? snapshot.devices.find(d => d.id === id) : null;
      if (kind === 'device' && !device) throw new Error('Review this device before revoking it.');
      return remoteRevoke(snapshot.scope, kind, id, device ? { hostId: device.hostId, publicKey: device.publicKey } : null);
    }),
  };
});
