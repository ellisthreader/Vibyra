import type { WorkspaceStore } from './WorkspaceStore';
import type { HostState } from './types';

/** Read every bounded frame before publishing the list so an older selected
 * chat is not mistaken for a session that disappeared during a refresh. */
export async function hostSnapshot(store: WorkspaceStore, epoch: number): Promise<HostState> {
  const first = await store.deps.rpc.request<HostState>('host.state');
  store.assertCurrent(epoch);
  const sessions = new Map(first.sessions.map((session) => [session.id, session]));
  const seen = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (seen.has(cursor) || seen.size >= 200)
      throw new Error('The computer returned too much session history.');
    seen.add(cursor);
    const page = await store.deps.rpc.request<Pick<HostState, 'sessions' | 'nextCursor'>>(
      'session.list',
      { cursor, limit: 100 },
    );
    store.assertCurrent(epoch);
    for (const session of page.sessions) sessions.set(session.id, session);
    cursor = page.nextCursor;
  }
  return { ...first, sessions: [...sessions.values()], nextCursor: null };
}
