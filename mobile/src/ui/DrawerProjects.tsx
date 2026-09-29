import { computerAgents } from './agents';
import type { IconName } from './primitives';
import type { RailState } from './RailRow';
import type { Session, WorkspaceModel } from './types';

export const sessionKindLabel = (session: Session) =>
  session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude' : 'Codex';

/** One glyph per agent, everywhere a session is drawn: the rail, a project's
 *  sheet and the session's own details all name the same thing the same way. */
export const sessionIcon = (session: Session): IconName =>
  computerAgents.find((agent) => agent.kind === session.kind)?.icon ?? 'terminal-outline';

/**
 * What a terminal is doing, in the one vocabulary the app's dots use. Waiting on
 * you outranks working: the open conversation says so through its turn state
 * (a question or a permission is pending), and that is the moment worth a glance.
 * A stopped terminal is one that ended short; a finished one shows nothing.
 */
export function terminalState(
  session: Session,
  workspace: Pick<WorkspaceModel, 'selectedSessionId' | 'conversation'>,
): RailState {
  const waiting =
    session.id === workspace.selectedSessionId && workspace.conversation?.turnState === 'waiting';
  if (waiting) return 'input';
  return session.status === 'running'
    ? 'running'
    : session.status === 'interrupted'
      ? 'stopped'
      : null;
}
export const stateWords = (state: RailState) =>
  state === 'input'
    ? 'Needs your input'
    : state === 'running'
      ? 'Working'
      : state === 'stopped'
        ? 'Stopped'
        : 'Finished';

const rank = (session: Session) => (session.status === 'running' ? 0 : 1);

/** The terminals in one project, in the one order the app uses for them: live
 *  first, then the most recent, so the one you are likely to want leads — in the
 *  rail, on the Projects page and in a project's sheet alike. */
export const sessionsInProject = (sessions: Session[], projectId: string) =>
  sessions
    .filter((session) => session.projectId === projectId)
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));

/** How many terminals a project holds, and how many are running, in words. */
export function terminalWords(sessions: Session[]) {
  const running = sessions.filter((session) => session.status === 'running').length;
  if (sessions.length === 0) return 'no terminals';
  return `${sessions.length} ${sessions.length === 1 ? 'terminal' : 'terminals'}${running ? `, ${running} running` : ''}`;
}
