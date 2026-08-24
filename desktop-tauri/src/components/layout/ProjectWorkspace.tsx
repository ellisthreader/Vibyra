import { type KeyboardEvent, useEffect, useRef } from "react";

import { setTerminalVisibility } from "../../ipc/terminal";
import {
  applyProjectVisibility,
  projectRuntimeTransitions,
  syncProjectVisibility,
} from "../../lib/projectTransitions";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { type ProjectMode, useWorkspaceStore } from "../../state/workspaceStore";
import { PreviewModeIcon, TerminalModeIcon } from "../preview/PreviewIcons";
import { PreviewWorkspace } from "../preview/PreviewWorkspace";
import { TerminalStage } from "../terminal/TerminalStage";

export function ProjectWorkspace() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const mode = useWorkspaceStore((state) => state.projectMode);
  const companionOpen = useWorkspaceStore((state) => state.companionOpen);
  const panes = useTerminalStore((state) => state.panes);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const terminalTab = useRef<HTMLButtonElement>(null);
  const previewTab = useRef<HTMLButtonElement>(null);
  const project = projects.find((entry) => entry.id === activeId);
  const projectPanes = panes.filter((pane) => pane.projectId === activeId);
  const live = projectPanes.filter(
    (pane) => pane.status === "running" && pane.visibility !== "hibernated",
  ).length;

  useEffect(() => {
    if (!activeId) return;
    let current = true;
    void projectRuntimeTransitions.run(async () => {
      const project = useProjectStore.getState();
      const workspace = useWorkspaceStore.getState();
      if (
        !current ||
        project.view !== "project" ||
        project.activeId !== activeId ||
        workspace.projectMode !== mode
      ) {
        return new Map();
      }
      return syncProjectVisibility(
        useTerminalStore.getState().panes,
        mode === "terminals" ? activeId : null,
        setTerminalVisibility,
      );
    }).then((applied) => {
      if (!current || applied.size === 0) return;
      useTerminalStore.setState((state) => ({
        panes: applyProjectVisibility(state.panes, applied),
      }));
    });
    return () => {
      current = false;
    };
  }, [activeId, mode]);

  if (!project || !activeId) return null;

  const selectMode = (next: ProjectMode) => {
    useWorkspaceStore.getState().setProjectMode(next);
  };

  const handleModeKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: ProjectMode,
  ) => {
    let next: ProjectMode | null = null;
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      next = current === "terminals" ? "preview" : "terminals";
    } else if (event.key === "Home") {
      next = "terminals";
    } else if (event.key === "End") {
      next = "preview";
    }
    if (!next) return;
    event.preventDefault();
    selectMode(next);
    window.requestAnimationFrame(() => {
      (next === "terminals" ? terminalTab : previewTab).current?.focus();
    });
  };

  return (
    <main className="workspace project-workspace">
      <header className="project-modebar">
        <nav className="project-modes" role="tablist" aria-label="Project workspace mode">
          <button
            ref={terminalTab}
            role="tab"
            aria-selected={mode === "terminals"}
            aria-controls="project-terminal-panel"
            tabIndex={mode === "terminals" ? 0 : -1}
            className={mode === "terminals" ? "project-mode--active" : ""}
            onClick={() => selectMode("terminals")}
            onKeyDown={(event) => handleModeKey(event, "terminals")}
          >
            <TerminalModeIcon />
            Terminals
          </button>
          <button
            ref={previewTab}
            role="tab"
            aria-selected={mode === "preview"}
            aria-controls="project-preview-panel"
            tabIndex={mode === "preview" ? 0 : -1}
            className={mode === "preview" ? "project-mode--active" : ""}
            onClick={() => selectMode("preview")}
            onKeyDown={(event) => handleModeKey(event, "preview")}
          >
            <PreviewModeIcon />
            Preview
          </button>
        </nav>
        <span className="project-modebar__context">
          {mode === "terminals"
            ? projectPanes.length
              ? projectPanes.length + " session" + (projectPanes.length === 1 ? "" : "s") + " · " + live + " live"
              : project.root
            : "Browser preview · local only"}
        </span>
        <span className="project-modebar__spacer" />
        {mode === "terminals" && zoomedId !== null && (
          <button
            className="chip"
            onClick={() => useTerminalStore.getState().toggleZoom(zoomedId)}
          >
            Exit zoom
          </button>
        )}
        {mode === "terminals" && (
          <button
            className={"icon-btn " + (companionOpen ? "icon-btn--active" : "")}
            title={companionOpen ? "Hide side panel" : "Show side panel"}
            aria-label={companionOpen ? "Hide side panel" : "Show side panel"}
            onClick={() => useWorkspaceStore.getState().toggleCompanion()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M15 4v16" />
            </svg>
          </button>
        )}
      </header>
      <div className="project-mode-stack">
        <section
          id="project-terminal-panel"
          role="tabpanel"
          className={"project-mode-panel " + (mode === "terminals" ? "project-mode-panel--active" : "")}
          aria-hidden={mode !== "terminals"}
        >
          <TerminalStage active={mode === "terminals"} />
        </section>
        {mode === "preview" && (
          <section
            id="project-preview-panel"
            role="tabpanel"
            className="project-mode-panel project-mode-panel--active"
          >
            <PreviewWorkspace key={activeId} projectId={activeId} root={project.root} />
          </section>
        )}
      </div>
    </main>
  );
}
