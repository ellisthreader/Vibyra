import { hostSnapshot } from './hostSnapshot';
import { refreshAccount, restoreAccount, restoreOnboarding } from '../account/accountActions';
import { forgetRemembered, recallProjects, rememberProjects } from './projectMemory';
import { parsePairing, type Pairing } from '../transport/pairing';
import type { WorkspaceStore } from './WorkspaceStore';
import type { SavedConnection } from './types';
import { restoreConversation } from './conversationContinuity';
import { reach } from './relocate';
import { refreshRelay } from './remote';
import { addressOf, throughCloud, withoutInvite } from './connectionIdentity';
export async function initialize(store: WorkspaceStore) {
  const epoch = store.epoch;
  try {
    const [value, theme, creates, account] = await Promise.all([
      store.deps.storage.read('connection'),
      store.deps.storage.read('theme'),
      store.deps.storage.read('pending-creates'),
      store.deps.storage.read('account'),
      restoreOnboarding(store),
    ]);
    if (!store.current(epoch)) return;
    if (theme === 'light' || theme === 'dark' || theme === 'system')
      store.update({ themePreference: theme });
    store.creates.restore(creates);
    await restoreAccount(store, account);
    void refreshAccount(store);
    if (!value) return;
    const saved = JSON.parse(value) as SavedConnection;
    saved.pairing = parsePairing(JSON.stringify(saved.pairing));
    if (!/^[a-f0-9]{64}$/.test(saved.privateKey))
      throw new Error('Saved connection could not be read. Pair your computer again.');
    store.saved = saved;
    // An uncompleted pairing keeps its key but does not count as a known computer.
    store.update({
      host: store.knownHost(),
      hostAddress: saved.host ? addressOf(saved.pairing) : null,
      throughCloud: throughCloud(saved.pairing),
    });
    // Cache failure cannot prevent reconnecting.
    void recallProjects(store, saved.pairing.hostId)
      .then((remembered) => {
        if (remembered && store.current(epoch)) store.update({ remembered });
      })
      .catch(() => {});
    // Opening the app is not a reason to be away from a computer. Unless the
    // person put this one away by hand, it is expected to still be there.
    store.auto.resume();
  } catch (error) {
    if (store.current(epoch)) store.report(error);
  }
}
export async function connect(store: WorkspaceStore, link: string, forceRelay = false, privateKey?: string) {
  const pairing = parsePairing(link);
  if (busy(store)) throw new Error('A connection is already in progress.');
  await open(store, pairing, false, forceRelay, privateKey);
}
export async function reconnect(store: WorkspaceStore) {
  if (!store.saved) throw new Error('Pair your computer before reconnecting.');
  if (busy(store)) throw new Error('A connection is already in progress.');
  await open(store, withoutInvite(store.saved.pairing));
}
// An attempt the app started on its own yields to the person, who may well be
// pairing a different computer than the one it is quietly retrying.
function busy(store: WorkspaceStore) {
  return !store.auto.attempting && ['connecting', 'pairing'].includes(store.state.status);
}
async function open(
  store: WorkspaceStore,
  pairing: Pairing,
  relocated = false,
  forceRelay = false,
  preparedKey?: string,
): Promise<void> {
  store.disconnect();
  store.cloudSecurityScope = throughCloud(pairing) ? { owner: store.token, hostId: pairing.publicKey,
    ...(store.cloudSecurityScope?.hostId === pairing.publicKey && store.cloudSecurityScope.owner === store.token
      ? { deviceId: store.cloudSecurityScope.deviceId } : {}),
    sessionId: pairing.remoteSessionId } : null;
  const epoch = store.epoch;
  const previous = store.saved;
  const same =
    previous?.pairing.hostId === pairing.hostId && previous.pairing.publicKey === pairing.publicKey;
  if (!same) {
    store.clearSession();
    store.update({ projects: [], remembered: null, sessions: [], conversationAvailable: false });
  }
  store.update({ hostAddress: addressOf(pairing), throughCloud: throughCloud(pairing) });
  // A nearby or cloud connection carries no invitation, but a computer that has
  // not seen this phone before still holds it while its owner approves.
  const awaitsApproval =
    Boolean(pairing.invite || pairing.nearby || pairing.route === 'relay') && !same;
  // The computer being reconnected stays on the page while it is reached;
  // blanking it turned every retry into the connect flow for a moment.
  store.update({
    status: awaitsApproval ? 'pairing' : 'connecting',
    error: null,
    host: same ? store.state.host : null,
  });
  store.attemptedAt = Date.now();
  try {
    const privateKey = preparedKey ?? (same ? previous!.privateKey : await store.deps.rpc.createKeypair());
    store.assertCurrent(epoch);
    // Retain the identity before enrollment: an interrupted approval must not orphan a newly trusted key.
    // Asking for a computer is also how the person asks for it to keep coming back.
    store.saved = {
      pairing: withoutInvite(pairing),
      privateKey,
      host: same ? previous?.host : undefined,
      autoConnect: true,
    };
    await store.deps.storage.write('connection', JSON.stringify(store.saved));
    store.assertCurrent(epoch);
    // A cloud grant lasts minutes and is never saved, so every connection
    // through the relay begins by asking Vibyra Cloud for a fresh one.
    if (pairing.route === 'relay' && !pairing.relayToken) {
      pairing = await refreshRelay(store, pairing);
      store.assertCurrent(epoch);
    }
    const attempt = store.deps.rpc.open(pairing, privateKey);
    // Only a computer this phone already trusts is looked for elsewhere — on
    // this network, then through the cloud — and only once: wherever it
    // answers next is simply where it is now.
    // An explicit Cloud selection stays on the relay even when the computer
    // is also nearby; ordinary reconnects may still return to a direct route.
    const reached =
      same && !relocated && !forceRelay
        ? await reach(store, pairing, attempt)
        : { connected: await attempt };
    if ('moved' in reached) {
      store.assertCurrent(epoch);
      return open(store, reached.moved, true);
    }
    store.assertCurrent(epoch);
    store.saved.deviceId = reached.connected.deviceId;
    const result = await hostSnapshot(store, epoch);
    store.assertCurrent(epoch);
    store.acceptHost(result);
    store.saved.host = result.host;
    // Cache failures cannot take down the connection.
    void rememberProjects(store, store.saved.pairing.hostId, result.projects).catch(() => {});
    await store.deps.storage.write('connection', JSON.stringify(store.saved));
    store.assertCurrent(epoch);
    store.update({ status: 'connected', error: null });
    store.auto.settled();
    // Local chat restoration cannot undo an authenticated connection.
    try {
      await restoreConversation(store);
    } catch {
      if (store.current(epoch))
        store.report(new Error('Connected, but your last chat could not be restored.'));
    }
  } catch (error) {
    if (store.current(epoch)) {
      store.disconnect();
      // Only a computer this phone is already trusted by is worth trying again
      // unasked. A first pairing needs a fresh code, or an owner at the keyboard.
      if (same) store.auto.failed(Date.now() - store.attemptedAt);
      store.update({
        status: 'error',
        host: store.knownHost(),
        error: store.failure(
          error instanceof Error ? error.message : 'The computer could not be reached.',
        ),
      });
    }
    throw error;
  }
}
/** Disconnect persists until the person reconnects. Cancelling a handshake
 *  does not put away a computer that never connected. */
export async function putAway(store: WorkspaceStore) {
  const chosen = store.state.status === 'connected';
  store.auto.stop();
  store.disconnect();
  if (!chosen || !store.saved) return;
  store.saved = { ...store.saved, autoConnect: false };
  await store.deps.storage.write('connection', JSON.stringify(store.saved));
}
export async function forget(store: WorkspaceStore) {
  store.auto.stop();
  store.disconnect();
  store.clearSession();
  store.update({ projects: [], remembered: null, sessions: [], conversationAvailable: false });
  if (store.saved) await forgetRemembered(store, store.saved.pairing.hostId);
  await store.deps.storage.delete('connection');
  store.saved = null;
  store.creates.clear();
  await store.persistCreates();
  await store.deps.storage.delete('pending-creates');
  store.update({ host: null, hostAddress: null, throughCloud: false, error: null });
}
