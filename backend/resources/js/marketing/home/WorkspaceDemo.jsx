import React, { useState } from "react";
import { Brand, Icon, TabKeys } from "./shared.jsx";
import { TerminalDemo, PreviewDemo, ReviewDemo } from "./WorkspacePanels.jsx";
import WorkspaceTour from "./WorkspaceTour.jsx";

const tabs = [
    {
        label: "Build with agents",
        icon: "terminal",
        caption: "Give every part of your idea room to grow. Run your coding agents side by side.",
    },
    {
        label: "See it come to life",
        icon: "monitor",
        caption: "From a line of code to a live preview. Check your project at desktop and phone sizes.",
    },
    {
        label: "Make it yours",
        icon: "branch",
        caption: "Know what changed. Review work in an isolated Git workspace before bringing it back.",
    },
];

export default function WorkspaceDemo({ onExplore }) {
    const [selected, setSelected] = useState(0);
    const [tourOpen, setTourOpen] = useState(false);
    return (
        <div className="walkthrough">
            <div className="product-stage" data-mode={selected}>
                <div className="desktop-device">
                    <div className="device-titlebar">
                        <Brand />
                        <span className="device-project">orbit / your next idea</span>
                        <div className="window-controls" aria-hidden="true">
                            <span>−</span>
                            <span>□</span>
                            <span>×</span>
                        </div>
                    </div>
                    <div className="device-body">
                        <aside className="demo-rail" aria-label="Open interactive workspace tools">
                            <button className="demo-rail-selected" aria-label="Explore projects" onClick={() => onExplore({ view: "agents" })}><Icon name="grid" size={17} /></button>
                            <button className="demo-project-icon" aria-label="Open Orbit project" onClick={() => onExplore({ view: "preview" })}>o</button>
                            <button aria-label="Explore workspace files" onClick={() => onExplore({ view: "files" })}><Icon name="file" size={17} /></button>
                            <div className="rail-bottom">
                                <button aria-label="Explore project memory" onClick={() => onExplore({ view: "memory" })}><Icon name="notes" size={17} /></button>
                                <button className="demo-avatar" aria-label="Explore workspace settings" onClick={() => onExplore({ view: "settings" })}>Y</button>
                            </div>
                        </aside>
                        <div
                            className="demo-workspace"
                            role="tabpanel"
                            id="workspace-panel"
                            aria-labelledby={`workspace-tab-${selected}`}
                            tabIndex={0}
                        >
                            <div className="workspace-toolbar">
                                <span>
                                    <i className="orbit-logo">o</i>Orbit
                                    <span className="workspace-project-muted">Workspace</span>
                                </span>
                                <span className="workspace-mode">
                                    <Icon name={tabs[selected].icon} size={13} />
                                    {["Terminals", "Preview", "Review"][selected]}
                                </span>
                            </div>
                            <div className="workspace-content" key={selected}>
                                {selected === 0 && <TerminalDemo onExplore={() => onExplore({ view: "agents" })} />}
                                {selected === 1 && <PreviewDemo />}
                                {selected === 2 && <ReviewDemo />}
                            </div>
                            <div className="workspace-status">
                                <span>
                                    <span className="status-dot" /> Local workspace
                                </span>
                                <span>
                                    <Icon name="branch" size={11} />
                                    vibyra/orbit-build
                                </span>
                                <span>Illustrative product demo</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="walkthrough-controls">
                <div
                    className="walkthrough-tabs"
                    role="tablist"
                    aria-label="Explore the desktop workspace"
                    onKeyDown={(event) => TabKeys(event, tabs, selected, setSelected, "workspace-tab")}
                >
                    {tabs.map((tab, index) => (
                        <button
                            key={tab.label}
                            id={`workspace-tab-${index}`}
                            role="tab"
                            aria-selected={selected === index}
                            aria-controls="workspace-panel"
                            tabIndex={selected === index ? 0 : -1}
                            onClick={() => setSelected(index)}
                        >
                            <span className="tab-number">0{index + 1}</span>
                            {tab.label}
                            <Icon name={tab.icon} size={17} />
                        </button>
                    ))}
                </div>
                <div className="walkthrough-bottom">
                    <p className="walkthrough-caption" aria-live="polite">
                        {tabs[selected].caption}
                    </p>
                    <div className="walkthrough-demo-actions"><button className="tour-trigger guided-tour-trigger" onClick={() => setTourOpen(true)} aria-haspopup="dialog">Guided tour</button>
                    <button className="tour-trigger" onClick={() => onExplore({ view: ["agents", "preview", "changes"][selected] })} aria-haspopup="dialog">
                        Explore the demo <Icon name="capture" size={16} />
                    </button></div>
                </div>
            </div>
            {tourOpen && <WorkspaceTour initialStep={selected} onClose={() => setTourOpen(false)} />}
        </div>
    );
}
