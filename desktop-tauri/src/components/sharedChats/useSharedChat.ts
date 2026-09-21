import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ConversationLedger } from '../../../../mobile/src/state/conversationLedger';
import type { ConversationEvent } from '../../../../mobile/src/state/conversationTypes';
import { chatRequest, type ConversationSnapshot } from '../../ipc/sharedChats';
import { sendPrompt } from './delivery';
export function useSharedChat(sessionId: string, active = true) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const locked = useRef(false);
  const latest = useRef<ConversationSnapshot | null>(null);
  const alive = useRef(true);
  // Hidden panes are still mounted: a send finishing in Terminal/Preview must
  // release the Chat busy state and preserve its delivery result.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const previous = latest.current;
    if (previous) {
      const version = await chatRequest<{ cursor: number; generation: string }>('conversation.events', { sessionId, afterCursor: previous.cursor });
      if (version.cursor === previous.cursor && version.generation === previous.generation) {
        if (alive.current) setConnected(true);
        return;
      }
    }
    const next = await chatRequest<ConversationSnapshot>('conversation.snapshot', { sessionId });
    if (alive.current && (!latest.current || latest.current.generation !== next.generation || latest.current.cursor < next.cursor)) { latest.current = next; setSnapshot(next); }
    if (alive.current) setConnected(true);
  }, [sessionId]);
  useEffect(() => {
    if (!active) return;
    let polling = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(); } catch (e) { if (alive.current) { setError(String(e)); setConnected(false); } }
      if (polling) timer = setTimeout(poll, latest.current?.processState !== "running" ? 10000 : latest.current?.turnState === "running" ? 2000 : 5000);
    };
    void poll();
    return () => { polling = false; clearTimeout(timer); };
  }, [refresh, active]);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let unlisten: (() => void) | undefined;
    void listen<{ event: string; data: ConversationEvent }>('shared-chat-event', ({ payload }) => {
      if (disposed || (payload.data?.sessionId && payload.data.sessionId !== sessionId)) return;
      const previous = latest.current;
      if (payload.event !== 'conversation.updated' || !previous) { void refresh().catch(() => {}); return; }
      try {
        const ledger = new ConversationLedger(sessionId, previous.projectId); ledger.value = previous;
        if (ledger.push(payload.data) && ledger.value) { latest.current = ledger.value; setSnapshot(ledger.value); setConnected(true); }
      } catch { void refresh().catch(() => {}); }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, [active, refresh, sessionId]);
  const run = async (work: () => Promise<unknown>) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try { await work(); await refresh().catch(e => { if (alive.current) { setError(String(e)); setConnected(false); } }); return true; }
    catch (e) { if (alive.current) setError(String(e)); return false; }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  return { snapshot, error, busy, connected, run, send: (text: string, sendAsText = false, attachments: string[] = []) => run(() => sendPrompt(sessionId, text, sendAsText, attachments)) };
}
