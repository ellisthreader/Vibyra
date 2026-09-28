import React from "react";
import PocketIcon from "./PocketIcons.jsx";

import PocketWorkspace from "./PocketWorkspace.jsx";

export default function PocketPhone() {
    return (
        <div className="pocket-handset">
            <i className="pocket-hardware-key" />
            <div className="pocket-glass">
                <div className="pocket-status"><span>9:41</span><div className="pocket-island"><i /></div><div className="pocket-reception"><i /><i /><i /><i /></div><PocketIcon name="wifi" /><i className="pocket-battery" /></div>
                <PocketWorkspace />
                <div className="pocket-home-indicator" />
            </div>
        </div>
    );
}
