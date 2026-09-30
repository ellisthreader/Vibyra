import type { Session, WorkspaceModel } from './types';

/**
 * The one line a terminal screen says about its state, and the one thing it
 * offers to do about it. Nothing is said while the terminal is simply live
 * and this phone can type: the header already names the computer, and a
 * strip that is always there is soon not read at all.
 */
export interface SessionStatus {
  hidden: boolean;
  text: string;
  tone: 'muted' | 'warning';
  action?: 'reconnect' | 'takeControl';
}

export const typableSession = (session: Pick<Session, 'canInput' | 'readOnly'>) =>
  session.canInput === true || !session.readOnly;

export function describeSession(
  session: Session,
  workspace: Pick<WorkspaceModel, 'status' | 'reconnecting' | 'demo' | 'control' | 'actions'>,
): SessionStatus {
  const quiet: SessionStatus = { hidden: true, text: '', tone: 'muted' };
  if (workspace.demo) return quiet;
  if (workspace.status !== 'connected') {
    return workspace.reconnecting
      ? { hidden: false, text: 'Reconnecting…', tone: 'muted' }
      : {
          hidden: false,
          text: 'Connection paused',
          tone: 'muted',
          action: workspace.actions.reconnect ? 'reconnect' : undefined,
        };
  }
  if (session.status === 'interrupted')
    return { hidden: false, text: 'Interrupted · start a new chat to continue', tone: 'muted' };
  const refusal = typingRefusal(session);
  if (refusal) return { hidden: false, text: refusal, tone: 'warning' };
  if (session.status === 'exited') {
    return {
      hidden: false,
      text: `Ended${session.exitCode === undefined ? '' : ` · exit ${session.exitCode}`}`,
      tone: 'muted',
    };
  }
  if (workspace.control === 'claiming')
    return { hidden: false, text: 'Taking control…', tone: 'muted' };
  if (typableSession(session) && workspace.control !== 'ready') {
    return {
      hidden: false,
      text: 'Viewing live',
      tone: 'muted',
      action: workspace.actions.claimControl ? 'takeControl' : undefined,
    };
  }
  return quiet;
}

/**
 * The strip is the only place a refusal is explained now that there is no box.
 * A Mac that says `canInput: false` has its typing switch off; one that says
 * nothing at all predates the switch and cannot take a phone's typing.
 */
export const typingRefusal = (session: Pick<Session, 'canInput' | 'readOnly'>) =>
  session.canInput === false
    ? 'Typing from your phone is off. Turn it on in Vibyra on your Mac: Settings › iPhone connection.'
    : !typableSession(session)
      ? 'Update Vibyra on your Mac to type from your phone'
      : null;
