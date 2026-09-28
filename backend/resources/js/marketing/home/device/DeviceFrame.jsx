import React, { useRef, useState } from "react";
import DeviceChrome from "./DeviceChrome.jsx";
import DeviceRail from "./DeviceRail.jsx";
import DeviceWorkspace from "./DeviceWorkspace.jsx";
import DeviceDock from "./DeviceDock.jsx";
import DeviceHome from "./DeviceHome.jsx";
import DeviceAgent from "./agent/DeviceAgent.jsx";
import DemoDialog from "./flows/DemoDialog.jsx";
import NewProject from "./flows/NewProject.jsx";
import NewTerminal from "./flows/NewTerminal.jsx";
import Settings from "./flows/Settings.jsx";

/** The marketing workspace follows the installed Mac Code/Agents shell. */
export default function DeviceFrame({ demo }) {
    const [dialog, setDialog] = useState(null);
    const dialogOpener = useRef(null);
    const openDialog = kind => { dialogOpener.current = document.activeElement; setDialog(kind); };
    const code = demo.mode === "code";
    const home = code && demo.project.id === "home";
    const waiting = demo.projects.some((project) => project.sessions.some((session) => session.state === "attention"));
    const openProject = (id) => { demo.setMode("code"); demo.openProject(id); };
    const openSession = (projectId, sessionId) => { openProject(projectId); demo.setSessionId(sessionId); };
    const newTerminal = (projectId) => { if (projectId) openProject(projectId); openDialog("terminal"); };
    return <div className="vdev" data-theme={demo.preferences.theme.toLowerCase()} data-motion={demo.preferences.motion} data-mode={demo.mode} data-tool={demo.tool} data-sidebar-open={demo.sidebarOpen} style={{ "--dock-w": `${demo.dockWidth}px`, "--demo-font-size": `${demo.preferences.fontSize}px`, "--demo-font": demo.preferences.font === "System Mono" ? "ui-monospace, monospace" : "var(--font-mono)" }}>
        <DeviceChrome mode={demo.mode} onMode={demo.setMode} waiting={waiting} onNewProject={() => openDialog("project")} onToggleSidebar={() => demo.setSidebarOpen((open) => !open)} sidebarOpen={demo.sidebarOpen} onToggleDock={() => demo.setDockOpen((open) => !open)} dockOpen={demo.dockOpen} onNotifications={() => openDialog("notifications")} />
        <div className="vdev-shell">
            {code && demo.sidebarOpen && <DeviceRail projects={demo.projects} activeId={demo.project.id} sessionId={demo.sessionId} onOpenProject={openProject} onOpenSession={openSession} onCloseSession={(projectId, sessionId) => demo.closeSession(sessionId, projectId)} onNewProject={() => openDialog("project")} onNewTerminal={newTerminal} onHide={() => demo.setSidebarOpen(false)} remoteConnected={demo.phone === "connected"} remoteStatus={demo.phone === "connected" ? "Sample phone connected" : "No phone connected"} onRemote={() => openDialog("remote")} onSettings={() => openDialog("settings")} />}
            {code ? home ? <DeviceHome projects={demo.projects} onOpen={openProject} onNewProject={() => openDialog("project")} /> : <DeviceWorkspace demo={demo}><DeviceDock demo={demo} /></DeviceWorkspace> : <DeviceAgent agent={demo.agent} />}
        </div>
        {dialog && <DemoDialog returnFocus={dialogOpener.current} title={{ project: "New project", terminal: "New terminal", settings: "Settings", remote: "Settings", notifications: "Notifications" }[dialog]} kind={dialog === "remote" ? "settings" : dialog} onClose={() => setDialog(null)}>
            {dialog === "project" && <NewProject demo={demo} onClose={() => setDialog(null)} />}
            {dialog === "terminal" && <NewTerminal demo={demo} onClose={() => setDialog(null)} />}
            {["settings", "remote"].includes(dialog) && <Settings demo={demo} initialSection={dialog === "remote" ? "Phone" : "General"} />}
            {dialog === "notifications" && <div className="vdev-modal-content"><p>{waiting ? "Gemini CLI needs input in Weekend project." : "You're all caught up."}</p>{waiting && <button type="button" onClick={() => { openProject("weekend"); setDialog(null); }}>Open Weekend project</button>}</div>}
        </DemoDialog>}
    </div>;
}
