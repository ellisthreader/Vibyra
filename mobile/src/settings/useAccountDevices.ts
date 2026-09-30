import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AccountDevice, WorkspaceModel } from '../ui/types';
import { settingsAccount } from './whose';

type Loader = () => Promise<AccountDevice[]>;
interface ListState {
  devices: AccountDevice[] | null;
  error: string | null;
  loading: boolean;
}
interface Shared {
  identity: string;
  state: ListState;
  listeners: Set<() => void>;
}
const empty: ListState = { devices: null, error: null, loading: false };
// One list per loader and account, so the home's "N devices" and the Security page read
// the same copy: a device removed on the page leaves the count on the list at once.
const lists = new WeakMap<Loader, Shared>();
function listFor(load: Loader, identity: string) {
  let held = lists.get(load);
  if (!held || held.identity !== identity)
    lists.set(load, (held = { identity, state: empty, listeners: new Set() }));
  return held;
}
function set(shared: Shared, patch: Partial<ListState>) {
  shared.state = { ...shared.state, ...patch };
  shared.listeners.forEach((listener) => listener());
}

/**
 * The places this account is signed in, read again whenever something that shows them
 * mounts. `devices` stays null until the first answer, so a count is never drawn as
 * "0" while it is still loading; a failed reload keeps what was shown and says why.
 * The sample's devices come from its own memory-only loader, so they load here too.
 */
export function useAccountDevices(workspace: WorkspaceModel) {
  const load = workspace.actions.loadAccountDevices;
  const account = settingsAccount(workspace)?.email ?? null;
  const shared = load && account ? listFor(load, account) : null;
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!shared) return () => {};
      shared.listeners.add(listener);
      return () => {
        shared.listeners.delete(listener);
      };
    },
    [shared],
  );
  const read = () => shared?.state ?? empty;
  const state = useSyncExternalStore(subscribe, read, read);
  const reload = useCallback(async () => {
    if (!shared || !load) return;
    set(shared, { loading: true, error: null });
    try {
      const list = await load();
      set(shared, { devices: list, loading: false });
    } catch (reason) {
      set(shared, {
        loading: false,
        error: reason instanceof Error ? reason.message : 'Your devices could not be loaded.',
      });
    }
  }, [shared, load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return {
    ...state,
    reload,
    available: Boolean(shared),
    drop: (id: string) => {
      if (shared)
        set(shared, { devices: shared.state.devices?.filter((item) => item.id !== id) ?? null });
    },
  };
}
