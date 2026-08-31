import { abbreviateHome, relativeTime } from "../../lib/relativeTime";
import { useProjectStore } from "../../state/projectStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { ProjectSpec } from "../../types";

export function HomeProjectCard({ project }: { project: ProjectSpec }) {
  const activate = useProjectStore((state) => state.activate);
  const homeDir = useProjectStore((state) => state.homeDir);
  const openAgentPicker = useWorkspaceStore((state) => state.openAgentPicker);
  const allPanes = useTerminalStore((state) => state.panes);
  const panes = allPanes.filter((pane) => pane.projectId === project.id);
  const activity = useTerminalStore((state) => state.activity);

  const working = panes.filter((pane) => activity[pane.id] === "working").length;
  const waiting = panes.filter((pane) => activity[pane.id] === "attention").length;
  const sleeping = panes.filter((pane) => pane.visibility === "hibernated").length;
  const latest = [...panes].sort((left, right) => right.lastFocusedAt - left.lastFocusedAt)[0];
  const status = [] as string[];
  if (working) status.push(`${working} working`);
  if (waiting) status.push(`${waiting} waiting`);
  if (sleeping) status.push(`${sleeping} sleeping`);
  if (panes.length > 0 && status.length === 0) status.push(`${panes.length} idle`);

  return (
    <div
      className={`hcard ${waiting > 0 ? "hcard--attn" : ""}`}
      style={{ "--hc": project.color } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={() => void activate(project.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void activate(project.id);
      }}
    >
      <div className="hcard__top">
        <span className="hcard__mono">{project.name.charAt(0).toUpperCase()}</span>
        <span className="hcard__names">
          <strong>{project.name}</strong>
          <small>{abbreviateHome(project.root, homeDir)}</small>
        </span>
        <span className="hcard__tools" onClick={(event) => event.stopPropagation()}>
          <button
            className="icon-btn"
            title={`New agent in ${project.name}`}
            onClick={() => void activate(project.id).then(openAgentPicker)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </span>
      </div>
      <div className="hcard__agents">
        {panes.slice(0, 6).map((pane) => (
          <span
            key={pane.id}
            className={`adot adot--${
              pane.status === "exited"
                ? "exited"
                : pane.visibility === "hibernated"
                  ? "sleeping"
                  : (activity[pane.id] ?? "idle")
            }`}
          />
        ))}
        <span className="hcard__status">{panes.length === 0 ? "no agents yet" : status.join(" · ")}</span>
      </div>
      <div className="hcard__last">
        {latest
          ? // A session saved before Vibyra recorded when it was written has
            // no timestamp, and dating it to the epoch reads as "20687d ago".
            `${paneLabel(latest)}${latest.lastFocusedAt > 0 ? ` · ${relativeTime(latest.lastFocusedAt)}` : ""}`
          : "open it and launch an agent"}
      </div>
    </div>
  );
}
