import { useEffect, useRef, useState } from "react";

/* One clock per scene. While the scene is on screen and the tab is visible it
 * counts seconds from 0 to `length`, holds, then starts again. Every frame it
 * writes the exact time to `--t` on the element, so bars and playheads move
 * smoothly in CSS; React only hears about it every `step` seconds, which is
 * enough for words to arrive and states to flip. Reduced motion (or no
 * IntersectionObserver) parks the clock on its finished frame. */
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function useSceneClock(length, { hold = 3, step = 0.1 } = {}) {
    const ref = useRef(null);
    const [t, setT] = useState(length);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const put = (seconds) => el.style.setProperty("--t", seconds.toFixed(3));
        if (still() || !("IntersectionObserver" in window)) {
            put(length);
            setT(length);
            return undefined;
        }

        let now = 0;
        let last = null;
        let frame = 0;
        let onScreen = false;
        let shown = -1;
        put(0);
        setT(0);

        const tick = (stamp) => {
            if (last !== null) now += Math.min(0.1, (stamp - last) / 1000);
            last = stamp;
            if (now > length + hold) now = 0;
            const at = Math.min(now, length);
            put(at);
            const snapped = Math.floor(at / step) * step;
            if (snapped !== shown) {
                shown = snapped;
                setT(snapped);
            }
            frame = requestAnimationFrame(tick);
        };
        const sync = () => {
            const run = onScreen && !document.hidden;
            cancelAnimationFrame(frame);
            last = null;
            if (run) frame = requestAnimationFrame(tick);
        };
        const views = new IntersectionObserver(
            ([entry]) => {
                onScreen = entry.isIntersecting;
                sync();
            },
            { threshold: 0.35 },
        );
        views.observe(el);
        document.addEventListener("visibilitychange", sync);
        return () => {
            cancelAnimationFrame(frame);
            views.disconnect();
            document.removeEventListener("visibilitychange", sync);
        };
    }, [length, hold, step]);

    return [ref, t];
}
