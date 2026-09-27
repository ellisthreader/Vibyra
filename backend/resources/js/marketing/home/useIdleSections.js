import { useEffect } from "react";

/**
 * The homepage keeps several hundred looping CSS animations alive at once, which
 * is enough to stall the compositor on a mid-range machine. Nothing is removed:
 * a section simply stops animating while it is off screen and picks back up a
 * little before it scrolls into view.
 */
export default function useIdleSections() {
    useEffect(() => {
        if (!("IntersectionObserver" in window)) return undefined;
        const sections = Array.from(document.querySelectorAll("main > section"));
        if (!sections.length) return undefined;

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    entry.target.classList.toggle("section-idle", !entry.isIntersecting);
                });
            },
            { rootMargin: "300px 0px" }
        );

        // Only the observer ever adds the class. If it never reports — a hidden
        // tab, a browser that throttles delivery — every section keeps animating
        // exactly as it did before, rather than freezing mid-loop.
        sections.forEach((section) => io.observe(section));

        return () => io.disconnect();
    }, []);
}
