import React from "react";
import { Icon } from "../shared.jsx";
import PIcon from "./PhoneIcons.jsx";

// Static sample data, following mobile/src/ui/FocusDrawer and ProjectTree.
const sessions = [
    ["Build the landing page", "working"],
    ["Review the latest changes", "ready"],
    ["Fix the mobile navigation", "waiting"],
    ["Development server", "working"],
];

export default function PocketWorkspace() {
    return <div className="pocket-workspace">
        <div className="pocket-workspace-header">
            <svg viewBox="0 0 24 20" className="pocket-workspace-mark" aria-hidden="true"><path fill="currentColor" d="M0 2h6l6 10 6-10h6L12 22Z" /></svg>
            <strong>Vibyra</strong><PIcon name="plus" /><Icon name="close" />
        </div>
        <div className="pocket-projects">
            <div className="pocket-projects-label">Projects</div>
            <div className="pocket-project-row is-selected"><PIcon name="down" /><span>Orbit</span><small>4</small><PIcon name="more" /></div>
            <div className="pocket-sessions">
                {sessions.map(([title, state], index) => <div className={`pocket-session ${index === 0 ? "is-selected" : ""}`} key={title}><i className={`is-${state}`} /><span>{title}</span></div>)}
                <div className="pocket-new-terminal"><PIcon name="plus" /><span>New terminal</span></div>
            </div>
            <div className="pocket-project-row"><Icon name="chevron" /><span>Website</span><small>2</small><PIcon name="more" /></div>
            <div className="pocket-project-row"><Icon name="chevron" /><span>Weekend project</span><small>1</small><PIcon name="more" /></div>
        </div>
        <div className="pocket-workspace-footer">
            <div className="pocket-computer"><PIcon name="computer" /><span>Ellis’s MacBook</span><small><i />Connected</small><Icon name="chevron" /></div>
            <div className="pocket-footer-actions"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 21V3m0 1h12l-3 5 3 5H6" /></svg>Report</span><span><PIcon name="settings" />Settings</span></div>
        </div>
    </div>;
}
