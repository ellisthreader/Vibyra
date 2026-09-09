import { useState } from "react";
import { abbreviateHome, relativeTime } from "../../lib/relativeTime";
import { useProjectStore } from "../../state/projectStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { ProjectSpec } from "../../types";
import { CloseIcon, PlusIcon } from "../common/Icons";

export function HomeProjectCard({ project }: { project: ProjectSpec }) {
  const activate = useProjectStore((s) => s.activate);
  const remove = useProjectStore((s) => s.remove);
  const homeDir = useProjectStore((s) => s.homeDir);
  const openAgentPicker = useWorkspaceStore((s) => s.openAgentPicker);
  const allPanes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const [confirming, setConfirming] = useState(false);
  const panes = allPanes.filter((p) => p.projectId === project.id);
  const waiting = panes.filter((p) => p.status === "running" && activity[p.id] === "attention").length;
  const working = panes.filter((p) => p.status === "running" && activity[p.id] === "working").length;
  const saved = panes.filter((p) => p.status === "suspended").length;
  const status = waiting ? `${waiting} need attention` : working ? `${working} working` : saved ? `${saved} saved ${saved === 1 ? "chat" : "chats"}` : panes.length ? `${panes.length} ${panes.length === 1 ? "terminal" : "terminals"}` : "Ready to start";
  return (
    <article className={`hcard ${waiting ? "hcard--attn" : ""}`} onMouseLeave={() => setConfirming(false)}>
      <button className="hcard__open" onClick={() => void activate(project.id)} aria-label={`Open ${project.name}`}>
        <span className="hcard__mono" style={{ "--hc": project.color } as React.CSSProperties}>{project.name.charAt(0).toUpperCase()}</span>
        <span className="hcard__names"><strong>{project.name}</strong><small title={project.root}>{abbreviateHome(project.root, homeDir)}</small></span>
        <span className="hcard__status">{working > 0 && <span className="adot adot--working" />}{status}</span>
        <span className="hcard__last">{project.lastOpenedMs ? relativeTime(project.lastOpenedMs) : "New"}</span>
      </button>
      <div className="hcard__tools">
        <button className="icon-btn" title={`New terminal in ${project.name}`} aria-label={`New terminal in ${project.name}`} onClick={() => void activate(project.id).then(openAgentPicker)}><PlusIcon size={15} /></button>
        <button className={`icon-btn ${confirming ? "icon-btn--danger" : ""}`} title={confirming ? "Remove from Vibyra? Your folder stays on disk." : "Remove project"} aria-label={confirming ? `Confirm removing ${project.name}` : `Remove ${project.name}`} onClick={() => { if (confirming) void remove(project.id); else setConfirming(true); }}>{confirming ? <span className="hcard__confirm">Sure?</span> : <CloseIcon size={14} />}</button>
      </div>
    </article>
  );
}
