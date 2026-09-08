import type { WorkspaceStore } from './WorkspaceStore';
import { OutputLedger, type Snapshot } from './output';

export async function selectSession(store: WorkspaceStore, id: string | null, takeControl = false) {
  const previous = store.lease;
  store.clearSession();
  if (previous && store.state.status === 'connected') {
    void store.deps.rpc.request('session.release', { sessionId: previous.sessionId, lease: previous.lease }).catch(() => {});
  }
  if (!id) return;
  if (store.state.status !== 'connected' || !store.state.sessions.some(item => item.id === id)) {
    store.report(new Error('This session is not available on the connected computer.')); return;
  }
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const current = () => store.current(epoch) && selected === store.selectionEpoch;
  const ledger = new OutputLedger(id); store.ledger = ledger;
  store.update({ selectedSessionId: id, syncing: true, error: null });
  try {
    const result = await store.deps.rpc.request<Snapshot>('session.snapshot', { sessionId: id });
    if (!current()) return;
    ledger.snapshot(result);
    store.update({ output: ledger.output, sessions: store.state.sessions.map(item => item.id === id
      ? { ...item, status: result.status } : item) });
    if (result.status === 'running') {
      store.update({ control: 'readonly' });
      if (takeControl) await claimControl(store);
    }
  } catch (error) { if (current()) { store.update({ control: 'readonly' }); store.report(error); } }
  finally { if (current()) store.update({ syncing: false }); }
}
export async function claimControl(store: WorkspaceStore) {
  const sessionId = store.state.selectedSessionId;
  if (!sessionId || store.state.status !== 'connected' || !store.ledger?.generation) {
    throw new Error('Load the terminal before taking control.');
  }
  if (store.state.control === 'claiming') throw new Error('Control is being requested.');
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const current = () => store.current(epoch) && selected === store.selectionEpoch;
  store.update({ control: 'claiming' });
  let acquired: { lease: string; generation: string } | undefined;
  try {
    acquired = await store.deps.rpc.request('session.claim', { sessionId });
    if (!current() || acquired!.generation !== store.ledger?.generation) {
      if (store.current(epoch)) void store.deps.rpc.request('session.release', { sessionId, lease: acquired!.lease }).catch(() => {});
      if (!current()) return;
      throw new Error('The session restarted. Refresh the terminal before taking control.');
    }
    store.lease = { sessionId, ...acquired! }; store.update({ control: 'ready', error: null });
    if (store.dimensions) await resize(store, ...store.dimensions);
  } catch (error) { if (current()) { store.lease = null; store.update({ control: 'readonly' }); } throw error; }
}
export function requireLease(store: WorkspaceStore) {
  const { lease } = store;
  if (store.state.status !== 'connected' || !lease || lease.sessionId !== store.state.selectedSessionId ||
      lease.generation !== store.ledger?.generation || store.state.control !== 'ready') {
    throw new Error('Take control of this session before sending input.');
  }
  if (store.state.sessions.find(item => item.id === lease.sessionId)?.status !== 'running') {
    throw new Error('This session has stopped. Start a new session to continue.');
  }
  return lease;
}
export async function resize(store: WorkspaceStore, cols: number, rows: number) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 500 || rows > 200) return;
  store.dimensions = [cols, rows];
  if (store.state.control !== 'ready') return;
  const lease = requireLease(store);
  await store.deps.rpc.request('session.resize', { ...lease, cols, rows });
}
