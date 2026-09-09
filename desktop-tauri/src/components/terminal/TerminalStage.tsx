import { useEffect, useRef, useState } from "react";
import { BotIcon } from "../common/Icons";
import { LaunchSettingsPanel } from "../rail/LaunchSettings";
import { gridColumns } from "../../lib/gridLayout";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { TerminalPaneCard } from "./TerminalPaneCard";

function EmptyState({ projectName }: { projectName: string }) {
  return (
    <div className="grid-empty">
      <span className="workspace-launcher__icon"><BotIcon size={28} /></span>
      <h2>Start something in {projectName}</h2>
      <p>Choose a model and open your first terminal.</p>
      <div className="workspace-launcher"><LaunchSettingsPanel /></div>
      <span className="workspace-launcher__hint">Your project, chats and layout stay together.</span>
    </div>
  );
}

export function TerminalStage() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const allPanes = useTerminalStore((state) => state.panes);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const project = projects.find((entry) => entry.id === activeId);
  const panes = allPanes.filter((pane) => pane.projectId === activeId);
  const zoomed = zoomedId === null ? undefined : panes.find((pane) => pane.id === zoomedId);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Infinity);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const columns = zoomed ? 1 : gridColumns(panes.length, width);

  return (
    <div ref={host} className="workspace__body terminal-stage">
      {panes.length === 0 ? (
        <EmptyState projectName={project?.name ?? "This project"} />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))" }}
        >
          {panes.map((pane) => (
            <TerminalPaneCard
              key={pane.id}
              pane={pane}
              hidden={zoomed !== undefined && pane.id !== zoomed.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
