import React from "react";
import { Stage } from "./sceneParts.jsx";

/* The preview dock flipping through real presets from the app's list: the
 * phone rotates, becomes a tablet, then a laptop, and the page reflows each
 * time. Refresh reloads it, the way the dock's own button does. */
const NAMES = [
    ["pv-n-phone", "iPhone 16 Pro"],
    ["pv-n-tablet", "iPad Air 11-inch"],
    ["pv-n-laptop", "MacBook Air 13-inch"],
];

function Tool({ id, children }) {
    return (
        <span className={`pv-tool pv-tool-${id}`}>
            <svg viewBox="0 0 16 16">{children}</svg>
        </span>
    );
}

export default function PreviewScene() {
    return (
        <Stage name="pv">
            <p className="pv-bar">
                <span className="pv-pick">
                    <span className="pv-names">
                        {NAMES.map(([id, name]) => (
                            <i className={`pv-name ${id}`} key={id}>
                                {name}
                            </i>
                        ))}
                    </span>
                    <b className="pv-size" />
                </span>
                <Tool id="rotate">
                    <path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3M12 2v3H9M4 14v-3h3" />
                </Tool>
                <Tool id="fit">
                    <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                </Tool>
                <Tool id="refresh">
                    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" />
                </Tool>
            </p>
            <div className="pv-device">
                <span className="pv-island" />
                <div className="pv-page">
                    <p className="pv-nav">
                        <i />
                        <b />
                        <span />
                    </p>
                    <p className="pv-hero">
                        <b />
                        <i />
                    </p>
                    <div className="pv-cards">
                        {[0, 1, 2, 3, 4, 5].map((card) => (
                            <i key={card} />
                        ))}
                    </div>
                </div>
            </div>
            <span className="pv-base" />
        </Stage>
    );
}
