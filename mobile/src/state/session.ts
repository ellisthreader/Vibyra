import type { WorkspaceStore } from './WorkspaceStore';
import { OutputLedger, type Snapshot } from './output';
import { conversationGeneration, loadConversation } from './conversationSession';
import { rememberConversation } from './conversationContinuity';

const grid = (frame: Snapshot) => Number.isInteger(frame.cols) && Number.isInteger(frame.rows) && frame.cols! > 0 && frame.rows! > 0
  ? { cols: frame.cols!, rows: frame.rows! } : null;
/** Whether this phone may type here: the computer said so, or it is a Host that never refuses. */
export const typable = (store: WorkspaceStore, id: string | null) => {
  const target = store.state.sessions.find(item => item.id === id);
  return target !== undefined && (target.canInput === true || !target.readOnly);
};

export async function selectSession(store: WorkspaceStore, id: string | null, takeControl = false) {
  const previous = store.lease;
  store.clearSession();
  if (previous && store.state.status === 'connected') {
    void store.deps.rpc.request('session.release', { sessionId: previous.sessionId, lease: previous.lease }).catch(() => {});
  }
  if (!id) { rememberConversation(store, null); return; }
  if (store.state.status !== 'connected' || !store.state.sessions.some(item => item.id === id)) {
    store.report(new Error('This session is not available on the connected computer.')); return;
  }
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const current = () => store.current(epoch) && selected === store.selectionEpoch;
  const structured = store.state.sessions.find(item => item.id === id)?.runner === 'conversation';
  rememberConversation(store, structured ? id : null);
  const ledger = new OutputLedger(id); store.ledger = ledger;
  store.update({ selectedSessionId: id, syncing: true, error: null });
  try {
    if (structured) {
      await loadConversation(store, id);
      if (!current()) return;
      store.update({ control: 'readonly' });
      if ((takeControl || typable(store, id)) && store.state.conversation?.processState === 'running') await claimControl(store);
      return;
    }
    const result = await store.deps.rpc.request<Snapshot>('session.snapshot', { sessionId: id });
    if (!current()) return;
    ledger.snapshot(result);
    store.update({ output: ledger.output, hostGrid: grid(result), sessions: store.state.sessions.map(item => item.id === id
      ? { ...item, status: result.status } : item) });
    if (result.status === 'running') {
      store.update({ control: 'readonly' });
      // Typing is the point of opening a terminal on a phone, so a session
      // that will accept it is taken the moment it opens rather than behind a
      // button. Only a failure — another phone already typing here — leaves
      // it watching, with the reason where the person can act on it.
      let claimed = false;
      if (takeControl || typable(store, id)) {
        claimed = await claimControl(store).then(() => true, error => { if (takeControl) throw error; return false; });
        if (!current()) return;
      }
      // Nothing else hands this session the phone's grid. xterm reports a size
      // only when it just changed one, so opening a second terminal at the
      // same phone size would leave it laying out for the computer's width.
      if (!claimed && store.dimensions) await resize(store, ...store.dimensions);
    }
  } catch (error) { if (current()) { store.update({ control: 'readonly' }); store.report(error); } }
  finally { if (current()) store.update({ syncing: false }); }
}
// A resync says the computer's replay buffer moved past the last byte we read,
// so the offsets no longer line up. It does not say the session changed, and it
// does not invalidate a lease. Re-reading the snapshot in place keeps the
// terminal on screen and control where it was; routing this through
// `selectSession` cleared `output` to an empty string first, so a busy agent
// blanked the phone several times a second and threw the scrollback away each
// time. Frames that arrive mid-fetch queue in the new ledger and replay once
// the snapshot lands.
export async function resnapshotSession(store: WorkspaceStore) {
  const id = store.state.selectedSessionId;
  if (!id || store.state.status !== 'connected') return;
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const ledger = new OutputLedger(id); store.ledger = ledger;
  const current = () => store.current(epoch) && selected === store.selectionEpoch && store.ledger === ledger;
  try {
    const result = await store.deps.rpc.request<Snapshot>('session.snapshot', { sessionId: id });
    if (!current()) return;
    ledger.snapshot(result);
    store.update({ output: ledger.output, hostGrid: grid(result), sessions: store.state.sessions.map(item => item.id === id
      ? { ...item, status: result.status } : item) });
  } catch (error) { if (current()) store.report(error); }
}
/** The computer's own grid changed under the open terminal: a Mac pane was
 *  resized. The phone draws whatever grid the Mac has, so it only takes note. */
export async function hostResized(store: WorkspaceStore, data: { cols?: number; rows?: number }) {
  const size = grid({ cols: data.cols, rows: data.rows } as Snapshot);
  if (size) store.update({ hostGrid: size });
}
export async function claimControl(store: WorkspaceStore) {
  // `readOnly` and "cannot type" stopped being the same thing when the desktop
  // gained a typing switch: a shared Mac terminal still refuses to be browsed,
  // stopped or created, yet can accept keystrokes. Test the newer field
  // strictly, so a computer that predates it is still treated as watch-only.
  const target = store.state.sessions.find(item => item.id === store.state.selectedSessionId);
  if (target?.readOnly && target.canInput !== true) {
    // A Mac that answers `false` has the switch and has it off; say where it is.
    throw new Error(target.canInput === false
      ? 'Typing from your phone is off. This desktop connection is view-only until you turn it on in Vibyra on your Mac: Settings > iPhone connection.'
      : 'This desktop connection is view-only. Control this terminal on your Mac.');
  }
  const sessionId = store.state.selectedSessionId;
  if (!sessionId || store.state.status !== 'connected' || !conversationGeneration(store)) {
    throw new Error('Load the terminal before taking control.');
  }
  if (store.state.control === 'claiming') throw new Error('Control is being requested.');
  // Already held: the session was taken on opening, and asking again would
  // only mint the same lease a second time.
  if (store.state.control === 'ready' && store.lease?.sessionId === sessionId) return;
  const epoch = store.epoch; const selected = store.selectionEpoch;
  const current = () => store.current(epoch) && selected === store.selectionEpoch;
  store.update({ control: 'claiming' });
  let acquired: { lease: string; generation: string } | undefined;
  try {
    acquired = await store.deps.rpc.request('session.claim', { sessionId });
    if (!current() || acquired!.generation !== conversationGeneration(store)) {
      if (store.current(epoch)) void store.deps.rpc.request('session.release', { sessionId, lease: acquired!.lease }).catch(() => {});
      if (!current()) return;
      throw new Error('The session restarted. Refresh the terminal before taking control.');
    }
    store.lease = { sessionId, ...acquired! }; store.update({ control: 'ready', error: null });
    if (store.dimensions && store.state.sessions.find(item => item.id === sessionId)?.runner !== 'conversation') await resize(store, ...store.dimensions);
  } catch (error) { if (current()) { store.lease = null; store.update({ control: 'readonly' }); } throw error; }
}
export function requireLease(store: WorkspaceStore) {
  const { lease } = store;
  if (store.state.status !== 'connected' || !lease || lease.sessionId !== store.state.selectedSessionId ||
      lease.generation !== conversationGeneration(store) || store.state.control !== 'ready') {
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
  // A Mac pane keeps the Mac's own grid. The person is working in that pane,
  // and shrinking it to a phone's ~46 columns broke the display in front of
  // them; the phone draws the Mac's grid and zooms it instead, so its own
  // width is never sent there. A Host's terminals exist for this phone, and
  // those are told — under the lease, since a Host rejects a resize without one.
  const target = store.state.sessions.find(item => item.id === store.state.selectedSessionId);
  if (!target || target.readOnly || store.state.control !== 'ready') return;
  const lease = requireLease(store);
  await store.deps.rpc.request('session.resize', { ...lease, cols, rows });
}
