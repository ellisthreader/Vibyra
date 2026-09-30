import type { SharedSession } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useProjectStore } from '../../state/projectStore';

/** Open conversations appear in the rail; saved rows live in the project menu's history dialog. */
export function ConversationTerminalRows({ sessions, saved = false, onOpen }: { sessions: SharedSession[]; saved?: boolean; onOpen?(): void }) {
  const store = useConversationTerminals();
  return <>{sessions.map(session =>
    <button key={session.id} className={`pstrip__row ${store.focused === session.id ? 'pstrip__row--active' : ''}`}
      title={`${session.title} · ${saved ? 'Saved output' : 'Live'}`}
      onClick={() => { if (useProjectStore.getState().activeId !== session.projectId) void useProjectStore.getState().activate(session.projectId); store.reveal(session.id); onOpen?.(); }}>
      <span className={`pstrip__dot ${session.status === "running" ? "pstrip__dot--working" : ""}`} aria-label={session.status} /><span className="pstrip__name">{session.title}</span>
      {saved && <span className="pstrip__trail pstrip__trail--rest">
        <span className="pstrip__dot pstrip__dot--sleeping" aria-label="Saved terminal" /></span>}
    </button>)}</>;
}
