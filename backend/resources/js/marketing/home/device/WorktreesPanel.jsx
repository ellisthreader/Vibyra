import React, { useState } from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import { ReviewPanel } from "./DockPanels.jsx";

// One project-local sample worktree. Selecting it reveals the same changed
// files that Chat and Files use, so the illustration stays internally honest.
export default function WorktreesPanel({ demo, onPreview }) {
    const [selected, setSelected] = useState(false);
    const project = demo.project;
    const changed = demo.changed ?? [];
    const active = project.sessions.some((session) => session.state === "working");
    const attention = project.sessions.some((session) => session.state === "attention");
    const state = attention ? "attention" : active ? "working" : "idle";
    const status = attention ? "Needs attention" : active ? "Working" : "Idle";
    const branch = project.branch || `vibyra/${project.id}`;
    return <div className="vdev-worktrees">
        <div className="vdev-worktree-repo">
            <DeviceIcon name="branch" size={14} />
            <strong>{project.name}</strong>
            <span>Sample project</span>
        </div>
        {selected ? <div className="vdev-worktree-detail">
            <button type="button" className="vdev-worktree-back" onClick={() => setSelected(false)}>← All worktrees</button>
            <h2>{project.name} workspace</h2>
            <p className="vdev-worktree-branch">⑂ {branch}</p>
            <div className="vdev-worktree-actions"><span>Local sample branch</span>
                <button type="button" className="vdev-btn" onClick={onPreview}>Preview ↗</button></div>
            <ReviewPanel data={demo.data} changed={changed} onKeep={demo.keep} onDiscard={demo.discard} />
        </div> : <>
            <div className="vdev-worktree-heading"><span>1 worktree</span><span>Illustrative</span></div>
            <button type="button" className="vdev-worktree-row" onClick={() => setSelected(true)}>
                <span className="vdev-worktree-top"><i data-state={state} /><strong>{project.name} workspace</strong><small data-state={state}>{status}</small></span>
                <span className="vdev-worktree-branch">⑂ {branch}</span>
                <span className="vdev-worktree-bottom"><span>{changed.length} file{changed.length === 1 ? "" : "s"} changed</span><span>Local branch</span></span>
            </button>
            <p className="vdev-worktree-note">Each worktree has its own working folder and branch.</p>
        </>}
    </div>;
}
