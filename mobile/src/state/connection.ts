import { refreshAccount, restoreAccount, restoreOnboarding } from '../account/accountActions';
import { parsePairing, type Pairing } from '../transport/pairing';
import type { WorkspaceStore } from './WorkspaceStore';
import type { HostState, SavedConnection } from './types';
import { restoreConversation } from './conversationContinuity';

function withoutInvite(pairing: Pairing): Pairing {
  const { invite: _invite, expiresAt: _expires, ...remembered } = pairing; return remembered;
}
export async function initialize(store: WorkspaceStore) {
  const epoch = store.epoch;
  try {
    const [value, theme, creates, account] = await Promise.all([store.deps.storage.read('connection'),
      store.deps.storage.read('theme'), store.deps.storage.read('pending-creates'), store.deps.storage.read('account'),
      restoreOnboarding(store)]);
    if (!store.current(epoch)) return;
    if (theme === 'light' || theme === 'dark' || theme === 'system') store.update({ themePreference: theme });
    store.creates.restore(creates);
    await restoreAccount(store, account); void refreshAccount(store);
    if (!value) return;
    const saved = JSON.parse(value) as SavedConnection;
    saved.pairing = parsePairing(JSON.stringify(saved.pairing));
    if (!/^[a-f0-9]{64}$/.test(saved.privateKey)) throw new Error('Saved connection could not be read. Pair your computer again.');
    store.saved = saved;
    store.update({ host: saved.host ?? { id: saved.pairing.hostId, name: saved.pairing.name, platform: 'Computer' } });
  } catch (error) { if (store.current(epoch)) store.report(error); }
}
export async function connect(store: WorkspaceStore, link: string) {
  const pairing = parsePairing(link);
  if (['connecting', 'pairing'].includes(store.state.status)) throw new Error('A connection is already in progress.');
  await open(store, pairing);
}
export async function reconnect(store: WorkspaceStore) {
  if (!store.saved) throw new Error('Pair your computer before reconnecting.');
  if (['connecting', 'pairing'].includes(store.state.status)) throw new Error('A connection is already in progress.');
  await open(store, withoutInvite(store.saved.pairing));
}
async function open(store: WorkspaceStore, pairing: Pairing) {
  store.disconnect();
  const epoch = store.epoch;
  const previous = store.saved;
  const same = previous?.pairing.hostId === pairing.hostId && previous.pairing.publicKey === pairing.publicKey;
  if (!same) { store.clearSession(); store.update({ projects: [], sessions: [], conversationAvailable: false }); }
  // A nearby connection carries no invitation, but a computer that has not seen
  // this phone before still holds it while its owner approves.
  const awaitsApproval = Boolean(pairing.invite || pairing.nearby) && !same;
  store.update({ status: awaitsApproval ? 'pairing' : 'connecting', error: null, host: null });
  try {
    const privateKey = same ? previous!.privateKey : await store.deps.rpc.createKeypair();
    store.assertCurrent(epoch);
    // Retain the identity before enrollment: an interrupted approval must not orphan a newly trusted key.
    store.saved = { pairing: withoutInvite(pairing), privateKey, host: same ? previous?.host : undefined };
    await store.deps.storage.write('connection', JSON.stringify(store.saved));
    store.assertCurrent(epoch);
    const connected = await store.deps.rpc.open(pairing, privateKey);
    store.assertCurrent(epoch); store.saved.deviceId = connected.deviceId;
    const result = await store.deps.rpc.request<HostState>('host.state');
    store.assertCurrent(epoch); store.acceptHost(result);
    store.saved.host = result.host;
    await store.deps.storage.write('connection', JSON.stringify(store.saved));
    store.assertCurrent(epoch); store.update({ status: 'connected', error: null });
    await restoreConversation(store);
  } catch (error) {
    if (store.current(epoch)) {
      store.disconnect(); store.update({ status: 'error', host: store.saved?.host ?? {
        id: pairing.hostId, name: pairing.name, platform: 'Computer',
      } }); store.report(error);
    }
    throw error;
  }
}
export async function forget(store: WorkspaceStore) {
  store.disconnect();
  store.clearSession(); store.update({ projects: [], sessions: [], conversationAvailable: false });
  await store.deps.storage.delete('connection');
  store.saved = null; store.creates.clear(); await store.persistCreates();
  await store.deps.storage.delete('pending-creates'); store.update({ host: null, error: null });
}
