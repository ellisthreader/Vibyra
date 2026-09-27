import type { Session } from './types';

/** Store selection can lag navigation. Never borrow a terminal from another folder. */
export function projectSession(
  sessions: readonly Session[],
  projectId: string | null,
  focusedSessionId: string | null,
  selectedSessionId: string | null,
): Session | undefined {
  const id = focusedSessionId ?? selectedSessionId;
  return sessions.find(session => session.id === id && session.projectId === projectId);
}
