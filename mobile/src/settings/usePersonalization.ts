import { useEffect, useSyncExternalStore } from 'react';
import type { WorkspaceModel } from '../ui/types';
import type { PreferencesApi } from '../vibes/preferencesApi';
import { Personalization, personalizationRows, type PersonalizationState } from './personalization';

// One copy per client and person, so the home rows and the pages agree, and signing
// in as someone else never shows the last person's memories for a frame.
const stores = new WeakMap<PreferencesApi, { identity: string; store: Personalization }>();
function storeFor(api: PreferencesApi, identity: string) {
  const held = stores.get(api);
  if (held?.identity === identity) return held.store;
  const store = new Personalization(api);
  stores.set(api, { identity, store });
  return store;
}
const idle = () => () => {};
const nothing: PersonalizationState = {
  status: 'signedOut',
  preferences: null,
  memories: null,
  limit: 50,
  problem: null,
  error: null,
  busy: null,
  savedAt: null,
  savedField: null,
};
const none = () => nothing;

/**
 * Personality and Memory for whoever the sheet belongs to. The sample workspace
 * brings its own client that keeps everything in memory (`demo/samplePreferences`),
 * so the pages can be tried there and nothing is kept. `load` asks again — the home
 * list does it each time the sheet opens. The rows are always there; with nobody to
 * ask for they simply have no value, and the page offers the sign-in.
 */
export function usePersonalization(workspace: WorkspaceModel, load = false) {
  const api = workspace.preferences;
  const store = api
    ? storeFor(api, workspace.demo ? 'sample' : (workspace.account?.email ?? 'guest'))
    : null;
  const state = useSyncExternalStore(
    store ? store.subscribe : idle,
    store ? store.snapshot : none,
    store ? store.snapshot : none,
  );
  useEffect(() => {
    if (store && (load || store.state.status === 'idle')) void store.load();
  }, [store, load]);
  return { store, state, rows: personalizationRows(state) };
}
