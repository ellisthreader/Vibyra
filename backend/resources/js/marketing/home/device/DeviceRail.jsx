import React, { useEffect, useState } from "react";
import DeviceIcon from "./DeviceIcon.jsx";

const dotClass = {
    working: "vdev-dot-working",
    attention: "vdev-dot-attention",
    idle: "vdev-dot-idle",
};

function RemoteIcon() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.2-1.2" />
    </svg>;
}

/** A single project tree, mirroring the installed Mac's Code navigation. */
export default function DeviceRail({
    projects = [], activeId, sessionId,
    onOpenProject, onOpenSession, onCloseSession,
    onNewProject, onNewTerminal, onHide, onRemote, onSettings,
    remoteStatus = "No phone connected", remoteConnected = false,
}) {
    const [expanded, setExpanded] = useState({});
    useEffect(() => {
        if (activeId && activeId !== "home") {
            setExpanded((current) => ({ ...current, [activeId]: true }));
        }
    }, [activeId]);

    return (
        <aside className="vdev-rail" aria-label="Workspace navigation">
            <div className="vdev-project-heading">
                <span>Projects</span>
                <span className="vdev-heading-actions">
                    {onNewProject && <button type="button" className="vdev-icon-btn" aria-label="New project" title="New project" onClick={onNewProject}><DeviceIcon name="plus" size={17} /></button>}
                    {onHide && <button type="button" className="vdev-icon-btn" aria-label="Hide projects sidebar" title="Hide projects sidebar" onClick={onHide}><DeviceIcon name="close" size={15} /></button>}
                </span>
            </div>
            <div className="vdev-rail-scroll">
                {projects.map((project) => {
                    const sessions = project.sessions ?? [];
                    const open = sessions.length > 0 && Boolean(expanded[project.id]);
                    return <section key={project.id} className="vdev-project" aria-label={project.name}>
                        <button type="button" className={`vdev-project-row${activeId === project.id ? " is-active" : ""}`}
                            aria-expanded={sessions.length ? open : undefined}
                            onClick={() => {
                                if (sessions.length) setExpanded((current) => ({ ...current, [project.id]: activeId !== project.id ? true : !open }));
                                if (activeId !== project.id || !sessions.length) onOpenProject?.(project.id);
                            }}>
                            <span className="vdev-project-name">{project.name}</span>
                            {sessions.length > 0 && <>
                                <DeviceIcon name="chevron" size={12} className={`vdev-project-chevron${open ? " is-open" : ""}`} />
                                <span className="vdev-project-count">{sessions.length}</span>
                            </>}
                        </button>
                        {open && <div className="vdev-project-sessions">
                            {sessions.map((session) => <div key={session.id} className={`vdev-session-row${activeId === project.id && sessionId === session.id ? " is-active" : ""}`}>
                                <button type="button" className="vdev-session-open" aria-current={activeId === project.id && sessionId === session.id ? "true" : undefined}
                                    onClick={() => onOpenSession?.(project.id, session.id)}>
                                    <span className={`vdev-dot ${dotClass[session.state] ?? dotClass.idle}`} />
                                    <span className="vdev-session-name">{session.label}</span>
                                </button>
                                {onCloseSession && <button type="button" className="vdev-icon-btn vdev-session-close" aria-label={`Close ${session.label}`} title={`Close ${session.label}`}
                                    onClick={() => onCloseSession(project.id, session.id)}><DeviceIcon name="close" size={12} /></button>}
                            </div>)}
                            {onNewTerminal && <button type="button" className="vdev-session-new" aria-label={`New terminal in ${project.name}`} onClick={() => onNewTerminal(project.id)}>
                                <span className="vdev-session-mark"><DeviceIcon name="plus" size={14} /></span>New terminal
                            </button>}
                        </div>}
                    </section>;
                })}
                {!projects.length && <p className="vdev-rail-quiet">Add a workspace to get started.</p>}
            </div>
            <footer className="vdev-rail-footer">
                {onRemote && <button type="button" className="vdev-footer-row" onClick={onRemote} aria-label={`Remote, ${remoteStatus}`}>
                    <RemoteIcon />
                    <span className="vdev-remote-copy"><span>Remote</span><small>{remoteStatus}</small></span>
                    <span className={`vdev-remote-dot${remoteConnected ? " is-connected" : ""}`} aria-hidden="true" />
                </button>}
                {onSettings && <button type="button" className="vdev-footer-row" onClick={onSettings}>
                    <DeviceIcon name="gear" size={16} /><span>Settings</span><kbd>⌘,</kbd>
                </button>}
            </footer>
        </aside>
    );
}
