import logoUrl from "../../assets/vibyra-cobalt.png";
import { relativeTime } from "../../lib/relativeTime";
import { basename, useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import { HomeLaunchBar } from "./HomeLaunchBar";
import { HomeProjectCard } from "./HomeProjectCard";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ownerName(homeDir: string): string {
  const raw = basename(homeDir);
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

export function HomeView() {
  const projects = useProjects();
  const homeDir = useProjectStore((state) => state.homeDir);
  const pickAndCreate = useProjectStore((state) => state.pickAndCreate);
  const panes = useTerminalStore((state) => state.panes);
  const activity = useTerminalStore((state) => state.activity);
  const setFocus = useTerminalStore((state) => state.setFocus);
  const working = panes.filter((pane) => activity[pane.id] === "working").length;
  const waiting = panes.filter((pane) => activity[pane.id] === "attention");
  const busyProjects = new Set(
    panes.filter((pane) => activity[pane.id] === "working").map((pane) => pane.projectId),
  ).size;
  const ordered = [...projects].sort((left, right) => right.lastOpenedMs - left.lastOpenedMs);
  const recents = panes
    .filter((pane) => pane.status === "running")
    .sort((left, right) => right.lastFocusedAt - left.lastFocusedAt)
    .slice(0, 3);
  const summary = working > 0
    ? `${working} agent${working === 1 ? "" : "s"} working across ${busyProjects} project${busyProjects === 1 ? "" : "s"}`
    : panes.length > 0
      ? `${panes.length} session${panes.length === 1 ? "" : "s"} idle`
      : "Quiet in here — open a project to put agents to work.";

  return (
    <main className="homeview">
      <div className="homeview__inner">
        <header className="homeview__hi">
          <img className="homeview__logo" src={logoUrl} alt="" />
          <h1>{greeting()}{ownerName(homeDir) ? `, ${ownerName(homeDir)}` : ""}</h1>
          <p>
            {summary}
            {waiting.length > 0 ? (
              <button
                className="homeview__attn"
                onClick={() => {
                  const pane = waiting[0];
                  void useProjectStore.getState().activate(pane.projectId)
                    .then(() => setFocus(pane.id));
                }}
              >
                {waiting.length === 1
                  ? `${paneLabel(waiting[0])} is waiting for you`
                  : `${waiting.length} agents are waiting for you`}
              </button>
            ) : null}
          </p>
        </header>

        <HomeLaunchBar />

        {ordered.length > 0 ? (
          <div className="hcards">
            {ordered.map((project) => <HomeProjectCard key={project.id} project={project} />)}
            <button className="hcard hcard--new" onClick={() => void pickAndCreate()}>
              <span className="hcard__plus">＋</span>
              <strong>New project</strong>
              <small>pick a folder — it remembers everything</small>
            </button>
          </div>
        ) : (
          <div className="home-empty">
            <h2>Projects are the spine of Vibyra</h2>
            <p>
              Each project keeps its own agents, files, memory and chat. Add your first one —
              agents will launch straight into its folder.
            </p>
            <button className="btn btn--primary" onClick={() => void pickAndCreate()}>
              ＋ Add your first project
            </button>
          </div>
        )}

        {recents.length > 0 ? (
          <div className="home-recents">
            <span className="section-label">Continue where you left off</span>
            {recents.map((pane) => {
              const project = projects.find((candidate) => candidate.id === pane.projectId);
              return (
                <button
                  key={pane.id}
                  className="home-recent"
                  onClick={() => void useProjectStore.getState().activate(pane.projectId)
                    .then(() => setFocus(pane.id))}
                >
                  <span
                    className="launch__mono"
                    style={{ "--hc": project?.color ?? "var(--accent)" } as React.CSSProperties}
                  >
                    {(project?.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="home-recent__label">{paneLabel(pane)}</span>
                  <span className="home-recent__time">{relativeTime(pane.lastFocusedAt)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}
