import { useProjectStore } from "../../state/projectStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { PlusIcon } from "../common/Icons";
import { SessionList } from "../rail/SessionList";

export function Rail() {
  const activeId = useProjectStore((s) => s.activeId);
  const openAgentPicker = useWorkspaceStore((s) => s.openAgentPicker);
  const hasSessions = useTerminalStore((s) => s.panes.some((pane) => pane.projectId === activeId));
  return (
    <section className="sidebar-sessions" aria-label="Project terminals">
      <div className="pstrip__heading">
        <span>Terminals</span>
        <button className="icon-btn" aria-label="New terminal" title="New terminal" onClick={openAgentPicker}><PlusIcon size={16} /></button>
      </div>
      {hasSessions ? <SessionList /> : <p className="sidebar-sessions__empty">Your chats will appear here.</p>}
    </section>
  );
}
