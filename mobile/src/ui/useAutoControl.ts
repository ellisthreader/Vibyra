import { useEffect, useRef } from 'react';
import { typableSession } from './sessionState';
import type { Session, WorkspaceModel } from './types';

/**
 * Takes the terminal when it becomes typable while it is open.
 *
 * Opening a session already claims it. This covers the Mac's switch being
 * turned on with the phone watching: `host.changed` refreshes the session
 * with `canInput: true`, and the box should appear without a reconnect or a
 * button. Only a change is acted on — the state at mount was the store's to
 * handle — so a claim another phone refused is not retried on every render.
 */
export function useAutoControl(session: Session, workspace: WorkspaceModel) {
  const key = `${session.id}:${session.canInput}:${session.readOnly}`;
  const seen = useRef(key);
  const claim = workspace.actions.claimControl;
  const ready = workspace.status === 'connected' && !workspace.demo && session.status === 'running' && !workspace.syncing;
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (!ready || !claim || workspace.control !== 'readonly' || !typableSession(session)) return;
    void claim().catch(() => {});
  }, [key, ready, claim, workspace.control, session]);
}
