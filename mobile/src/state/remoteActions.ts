import type { WorkspaceActions } from '../ui/types';
import { connect } from './connection';
import { relayPairing } from './remote';
import type { WorkspaceStore } from './WorkspaceStore';

/** Reaching a computer through Vibyra Cloud. Absent where the phone has no
 *  cloud API at all (the sample, the tests), so the screens offer nothing. */
export function remoteActions(store: WorkspaceStore): Pick<WorkspaceActions, 'listComputers' | 'connectComputer'> {
  const remote = store.deps.remote;
  if (!remote) return {};
  return {
    listComputers: () => remote.computers(),
    // The grant becomes an ordinary pairing and takes the ordinary road: the
    // computer's key is pinned, it approves this phone once, trust is saved.
    connectComputer: async hostId => { await connect(store, JSON.stringify(relayPairing(await remote.connect(hostId)))); },
  };
}
