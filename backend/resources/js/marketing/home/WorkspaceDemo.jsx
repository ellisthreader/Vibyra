import React, { useLayoutEffect, useRef, useState } from "react";
import DeviceFrame from "./device/DeviceFrame.jsx";

const MAC_WIDTH = 1440;
const MAC_HEIGHT = 900;

// The hero shows the software and nothing else: the working miniature in its
// frame, with no tabs or captions under it. The region still says it is an
// illustrative demo, and what a click just did is announced to screen readers.
export default function WorkspaceDemo({ demo }) {
    const frame = useRef(null);
    const [scale, setScale] = useState(null);
    useLayoutEffect(() => {
        const update = () => {
            // Fit the canvas to the frame's content box, not its padded width.
            const node = frame.current;
            const style = node && getComputedStyle(node);
            const width = node && node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            setScale(window.innerWidth >= 960 && width ? Math.min(1, width / MAC_WIDTH) : null);
        };
        const observer = new ResizeObserver(update);
        if (frame.current) observer.observe(frame.current);
        window.addEventListener("resize", update);
        update();
        return () => { observer.disconnect(); window.removeEventListener("resize", update); };
    }, []);
    const nativeSize = scale !== null;
    return (
        <div ref={frame} className="walkthrough" data-native-size={nativeSize} role="region" aria-label="Illustrative demo of Vibyra Desktop. Try it right here.">
            <div className="product-stage" style={nativeSize ? { height: `${MAC_HEIGHT * scale}px` } : undefined}>
                <div className="product-stage-canvas" style={nativeSize ? { transform: `scale(${scale})` } : undefined}>
                    <DeviceFrame demo={demo} />
                </div>
            </div>
            <p className="walkthrough-live" aria-live="polite">
                {demo.notice}
            </p>
        </div>
    );
}
