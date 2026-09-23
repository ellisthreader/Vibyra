import { useEffect, useRef, useState } from 'react';
import type { WorkspaceModel } from '../ui/types';
import type { NotificationDestination } from './api';
import { subscribeNotificationNavigation } from './navigation';
/** Keep a computer target while the person reconnects, without taking control or approving anything. */
export function useNotificationNavigation(
  workspace: WorkspaceModel,
  account: string | null,
  routes: {
    close(): void;
    mode(mode: 'work' | 'agent'): void;
    chat(id: string): void;
    work(): void;
    computers(): void;
  },
) {
  const [requestedAgent, setRequestedAgent] = useState<{ id: string; nonce: number }>();
  const pending = useRef<NotificationDestination | null>(null);
  const live = useRef({ workspace, routes });
  live.current = { workspace, routes };
  useEffect(() => {
    pending.current = null;
    setRequestedAgent(undefined);
    if (!account || workspace.demo) return;
    return subscribeNotificationNavigation((d) => {
      const { workspace: w, routes: r } = live.current;
      r.close();
      pending.current = null;
      if (d.source === 'cloud_turn' && d.agentId) {
        r.mode('agent');
        setRequestedAgent({ id: d.agentId, nonce: Date.now() });
      } else if (d.source === 'cloud_turn' && d.chatId) {
        r.mode('work');
        r.chat(d.chatId);
      } else if (d.hostId && d.sessionId) {
        r.mode('work');
        if (
          w.status === 'connected' &&
          d.hostId === w.host?.id &&
          w.sessions.some((s) => s.id === d.sessionId)
        ) {
          w.actions.selectSession(d.sessionId);
          r.work();
        } else {
          pending.current = d;
          r.computers();
        }
      }
    });
  }, [account, workspace.demo]);
  useEffect(() => {
    const d = pending.current;
    if (
      d &&
      workspace.status === 'connected' &&
      workspace.host?.id === d.hostId &&
      workspace.sessions.some((s) => s.id === d.sessionId)
    ) {
      pending.current = null;
      workspace.actions.selectSession(d.sessionId!);
      live.current.routes.work();
    }
  }, [workspace.status, workspace.host?.id, workspace.sessions, workspace.actions]);
  return requestedAgent;
}
