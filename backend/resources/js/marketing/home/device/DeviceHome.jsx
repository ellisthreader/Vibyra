import React from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import { tileColors } from "./demoData.js";

// The app's home view: a greeting and the projects you can open.
export default function DeviceHome({ projects, onOpen, onNewProject }) {
    return (
        <main className="vdev-workspace vdev-homeview">
            <div className="vdev-homeview-inner">
                <img src="/vibyra-cobalt.png" alt="" width="40" height="32" className="vdev-homeview-logo" />
                <h2>Good to see you.</h2>
                <p>Open a project to pick up where its agents left off.</p>
                <div className="vdev-hcards">
                    {projects.map((project, index) => {
                        const busy = project.sessions.filter((session) => session.state !== "idle").length;
                        return (
                            <button
                                key={project.id}
                                type="button"
                                className="vdev-hcard"
                                style={{ "--tile-c": tileColors[index % tileColors.length] }}
                                onClick={() => onOpen(project.id)}
                            >
                                <span className="vdev-hcard-tile">{project.name.charAt(0).toUpperCase()}</span>
                                <strong>{project.name}</strong>
                                <small>
                                    {project.sessions.length} terminal{project.sessions.length === 1 ? "" : "s"}
                                    {busy ? ` · ${busy} active` : ""}
                                </small>
                            </button>
                        );
                    })}
                    <button type="button" className="vdev-hcard vdev-hcard-new" onClick={onNewProject}>
                        <DeviceIcon name="plus" size={18} />
                        <strong>New project</strong>
                    </button>
                </div>
            </div>
        </main>
    );
}
