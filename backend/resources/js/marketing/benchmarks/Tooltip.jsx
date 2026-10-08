import { modelLabel } from "./effortSelection.js";
import React, { useCallback, useRef, useState } from "react";

// One floating readout per chart. The value leads; the label follows.
export function useTooltip() {
    const frame = useRef(null);
    const [tip, setTip] = useState(null);
    const show = useCallback((event, content) => {
        const box = frame.current?.getBoundingClientRect();
        if (!box) return;
        // Pointer readouts follow the cursor; keyboard focus anchors to the mark.
        const mark = event.currentTarget.getBoundingClientRect();
        const pointer = event.type.startsWith("pointer");
        const x = (pointer ? event.clientX : mark.left + mark.width / 2) - box.left;
        const y = (pointer ? event.clientY : mark.top) - box.top;
        setTip({ x, y, flip: x > box.width - 240, content });
    }, []);
    const hide = useCallback(() => setTip(null), []);
    return { frame, tip, show, hide };
}

export function Tooltip({ tip }) {
    if (!tip) return null;
    return (
        <div
            className={`bm-tip${tip.flip ? " is-flipped" : ""}`}
            style={{ left: tip.x, top: tip.y }}
            role="status"
            aria-live="polite"
        >
            {tip.content}
        </div>
    );
}

export function TipBody({ model, rows }) {
    return (
        <>
            <p className="bm-tip-name">{modelLabel(model)}</p>
            <dl>
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <dd>{value}</dd>
                        <dt>{label}</dt>
                    </div>
                ))}
            </dl>
        </>
    );
}
