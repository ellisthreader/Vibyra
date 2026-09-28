import React from "react";
import PIcon from "./PhoneIcons.jsx";
import PhoneRail from "./PhoneRail.jsx";
import PhoneWorkspace from "./PhoneWorkspace.jsx";
import PhonePreview from "./PhonePreview.jsx";
import { phases } from "./phoneStory.js";

export const PHONE_WIDTH = 320;

/* The handset: the concept's dark shell, a status bar, the workspace with
 * the drawer over it, the Live preview over both, and a home indicator. `data-phase` and `data-scene`
 * name where we are, and `at-*` accumulates every phase reached so far in
 * the cycle, so the stylesheet can say "from this point on" in one rule. */
export default function PhoneShell({ story }) {
    const index = phases.findIndex((p) => p.key === story.phase);
    const reached = phases
        .slice(0, index + 1)
        .map((p) => `at-${p.key}`)
        .join(" ");
    const ticked = ["tick1", "tick2", "tick3"].filter((key) => reached.includes(`at-${key}`)).length;
    return (
        <div
            className={`ph-shell ${reached} ${story.typed ? "has-text" : ""}`}
            data-phase={story.phase}
            data-scene={story.scene}
            role="img"
            aria-label="Illustrative Vibyra phone app: opening a project, giving an agent an instruction, watching the change land and opening the live site"
        >
            <div className="ph-screen">
                <div className="ph-status">
                    <span>9:41</span>
                    <span className="ph-status-right">
                        <PIcon name="wifi" />
                        <i className="ph-battery" />
                    </span>
                </div>
                <PhoneWorkspace typed={story.typed} streamed={story.streamed} />
                <div className="ph-scrim" />
                <PhoneRail />
                <PhonePreview done={ticked} />
                <div className="ph-home" />
            </div>
        </div>
    );
}
