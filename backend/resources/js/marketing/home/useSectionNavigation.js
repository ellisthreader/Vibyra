import { useEffect, useState } from "react";

export default function useSectionNavigation(homePath) {
    const [active, setActive] = useState("");
    useEffect(() => {
        // A fragment can arrive before React has inserted its destination.
        const frame = requestAnimationFrame(() => {
            const id = window.location.hash.slice(1);
            if (id) document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" });
        });
        return () => cancelAnimationFrame(frame);
    }, []);
    useEffect(() => {
        if (homePath) return undefined;
        const sections = ["desktop", "mobile", "why", "pricing", "faq"]
            .map((id) => document.getElementById(id)).filter(Boolean);
        let frame = 0;
        const update = () => {
            frame = 0;
            const current = sections.find((section) => {
                const rect = section.getBoundingClientRect();
                return rect.top <= 180 && rect.bottom > 180;
            });
            setActive(current ? `#${current.id}` : "");
        };
        const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
        update();
        window.addEventListener("scroll", queue, { passive: true });
        window.addEventListener("resize", queue);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", queue);
            window.removeEventListener("resize", queue);
        };
    }, [homePath]);
    return active;
}
