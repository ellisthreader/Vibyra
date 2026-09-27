import React from "react";
import DeviceIcon from "./DeviceIcon.jsx";

const modes = [
    { id: "code", label: "Code" },
    { id: "agent", label: "Agents" },
];

/** Marketing's Mac window chrome. Traffic lights depict the native controls;
 * actions inside the web demo are passed down by DeviceFrame. */
export default function DeviceChrome({
    mode,
    onMode,
    waiting = false,
    onNewProject,
    onToggleSidebar,
    sidebarOpen = true,
    onToggleDock,
    dockOpen = false,
    onNotifications,
}) {
    return (
        <header className="vdev-chrome">
            <div className="vdev-brand">
                <span className="vdev-traffic-lights" aria-hidden="true"><i /><i /><i /></span>
                {!sidebarOpen && onToggleSidebar && (
                    <button type="button" className="vdev-icon-btn vdev-sidebar-show" onClick={onToggleSidebar} aria-label="Show projects sidebar">
                        <DeviceIcon name="dockCompact" size={17} />
                    </button>
                )}
                <img src="/vibyra-cobalt.png" alt="" width="17" height="17" />
                <span className="vdev-word">vibyra</span>
            </div>
            <div className="vdev-drag">
                <div className="vdev-mode-switch" role="tablist" aria-label="Workspace mode">
                    {modes.map(({ id, label }) => (
                        <button key={id} type="button" role="tab" aria-selected={mode === id}
                            onClick={() => onMode(id)}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="vdev-right">
                {mode === "code" && onNewProject && (
                    <button type="button" className="vdev-icon-btn" aria-label="New project" title="New project" onClick={onNewProject}>
                        <DeviceIcon name="plus" size={17} />
                    </button>
                )}
                {mode === "code" && onToggleDock && (
                    <button type="button" className="vdev-icon-btn" aria-label="Workspace sidebar" title={dockOpen ? "Close sidebar" : "Open sidebar"}
                        aria-expanded={dockOpen} onClick={onToggleDock}>
                        <DeviceIcon name="dockCompact" size={18} />
                    </button>
                )}
                {onNotifications && (
                    <button type="button" className="vdev-icon-btn vdev-bell" aria-label="Notifications" title="Notifications" onClick={onNotifications}>
                        <DeviceIcon name="bell" size={17} />
                        {waiting && <span className="vdev-count">1</span>}
                    </button>
                )}
            </div>
        </header>
    );
}
