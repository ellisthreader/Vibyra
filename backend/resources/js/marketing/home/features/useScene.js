import { useEffect, useRef } from "react";

/* Every scene in section 03 is a CSS loop on a fixed-size stage, drawn in
 * pixels so motion paths line up. This hook owns three things:
 * - `is-shown` once the card first scrolls in (its entrance);
 * - `is-live` only while it is on screen and the tab is visible, so a loop
 *   nobody can see is paused rather than painted;
 * - `--k`, the stage's scale, so a scene shrinks with its frame (which keeps
 *   one aspect ratio) instead of reflowing or being cropped.
 * Under reduced motion the card gets `is-still` and each scene's resting CSS,
 * which is its finished frame, is all that paints. */
/* `upTo` lets a larger frame draw the scene bigger than 1:1 (the ecosystem stage). */
export default function useScene(upTo = 1) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const art = el.querySelector(".fx-art");
        const stage = el.querySelector(".fx-stage");
        const fit = () => {
            if (!art || !stage) return;
            const k = Math.min(upTo, art.clientWidth / stage.offsetWidth, art.clientHeight / stage.offsetHeight);
            art.style.setProperty("--k", k.toFixed(4));
        };
        const sizes = new ResizeObserver(fit);
        if (art) sizes.observe(art);
        fit();

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
            el.classList.add("is-shown", "is-still");
            return () => sizes.disconnect();
        }
        let onScreen = false;
        const sync = () => el.classList.toggle("is-live", onScreen && !document.hidden);
        const views = new IntersectionObserver(
            ([entry]) => {
                onScreen = entry.isIntersecting;
                if (onScreen) el.classList.add("is-shown");
                sync();
            },
            { threshold: 0.12 },
        );
        views.observe(el);
        document.addEventListener("visibilitychange", sync);
        return () => {
            sizes.disconnect();
            views.disconnect();
            document.removeEventListener("visibilitychange", sync);
        };
    }, []);

    return ref;
}

/* The card under the pointer carries a soft cobalt light that follows it. */
export function trackGlow(event) {
    const tile = event.target.closest?.(".fx-tile");
    if (!tile) return;
    const box = tile.getBoundingClientRect();
    tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
    tile.style.setProperty("--my", `${event.clientY - box.top}px`);
}
