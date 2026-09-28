import { useEffect, useState } from "react";

function shouldEnter() {
    if (typeof window === "undefined") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        && (!window.location.hash || window.location.hash === "#top")
        && window.scrollY < 40
        && window.performance.getEntriesByType("navigation")[0]?.type !== "back_forward";
}

// A document entrance, never a loading gate or a persistent visitor preference.
export default function useHeroEntrance() {
    const [entering, setEntering] = useState(shouldEnter);

    useEffect(() => {
        if (!entering) return;
        const finish = () => setEntering(false);
        const onScroll = () => { if (window.scrollY > 40) finish(); };
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const events = ["pointerdown", "touchstart", "wheel", "keydown", "focusin", "hashchange", "pagehide"];
        events.forEach((event) => window.addEventListener(event, finish, { passive: true }));
        window.addEventListener("scroll", onScroll, { passive: true });
        motion.addEventListener("change", finish);
        const timer = window.setTimeout(finish, 2500);
        onScroll();
        return () => {
            window.clearTimeout(timer);
            events.forEach((event) => window.removeEventListener(event, finish));
            window.removeEventListener("scroll", onScroll);
            motion.removeEventListener("change", finish);
        };
    }, [entering]);

    return entering;
}
