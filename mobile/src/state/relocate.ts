import { movedPairing } from '../connection/locateComputer';
import type { Pairing } from '../transport/pairing';
import { viaCloud } from './remote';
import type { WorkspaceStore } from './WorkspaceStore';

/** A computer still where it was answers well inside this, so a connection
 *  that works is never held up by a search. */
const GRACE = 1500;

export type Reached<T> = { connected: T } | { moved: Pairing };

/**
 * Tries the address a trusted computer was last seen at, and looks for it on
 * this network once that address fails or goes quiet. The computer has not
 * gone anywhere; its address has — another Wi-Fi, a phone hotspot, an IPv6
 * address the Mac replaced — and a dead address can stay silent for a minute
 * before iOS gives up on it. So a computer found somewhere else wins even over
 * an attempt still waiting. Finding nothing, or finding it where it already
 * was, changes nothing: that attempt runs on exactly as before.
 *
 * Only once the address has actually failed and this network has nothing is
 * the computer asked for through Vibyra Cloud — ten thousand miles away is
 * just the next place to look — and only for a computer the account says is
 * online, so an attempt held for approval is never doubled by a cloud one.
 */
export async function reach<T>(
  store: WorkspaceStore,
  pairing: Pairing,
  attempt: Promise<T>,
): Promise<Reached<T>> {
  const elsewhere = lookElsewhere(store, pairing, attempt);
  const connected = attempt.then((value): Reached<T> => ({ connected: value }));
  try {
    return await Promise.race([
      connected,
      elsewhere.then((moved): Reached<T> | Promise<Reached<T>> => (moved ? { moved } : connected)),
    ]);
  } catch (error) {
    const moved = (await elsewhere) ?? (await viaCloud(store, pairing));
    if (moved) return { moved };
    throw error;
  }
}

/** Starts looking once the saved address has failed, or has not answered
 *  within the grace period. An attempt that succeeds first needs no search. */
function lookElsewhere(store: WorkspaceStore, pairing: Pairing, attempt: Promise<unknown>) {
  return new Promise<Pairing | undefined>((resolve) => {
    let begun = false;
    const look = () => {
      if (begun) return;
      begun = true;
      clearTimeout(timer);
      void relocate(store, pairing).then(resolve);
    };
    const timer = setTimeout(look, GRACE);
    attempt.then(() => {
      if (!begun) {
        begun = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    }, look);
  });
}

async function relocate(store: WorkspaceStore, pairing: Pairing): Promise<Pairing | undefined> {
  // A computer reached through the cloud is looked for here too: back on its
  // Wi-Fi, the phone goes straight to it and the relay drops out of the way.
  if (!store.deps.locate) return undefined;
  const computer = await store.deps.locate(pairing.publicKey).catch(() => undefined);
  if (!computer) return undefined;
  try {
    const moved = movedPairing(pairing, computer);
    return moved.url === pairing.url ? undefined : moved;
  } catch {
    return undefined;
  }
}
