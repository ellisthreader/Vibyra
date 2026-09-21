import type { CloudGrant } from '../remote/remoteApi';
import type { Pairing } from '../transport/pairing';
import type { WorkspaceStore } from './WorkspaceStore';

/** A computer reached through Vibyra Cloud, as a pairing. The relay only
 *  carries Noise frames, so the computer's own key is still what the phone
 *  pins — a computer identity *is* its public key — and the grant is the only
 *  thing the relay reads. */
export function relayPairing(grant: CloudGrant): Pairing {
  return { version: 1, hostId: grant.host.id, name: grant.host.name, publicKey: grant.host.id,
    url: grant.relayUrl, route: 'relay', relayToken: grant.token };
}

/** The same computer, with a fresh grant: what a saved cloud pairing needs
 *  before every connection, because grants last minutes and are never saved. */
export async function refreshRelay(store: WorkspaceStore, pairing: Pairing): Promise<Pairing> {
  if (!store.deps.remote) throw new Error('Remote access is not available on this device.');
  const grant = await store.deps.remote.connect(pairing.publicKey);
  if (grant.host.id !== pairing.publicKey) throw new Error('Vibyra Cloud named a different computer. Pair it again.');
  return { ...pairing, name: grant.host.name || pairing.name, url: grant.relayUrl, relayToken: grant.token };
}

/** Whether a computer this phone could not reach directly can be reached
 *  through the cloud instead: signed in, the account lists it, and it is
 *  online there. Ten feet or ten thousand miles away, the phone should not
 *  have to know which. Any failure here is silently "no". */
export async function viaCloud(store: WorkspaceStore, pairing: Pairing): Promise<Pairing | undefined> {
  if (pairing.route === 'relay' || !store.deps.remote || !store.token) return undefined;
  // The account files a computer under its key, which is also what this
  // pairing pinned; a grant for any other computer is refused as a mismatch.
  try {
    const grant = await store.deps.remote.connect(pairing.publicKey);
    return grant.host.id === pairing.publicKey ? relayPairing(grant) : undefined;
  } catch { return undefined; }
}
