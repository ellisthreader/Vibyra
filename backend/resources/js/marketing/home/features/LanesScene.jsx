import React from "react";
import { Stage } from "./sceneParts.jsx";
import LanesGraph from "./LanesGraph.jsx";
import LanesToast from "./LanesToast.jsx";

/* Safe mode, as one 14s take: the toggle goes on, three agents fork into
 * their own worktrees and work side by side without touching each other or
 * main, and the one that is ready is approved and merged. */
export default function LanesScene() {
    return (
        <Stage name="lanes">
            <LanesGraph />
            <LanesToast />
        </Stage>
    );
}
