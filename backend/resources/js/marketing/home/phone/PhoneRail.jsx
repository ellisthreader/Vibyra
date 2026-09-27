import React from "react";
import PIcon from "./PhoneIcons.jsx";
import { rows } from "./phoneStory.js";

/* The concept's "Project focus" sidebar: a plain project-name heading, one
 * list of open work with quiet status dots, and the computer and account at
 * the foot. It slides over the workspace like the real drawer. */
export default function PhoneRail() {
    return (
        <aside className="ph-rail">
            <div className="ph-project">
                <span>Orbit</span>
                <PIcon name="down" />
                <i className="ph-iconbtn">
                    <PIcon name="panel" />
                </i>
            </div>
            <div className="ph-new">
                <PIcon name="plus" />
                New terminal
            </div>
            <div className="ph-search">
                <PIcon name="search" />
                Search
            </div>
            <div className="ph-scroll">
                <div className="ph-section">
                    Open<span>6</span>
                </div>
                {rows.map((row, index) => (
                    <div className={`ph-row ph-row-${row.id} ${index === 0 ? "is-selected" : ""}`} key={row.id} data-state={row.state}>
                        <PIcon name="chat" />
                        <span className="ph-label">{row.title}</span>
                        <i className="ph-dot" />
                        <i className="ph-tick">
                            <PIcon name="check" />
                        </i>
                        <PIcon name="more" className="ph-more" />
                    </div>
                ))}
                <div className="ph-row ph-row-dev" data-state="running">
                    <PIcon name="terminal" />
                    <span className="ph-label">Development server</span>
                    <i className="ph-dot" />
                    <PIcon name="more" className="ph-more" />
                </div>
            </div>
            <footer className="ph-foot">
                <div className="ph-computer">
                    <PIcon name="computer" />
                    <span>Ellis’s MacBook</span>
                    <i className="ph-dot" />
                </div>
                <div className="ph-account">
                    <b>E</b>
                    <span>Settings</span>
                    <PIcon name="settings" />
                </div>
                <div className="ph-brand">
                    <em>v</em>vibyra
                </div>
            </footer>
            <span className="ph-finger ph-finger-row" aria-hidden="true" />
        </aside>
    );
}
