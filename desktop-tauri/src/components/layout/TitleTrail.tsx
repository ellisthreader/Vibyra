import { useConversationTerminals } from "../../state/conversationTerminalStore";
import { useProductMode } from "../../state/productModeStore";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTeammateFocus } from "../../state/teammateFocusStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";

function Trail({ parts }: { parts: string[] }) {
  return <nav className="title-trail" aria-label="Location">
    {parts.map((part, index) => <span key={`${index}:${part}`} className="title-trail__part">
      {index > 0 && <span className="title-trail__sep" aria-hidden="true">›</span>}
      {index === parts.length - 1 ? <b>{part}</b> : <span>{part}</span>}
    </span>)}
  </nav>;
}

/** Where you are, on the left of the title bar: Home, a project and the
 * terminal it is showing full size, or the teammate open in Agents. */
export function TitleTrail() {
  const mode = useProductMode((s) => s.mode);
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const project = useProjects().find((item) => item.id === activeId);
  const zoomedPane = useTerminalStore((s) => s.panes.find((pane) => pane.id === s.zoomedId));
  const zoomedChat = useConversationTerminals((s) => s.sessions.find((session) => session.id === s.zoomed));
  const teammate = useTeammateFocus((s) => s.trail);
  if (mode === "agent") return <Trail parts={teammate ? ["Agents", teammate] : ["Agents"]} />;
  if (view === "new-project") return <Trail parts={["New project"]} />;
  if (view === "needs-you") return <Trail parts={["Needs you"]} />;
  if (view !== "project" || !project) return <Trail parts={["Home"]} />;
  const focus = zoomedPane ? paneLabel(zoomedPane) : zoomedChat?.title || "Terminals";
  return <Trail parts={[project.name, focus]} />;
}
