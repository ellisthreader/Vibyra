import { useState } from 'react';
import { useDialogFocus } from '../teammates/useDialogFocus';
import { useProjectStore } from '../../state/projectStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { splitConversationRows } from '../../lib/conversationCards';
import { ConversationTerminalRows } from '../rail/ConversationTerminalRows';

/** Chats the engine still holds from earlier runs in the active project. The
 * navigation column's footer is Remote and Settings only, so this opens from
 * the command palette instead of a menu under the projects. */
export function SavedHistory() {
  const active = useProjectStore(s => s.activeId);
  const sessions = useConversationTerminals(s => s.sessions);
  const cards = useConversationTerminals(s => s.open);
  const [query, setQuery] = useState('');
  const close = () => useWorkspaceStore.getState().setHistoryOpen(false);
  const dialog = useDialogFocus(true, close);
  const saved = splitConversationRows(sessions.filter(s => s.projectId === active), cards).earlier;
  const shown = saved.filter(s => s.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="focus-dialog-backdrop">
    <section className="focus-dialog" ref={node => { dialog.current = node; }} role="dialog" aria-modal="true" aria-label="Saved history">
      <header><h2>Saved history</h2><button onClick={close}>Done</button></header>
      <input autoFocus aria-label="Search saved history" placeholder="Search history…" value={query} onChange={e => setQuery(e.target.value)} />
      <ConversationTerminalRows sessions={shown} saved onOpen={close} />
      {!saved.length && <p>No saved conversations in this project.</p>}
    </section>
  </div>;
}
