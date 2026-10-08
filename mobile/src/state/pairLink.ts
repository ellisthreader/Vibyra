import { parsePairing, type Pairing } from '../transport/pairing';
import { decidePairLink, pairHostLabel } from './pairLinkDecision';
import type { WorkspaceStore } from './WorkspaceStore';

/** A link waiting for the person's tap. Held in memory only: it carries the invitation. */
export interface HeldPairLink {
  link: string;
  /** The computer's name as it is shown: plain, single-line and clipped. */
  name: string;
}
type Target = Pick<WorkspaceStore, 'saved' | 'report'> & { actions: Pick<WorkspaceStore['actions'], 'connect'> };

/**
 * A `vibyra://pair` link from outside the app (F-29). The computer this phone already holds
 * reconnects as before; any other is handed to `hold` and nothing happens -- the session is not
 * cleared, no connection opens, nothing is saved -- until `acceptPairLink` runs from an explicit tap.
 * A link that is not a valid pairing code is reported like any other failed connect.
 */
export async function receivePairLink(
  store: Target,
  link: string,
  hold: (held: HeldPairLink) => void,
): Promise<void> {
  let pairing: Pairing;
  try {
    pairing = parsePairing(link);
  } catch (error) {
    store.report(error);
    return;
  }
  if (decidePairLink(store.saved?.pairing, pairing) === 'pair') {
    await store.actions.connect(link).catch((error) => store.report(error));
    return;
  }
  hold({ link, name: pairHostLabel(pairing.name) });
}

/** The person tapped Pair: only now does the held link do what a link used to do by itself. */
export async function acceptPairLink(store: Target, held: HeldPairLink): Promise<void> {
  await store.actions.connect(held.link).catch((error) => store.report(error));
}
