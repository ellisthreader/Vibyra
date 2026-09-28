import React from "react";
import { Mark, Pointer } from "./sceneParts.jsx";

/* Claude Code's workspace turning up in Review: the app's own status and
 * buttons. Approving it merges its lane in the graph, and the card leaves. */
export default function LanesToast() {
    return (
        <>
            <div className="ln-toast">
                <p className="ln-toast-head">
                    <Mark logo="claude-color" size={13} />
                    <strong>Claude Code</strong>
                    <span>2 files · +76 −6</span>
                </p>
                <p className="ln-toast-row">
                    <span className="ln-toast-state">
                        <i className="ln-toast-ready">Ready to review</i>
                        <i className="ln-toast-done">Approved</i>
                    </span>
                    <b className="ln-reject">Reject</b>
                    <b className="ln-approve">Approve 2 files</b>
                </p>
            </div>
            <span className="ln-cursor">
                <Pointer />
            </span>
        </>
    );
}
