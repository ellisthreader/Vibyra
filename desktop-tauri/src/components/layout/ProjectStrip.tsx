import { keyLabel } from "../../lib/platform";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { FolderIcon, GearIcon, PlusIcon } from "../common/Icons";
import { Rail } from "./Rail";

/** One stable navigation column for projects and the current project's chats. */
export function ProjectStrip() {
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const activate = useProjectStore((s) => s.activate);
  const goHome = useProjectStore((s) => s.goHome);
  const projects = useProjects();
  const panes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const pickAndCreate = useProjectStore((s) => s.pickAndCreate);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  return (
    <aside className="pstrip" aria-label="Workspace navigation">
      <nav className="pstrip__primary" aria-label="Workspace">
        <button className={`pstrip__row ${view === "home" ? "pstrip__row--active" : ""}`}
          aria-current={view === "home" ? "page" : undefined} onClick={goHome}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="m3 10 9-7 9 7v10H3Z M9 20v-7h6v7" />
          </svg>
          Home
        </button>
      </nav>
      <div className="pstrip__scroll">
        <div className="pstrip__heading">
          <span>Projects</span>
          <button className="icon-btn" aria-label="Add project" title="Add project" onClick={() => void pickAndCreate()}><PlusIcon size={16} /></button>
        </div>
        <nav className="pstrip__list" aria-label="Projects">
          {projects.map((project, index) => {
            const selected = view === "project" && activeId === project.id;
            const attention = panes.some((p) => p.projectId === project.id && activity[p.id] === "attention");
            return (
              <button key={project.id} className={`pstrip__row ${selected ? "pstrip__row--active" : ""}`}
                aria-current={selected ? "page" : undefined}
                title={`${project.root}${index < 9 ? ` · ${keyLabel(`Mod+Shift+${index + 1}`)}` : ""}`}
                onClick={() => void activate(project.id)}>
                <FolderIcon size={16} />
                <span className="pstrip__name">{project.name}</span>
                {attention && <span className="pstrip__badge" aria-label="Needs your attention" />}
              </button>
            );
          })}
        </nav>
        {projects.length === 0 && <button className="pstrip__row" onClick={() => void pickAndCreate()}><PlusIcon size={16} /> Open a folder</button>}
        {view === "project" && activeId && <Rail />}
      </div>
      <footer className="pstrip__footer">
        <button className="pstrip__row" onClick={openSettings}><GearIcon size={17} /> Settings <kbd>{keyLabel("Mod+,")}</kbd></button>
      </footer>
    </aside>
  );
}
