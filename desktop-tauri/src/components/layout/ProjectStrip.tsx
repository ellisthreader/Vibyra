import { lazy, Suspense, useCallback, useState } from "react";

import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { ProjectMenuTarget } from "../projects/ProjectActions";

const ProjectActions = lazy(() => import("../projects/ProjectActions")
  .then((module) => ({ default: module.ProjectActions })));

function HomeGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20z" />
    </svg>
  );
}

/** Discord-style project tiles on the far-left edge. */
export function ProjectStrip() {
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const activate = useProjectStore((s) => s.activate);
  const goHome = useProjectStore((s) => s.goHome);
  const projects = useProjects();
  const panes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const pickAndCreate = useProjectStore((s) => s.pickAndCreate);
  const [menu, setMenu] = useState<ProjectMenuTarget | null>(null);

  const dismissMenu = useCallback(() => setMenu(null), []);
  const openMenu = (project: (typeof projects)[number], button: HTMLButtonElement, y: number) => {
    const rect = button.getBoundingClientRect();
    setMenu({ project, anchor: { x: rect.right + 7, y } });
  };

  const needsAttention = (projectId: string) =>
    panes.some((p) => p.projectId === projectId && activity[p.id] === "attention");

  return (
    <nav className="pstrip" aria-label="Projects">
      <button
        className={`pstrip__tile pstrip__tile--home ${view === "home" ? "pstrip__tile--active" : ""}`}
        data-tip="Home"
        onClick={goHome}
      >
        <HomeGlyph />
      </button>
      <span className="pstrip__sep" />
      <div className="pstrip__list">
        {projects.map((project, index) => (
          <button
            key={project.id}
            className={`pstrip__tile pstrip__tile--project ${
              view === "project" && activeId === project.id ? "pstrip__tile--active" : ""
            }`}
            style={{ "--tile-c": project.color } as React.CSSProperties}
            data-tip={`${project.name}${index < 9 ? `  ·  Ctrl+Shift+${index + 1}` : ""}`}
            aria-haspopup="menu"
            aria-expanded={menu?.project.id === project.id}
            onClick={() => void activate(project.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu(project, event.currentTarget, event.clientY);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu(project, event.currentTarget, rect.top + 8);
            }}
          >
            {project.name.charAt(0).toUpperCase()}
            {needsAttention(project.id) && <span className="pstrip__badge" />}
          </button>
        ))}
      </div>
      <span className="pstrip__sep" />
      <button className="pstrip__tile pstrip__tile--add" data-tip="New project" onClick={() => void pickAndCreate()}>
        ＋
      </button>
      {menu && <Suspense fallback={null}><ProjectActions key={menu.project.id} target={menu} onClose={dismissMenu} /></Suspense>}
    </nav>
  );
}
