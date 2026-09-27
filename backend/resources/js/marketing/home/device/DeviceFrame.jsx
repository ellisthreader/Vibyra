import React, { useEffect, useState } from "react";
import DeviceChrome from "./DeviceChrome.jsx";
import DeviceRail from "./DeviceRail.jsx";
import DeviceWorkspace from "./DeviceWorkspace.jsx";
import DeviceDock from "./DeviceDock.jsx";
import DeviceHome from "./DeviceHome.jsx";
import DeviceAgent from "./agent/DeviceAgent.jsx";
import DeviceIcon from "./DeviceIcon.jsx";
import { agents, logoPath } from "../agents.js";

const terminalAgents = [...agents.filter((agent) => ["claude", "codex", "gemini"].includes(agent.id)), { id: "terminal", name: "Terminal" }];

function DemoDialog({ kind, demo, onClose }) {
    const [name, setName] = useState("");
    const [section, setSection] = useState("General");
    useEffect(() => {
        const onKey = (event) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    const submitProject = (event) => { event.preventDefault(); if (demo.newProject(name)) onClose(); };
    const title = { project: "New project", terminal: "New terminal", settings: "Settings", remote: "Remote", notifications: "Notifications" }[kind];
    return <div className="vdev-modal-backdrop" onMouseDown={onClose}>
        <section className="vdev-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
            <header><h2>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}>×</button></header>
            {kind === "project" && <form onSubmit={submitProject}><p>Create a project in this sample workspace.</p><label>Project name<input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="My project" /></label><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="vdev-modal-primary" disabled={!name.trim()}>Create project</button></footer></form>}
            {kind === "terminal" && <div className="vdev-modal-content"><p>Choose a terminal for {demo.project.name}.</p><div className="vdev-modal-agents">{terminalAgents.map((agent) => <button key={agent.id} type="button" onClick={() => { demo.startAgent(agent); onClose(); }}>{agent.logo ? <img src={logoPath(agent)} alt="" width="20" height="20" /> : <DeviceIcon name="terminal" size={20} />}{agent.name}<span>Launch</span></button>)}</div></div>}
            {kind === "settings" && <div className="vdev-modal-settings"><nav aria-label="Settings sections">{["General", "AI", "Workspace", "Remote", "Notifications", "Privacy", "About"].map((item) => <button key={item} type="button" className={section === item ? "is-active" : ""} onClick={() => setSection(item)}>{item}</button>)}</nav><div><h3>{section}</h3><p>This is a sample of Vibyra's settings. Open the Mac app to change your real preferences.</p></div></div>}
            {kind === "remote" && <div className="vdev-modal-content"><p>No phone connected to this sample workspace.</p><p>Remote connects the desktop app to your phone for project access.</p></div>}
            {kind === "notifications" && <div className="vdev-modal-content"><p>{demo.projects.some((project) => project.sessions.some((session) => session.state === "attention")) ? "Gemini CLI needs input in Weekend project." : "You're all caught up."}</p><button type="button" onClick={() => { demo.openProject("weekend"); demo.setMode("code"); onClose(); }}>Open Weekend project</button></div>}
        </section>
    </div>;
}

/** The marketing workspace follows the installed Mac Code/Agents shell. */
export default function DeviceFrame({ demo }) {
    const [dialog, setDialog] = useState(null);
    const code = demo.mode === "code";
    const home = code && demo.project.id === "home";
    const waiting = demo.projects.some((project) => project.sessions.some((session) => session.state === "attention"));
    const openProject = (id) => { demo.setMode("code"); demo.openProject(id); };
    const openSession = (projectId, sessionId) => { openProject(projectId); demo.setSessionId(sessionId); };
    const newTerminal = (projectId) => { if (projectId) openProject(projectId); setDialog("terminal"); };
    return <div className="vdev" data-mode={demo.mode} data-tool={demo.tool} data-sidebar-open={demo.sidebarOpen} style={{ "--dock-w": `${demo.dockWidth}px` }}>
        <DeviceChrome mode={demo.mode} onMode={demo.setMode} waiting={waiting} onNewProject={() => setDialog("project")} onToggleSidebar={() => demo.setSidebarOpen((open) => !open)} sidebarOpen={demo.sidebarOpen} onToggleDock={() => demo.setDockOpen((open) => !open)} dockOpen={demo.dockOpen} onNotifications={() => setDialog("notifications")} />
        <div className="vdev-shell">
            {code && demo.sidebarOpen && <DeviceRail projects={demo.projects} activeId={demo.project.id} sessionId={demo.sessionId} onOpenProject={openProject} onOpenSession={openSession} onCloseSession={(projectId, sessionId) => demo.closeSession(sessionId, projectId)} onNewProject={() => setDialog("project")} onNewTerminal={newTerminal} onHide={() => demo.setSidebarOpen(false)} onRemote={() => setDialog("remote")} onSettings={() => setDialog("settings")} />}
            {code ? home ? <DeviceHome projects={demo.projects} onOpen={openProject} onNewProject={() => setDialog("project")} /> : <DeviceWorkspace demo={demo}><DeviceDock demo={demo} /></DeviceWorkspace> : <DeviceAgent agent={demo.agent} />}
        </div>
        {dialog && <DemoDialog kind={dialog} demo={demo} onClose={() => setDialog(null)} />}
    </div>;
}
