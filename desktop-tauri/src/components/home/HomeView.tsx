import { relativeTime } from "../../lib/relativeTime";
import { useProjectStore } from "../../state/projectStore";
import { useAccountStore } from "../../state/accountStore";
import { openNewProject } from "../../state/newProject";
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
  const accountName = useAccountStore((s) => s.snapshot.profile?.name);
  const activate = useProjectStore((s) => s.activate);
  const pickAndCreate = useProjectStore((s) => s.pickAndCreate);
  const panes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const setFocus = useTerminalStore((s) => s.setFocus);
  const working = panes.filter((p) => p.status === "running" && activity[p.id] === "working").length;
  const waiting = panes.filter((p) => p.status === "running" && activity[p.id] === "attention");
  const ordered = [...projects].sort((a, b) => b.lastOpenedMs - a.lastOpenedMs);
  const recents = [...panes].sort((a, b) => b.lastFocusedAt - a.lastFocusedAt).slice(0, 4);
  const name = accountName?.trim().split(/\s+/)[0] ?? "";
  return (
    <main className="homeview">
      <div className="homeview__inner">
        <header className="homeview__hero">
          <div className="homeview__hi">
          <span className="homeview__eyebrow">{greeting()}</span>
          <h1>{name ? projects.length ? "Welcome back," : "Welcome home," : "Welcome to"}<br /><span>{name || "Vibyra"}.</span></h1>
          {working > 0 && <p>{working} {working === 1 ? "agent is" : "agents are"} working.</p>}
          <div className="homeview__actions">
            <button className="btn btn--primary" data-welcome-focus onClick={openNewProject}><PlusIcon size={16} />New project<ChevronIcon size={14} /></button>
            <button className="btn homeview__open" onClick={() => void pickAndCreate()}><FolderIcon size={16} />Open a folder</button>
          </div>
          </div>
        </header>
        {waiting.length > 0 && <button className="homeview__attn" onClick={() => void activate(waiting[0].projectId).then(() => setFocus(waiting[0].id))}>
          {waiting.length} {waiting.length === 1 ? "chat needs" : "chats need"} your attention <ChevronIcon size={14} />
        </button>}
        {recents.length > 0 && (
          <section className="home-recents" aria-label="Recent chats">
            <div className="home-section-head"><h2>Pick up the thread</h2><span>Recent chats</span></div>
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
        {ordered.length > 0 ? <section className="home-projects" aria-label="Your projects">
          <div className="home-section-head"><h2>Projects <span className="home-section-count">{projects.length}</span></h2>
            <span>A place for everything you’re making</span>
          </div>
          <HomeLaunchBar />
          <div className="hcards">{ordered.map((project) => <HomeProjectCard key={project.id} project={project} />)}</div>
        </section> : <section className="home-begin" aria-label="Getting started">
          <span className="home-begin__number" aria-hidden="true">01</span>
          <div><h2>Every great project starts somewhere.</h2><p>Create something new, or open a folder you already love working in.</p></div>
          <span className="home-begin__line" aria-hidden="true" />
        </section>}
      </div>
    </main>
  );
}
