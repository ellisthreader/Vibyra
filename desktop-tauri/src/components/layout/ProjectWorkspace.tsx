import { type CSSProperties, useEffect } from "react";

import { setTerminalVisibility } from "../../ipc/terminal";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { Companion } from "../companion/Companion";
import { TerminalStage } from "../terminal/TerminalStage";


export function ProjectWorkspace({ active = true }: { active?: boolean }) {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const companionOpen = useWorkspaceStore((state) => state.companionOpen);
  const companionSize = useWorkspaceStore((state) => state.companionSize);
  const companionWidth = useWorkspaceStore((state) => state.companionWidth);
  const toolsVisible = companionOpen;
  const terminalsVisible = active && !(toolsVisible && companionSize === "full");
  const project = projects.find((entry) => entry.id === activeId);

  useEffect(() => {
    if (!activeId) return;
    const visibility = terminalsVisible ? "visible" : "hidden";
    const store = useTerminalStore.getState();
    const candidates = store.panes.filter(
      (pane) =>
        pane.projectId === activeId &&
        pane.status === "running" &&
        pane.visibility !== "hibernated" &&
        pane.visibility !== visibility,
    );
    for (const pane of candidates) {
      void setTerminalVisibility(pane.id, visibility).catch(() => {});
    }
    if (candidates.length) {
      useTerminalStore.setState((state) => ({
        panes: state.panes.map((pane) =>
          candidates.some((candidate) => candidate.id === pane.id)
            ? { ...pane, visibility }
            : pane,
        ),
      }));
    }
  }, [activeId, terminalsVisible]);

  if (!project || !activeId) return null;


  return (
    <main className="workspace project-workspace" data-tools={toolsVisible ? companionSize : "closed"}
      style={{ "--tools-reserve": companionSize === "wide" ? "55%" : `${companionWidth}px` } as CSSProperties}>
      <div className="project-mode-stack">
        <section
          id="project-terminal-panel"
          role="tabpanel"
          className={"project-mode-panel " + (terminalsVisible ? "project-mode-panel--active" : "")}
          aria-hidden={!terminalsVisible}
        >
          <TerminalStage active={terminalsVisible} />
        </section>

      </div>
      <Companion key={activeId} active={active} />
    </main>
  );
}
