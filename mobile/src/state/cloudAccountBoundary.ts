import type { WorkspaceStore } from './WorkspaceStore';

/** Cloud admission belongs to an account session. Nearby Noise trust remains
 * independent, so an account change does not tear down an approved LAN socket. */
export async function releaseCloudAccount(store: WorkspaceStore) {
  if (!store.state.throughCloud) return;
  store.auto.stop();
  store.disconnect();
  if (!store.saved) return;
  store.saved = { ...store.saved, autoConnect: false };
  await store.deps.storage.write('connection', JSON.stringify(store.saved));
}
