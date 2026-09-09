import { relativeTime } from "../../lib/relativeTime";
import { basename, useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import { AgentMark } from "../common/AgentMark";
import { ChevronIcon, FolderIcon, PlusIcon } from "../common/Icons";
import { HomeLaunchBar } from "./HomeLaunchBar";
import { HomeProjectCard } from "./HomeProjectCard";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function HomeView() {
  const projects = useProjects();
  const homeDir = useProjectStore((s) => s.homeDir);
  const activate = useProjectStore((s) => s.activate);
  const pickAndCreate = useProjectStore((s) => s.pickAndCreate);
  const panes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const setFocus = useTerminalStore((s) => s.setFocus);
  const working = panes.filter((p) => p.status === "running" && activity[p.id] === "working").length;
  const waiting = panes.filter((p) => p.status === "running" && activity[p.id] === "attention");
  const ordered = [...projects].sort((a, b) => b.lastOpenedMs - a.lastOpenedMs);
  const recents = [...panes].sort((a, b) => b.lastFocusedAt - a.lastFocusedAt).slice(0, 4);
  const rawName = basename(homeDir);
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : "";
  return (
    <main className="homeview">
      <div className="homeview__inner">
        <header className="homeview__hi">
          <span className="homeview__eyebrow">Your workspace</span>
          <h1>{greeting()}{name ? `, ${name}` : ""}.</h1>
          <p>{working ? `${working} ${working === 1 ? "agent is" : "agents are"} working. Pick up where you left off.` : "Open a project or continue a recent chat."}</p>
        </header>
        {waiting.length > 0 && <button className="homeview__attn" onClick={() => void activate(waiting[0].projectId).then(() => setFocus(waiting[0].id))}>
          {waiting.length} {waiting.length === 1 ? "chat needs" : "chats need"} your attention <ChevronIcon size={14} />
        </button>}
        {recents.length > 0 && (
          <section className="home-recents" aria-label="Recent chats">
            <div className="home-section-head"><h2>Continue working</h2><span>Your recent chats</span></div>
            <div className="home-recents__grid">
              {recents.map((pane) => {
                const project = projects.find((p) => p.id === pane.projectId);
                const state = pane.status === "suspended" ? "Saved" : pane.status === "exited" ? "Ended" : activity[pane.id] === "working" ? "Working" : "Open";
                return (
                  <button key={pane.id} className="home-recent" onClick={() => void activate(pane.projectId).then(() => setFocus(pane.id))}>
                    <span className="home-recent__top"><AgentMark agentId={pane.agentId} name={pane.title} accent={pane.accent} size={24} /><span className={`home-recent__state ${state === "Working" ? "home-recent__state--live" : ""}`}>{state}</span></span>
                    <strong className="home-recent__label">{paneLabel(pane)}</strong>
                    <span className="home-recent__project">{project?.name ?? "Project"}</span>
                    <span className="home-recent__bottom"><span>{pane.lastFocusedAt ? relativeTime(pane.lastFocusedAt) : "Previous session"}</span><ChevronIcon size={14} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <section className="home-projects" aria-label="Your projects">
          <div className="home-section-head"><h2>Projects <span className="home-section-count">{projects.length}</span></h2>
            <button className="btn" onClick={() => void pickAndCreate()}><PlusIcon size={14} /> Open folder</button>
          </div>
          <HomeLaunchBar />
          {ordered.length ? <div className="hcards">{ordered.map((project) => <HomeProjectCard key={project.id} project={project} />)}</div> : (
            <div className="home-empty"><FolderIcon size={32} /><h2>Make room for your next idea.</h2><p>Open a project folder to bring your code, AI chats and preview into one workspace.</p><button className="btn btn--primary" onClick={() => void pickAndCreate()}><PlusIcon size={15} /> Open your first project</button></div>
          )}
        </section>
      </div>
    </main>
  );
}
