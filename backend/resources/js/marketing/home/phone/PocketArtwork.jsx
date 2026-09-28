import React from "react";
import PocketPhone from "./PocketPhone.jsx";
import PocketIcon from "./PocketIcons.jsx";
import usePocketReveal from "./usePocketReveal.js";

export default function PocketArtwork() {
    const reveal = usePocketReveal();
    return <div ref={reveal} className="pocket-artwork" role="img" aria-label="Vibyra phone connected through end-to-end encrypted Vibyra Cloud, with projects, live terminals, and agents. Sample data.">
        <div className="pocket-atmosphere" aria-hidden="true" />
        <div className="pocket-floor-light" aria-hidden="true" />
        <div className="pocket-device-shadow" aria-hidden="true" />
        <div aria-hidden="true"><PocketPhone /></div>
        <div className="pocket-callout pocket-callout-workflow" aria-hidden="true"><PocketIcon name="folder" /><span>Projects</span></div>
        <div className="pocket-callout pocket-callout-sync" aria-hidden="true"><PocketIcon name="terminal" /><span>Live terminals</span></div>
        <div className="pocket-callout pocket-callout-agents" aria-hidden="true"><PocketIcon name="users" /><span>Agents</span></div>
        <div className="pocket-callout pocket-callout-cloud" aria-hidden="true">
            <span className="pocket-cloud-mark"><PocketIcon name="cloud" /></span>
            <span className="pocket-cloud-copy"><strong>Vibyra Cloud</strong><small>End-to-end encrypted</small></span>
        </div>
    </div>;
}
