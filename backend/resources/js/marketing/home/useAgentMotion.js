import { useEffect, useState } from "react";

export default function useAgentMotion(root) {
    const [active, setActive] = useState(false);
    useEffect(() => {
        const node = root.current;
        if (!node) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        // Size cards to their content; measure one repeat for equal 32px/s drift.
        const groups = Array.from(node.querySelectorAll(".agent-track > .agent-group:first-child"));
        const measure = () => groups.forEach((group) => {
            group.parentElement.style.setProperty("--agent-duration", `${group.getBoundingClientRect().width / 32}s`);
        });
        const sizes = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
        groups.forEach((group) => sizes?.observe(group));
        measure();
        let visible = !("IntersectionObserver" in window);
        const sync = () => setActive(visible && !document.hidden && !motion.matches);
        const observer = "IntersectionObserver" in window
            ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); })
            : null;
        observer?.observe(node);
        document.addEventListener("visibilitychange", sync);
        motion.addEventListener("change", sync);
        sync();
        return () => {
            sizes?.disconnect();
            observer?.disconnect();
            document.removeEventListener("visibilitychange", sync);
            motion.removeEventListener("change", sync);
        };
    }, [root]);
    return active;
}
