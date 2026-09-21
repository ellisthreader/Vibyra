import { useEffect, useState } from 'react';
import { chatRequest } from '../../ipc/sharedChats';
import { useProjectStore } from '../../state/projectStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useWorkspaceStore } from '../../state/workspaceStore';

/** Safe worktrees are independent folders; never label the source repo's diff
 * as the selected terminal's changes. Fall back only when no chat is selected. */
export function useFilesRoot(active = true) {
  const project = useProjectStore(s => s.activeId);
  const source = useWorkspaceStore(s => s.root);
  const focused = useConversationTerminals(s => s.focused);
  const sessions = useConversationTerminals(s => s.sessions);
  const selected = sessions.find(s => s.id === focused && s.projectId === project);
  const pane = useTerminalStore(s => s.panes.find(p => p.id === s.focusedId && p.projectId === project));
  const [folder, setFolder] = useState<{id: string; root: string | null; error: string} | null>(null);
  useEffect(() => {
    if (!selected || !active) return;
    let alive = true;
    void chatRequest<{workingDirectory: string}>('conversation.status', {sessionId: selected.id})
      .then(status => { if (alive) setFolder({id:selected.id, root:status.workingDirectory, error:''}); })
      .catch(error => { if (alive) setFolder({id:selected.id, root:null, error:String(error)}); });
    return () => { alive = false; };
  }, [selected?.id, project, active]);
  if (selected) return {root: folder?.id === selected.id ? folder.root : null, error: folder?.id === selected.id ? folder.error : '', title: selected.title};
  return {root:pane?.resumeCwd ?? pane?.sourceCwd ?? source, error:'', title:pane?.title ?? 'Project'};
}
