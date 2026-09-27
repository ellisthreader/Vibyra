import React from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import { tileColors } from "./demoData.js";

// The 54px project rail. Squircle tiles, a left pill on the active one.
export default function ProjectStrip({ projects, activeId, onOpen, waitingIds = [] }) {
    return (
        <nav className="vdev-strip" aria-label="Projects">
            <button
                type="button"
                className={`vdev-tile vdev-tile-home${activeId === "home" ? " vdev-tile-active" : ""}`}
                aria-label="Home"
                aria-current={activeId === "home"}
                onClick={() => onOpen("home")}
            >
                <DeviceIcon name="home" size={17} />
            </button>
            <span className="vdev-strip-sep" />
            <div className="vdev-strip-list">
                {projects.map((project, index) => (
                    <button
                        key={project.id}
                        type="button"
                        className={`vdev-tile vdev-tile-project${project.id === activeId ? " vdev-tile-active" : ""}`}
                        style={{ "--tile-c": tileColors[index % tileColors.length] }}
                        aria-label={`Open ${project.name}`}
                        aria-current={project.id === activeId}
                        onClick={() => onOpen(project.id)}
                    >
                        {project.name.charAt(0).toUpperCase()}
                        {waitingIds.includes(project.id) && <span className="vdev-tile-badge" />}
                    </button>
                ))}
            </div>
            <span className="vdev-strip-sep" />
            <span className="vdev-tile vdev-tile-add" aria-hidden="true">
                ＋
            </span>
        </nav>
    );
}
