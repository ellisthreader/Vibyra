import { useShallow } from "zustand/react/shallow";

import { splitConversationRows } from "../../lib/conversationCards";
import { abbreviateHome, relativeTime } from "../../lib/relativeTime";
import { useConversationTerminals } from "../../state/conversationTerminalStore";
import { useProjectStore } from "../../state/projectStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { ProjectSpec } from "../../types";
import { PlusIcon } from "../common/Icons";
import { ProjectTile } from "../common/ProjectTile";
import { ChatAgentCard, PaneAgentCard } from "./HomeAgentCard";

const SHOWN = 4;

/** The project you were last in, with every agent working in it: its live
 * chats first (newest first), then its running terminals. */
export function HomeSpotlight({ project }: { project: ProjectSpec }) {
  const homeDir = useProjectStore((s) => s.homeDir);
  const sessions = useConversationTerminals((s) => s.sessions);
  const open = useConversationTerminals((s) => s.open);
  const panes = useTerminalStore(useShallow((s) => s.panes.filter((pane) => pane.projectId === project.id && pane.status === "running")));
  const chats = splitConversationRows(sessions.filter((session) => session.projectId === project.id), open).live
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const agents = chats.length + panes.length;
  const shownChats = chats.slice(0, SHOWN);
  const shownPanes = panes.slice(0, SHOWN - shownChats.length);
  const hidden = agents - shownChats.length - shownPanes.length;
  const activate = () => useProjectStore.getState().activate(project.id);
  const facts = [abbreviateHome(project.root, homeDir), agents ? `${agents} ${agents === 1 ? "agent" : "agents"}` : "", project.lastOpenedMs ? `opened ${relativeTime(project.lastOpenedMs)}` : ""];
  return (
    <article className="sb-spot" aria-label={project.name}>
      <header className="sb-spot__head">
        <ProjectTile id={project.id} name={project.name} size={48} />
        <span className="sb-spot__names"><strong>{project.name}</strong><small>{facts.filter(Boolean).join(" · ")}</small></span>
        <button type="button" className="btn sb-spot__new" onClick={() => void activate().then(() => useWorkspaceStore.getState().openAgentPicker())}><PlusIcon size={13} />New chat</button>
        <button type="button" className="btn btn--primary sb-spot__open" onClick={() => void activate()}>Open {project.name}</button>
      </header>
      {agents > 0
        ? <div className="sb-spot__agents">
          {shownChats.map((session) => <ChatAgentCard key={session.id} session={session} />)}
          {shownPanes.map((pane) => <PaneAgentCard key={pane.id} pane={pane} />)}
        </div>
        : <p className="sb-spot__quiet">No agents are running here. Start one with New chat.</p>}
      {hidden > 0 && <button type="button" className="sb-spot__more" onClick={() => void activate()}>{hidden} more in {project.name}</button>}
    </article>
  );
}
