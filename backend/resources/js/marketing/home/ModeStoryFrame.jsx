import React, { useEffect, useRef, useState } from "react";

// True while the element is on screen and the tab is visible.
function useLive(ref) {
    const [live, setLive] = useState(false);
    useEffect(() => {
        let inView = false;
        const update = () => setLive(inView && !document.hidden);
        const observer = new IntersectionObserver(
            ([entry]) => {
                inView = entry.isIntersecting;
                update();
            },
            { threshold: 0.2 },
        );
        observer.observe(ref.current);
        document.addEventListener("visibilitychange", update);
        return () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", update);
        };
    }, [ref]);
    return live;
}

// Plays an illustration once it is on screen; pauses again when it leaves.
export function Scene({ className, children }) {
    const ref = useRef(null);
    const live = useLive(ref);
    return (
        <div
            ref={ref}
            className={`mf-fig ${className} ${live ? "is-live" : ""}`}
            aria-hidden="true"
        >
            <div className="mf-take">{children}</div>
        </div>
    );
}

export const at = (seconds) => ({ "--at": `${seconds}s` });

// Words arrive one after another, like text being streamed back.
export function Words({ text, from, step = 0.05 }) {
    return text.split(" ").map((word, index) => (
        <span className="mf-word" style={at(from + index * step)} key={index}>
            {word}{" "}
        </span>
    ));
}
