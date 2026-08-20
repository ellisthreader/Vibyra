import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";

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
            onClick={() => void activate(project.id)}
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
    </nav>
  );
}
