import { useEffect } from "react";

// Observe stable outer blocks, never the animated artwork or async plan cards.
const blocks = [
    ".agent-heading", ".agent-flow",
    ".film-section .home-section-heading", ".film-frame",
    ".workspace-section .home-section-heading", ".wk-card",
    ".pk-heading", ".cmp-heading", ".cmp-scroll", ".eco-head", ".eco-cell", ".fx-foot",
    ".pricing-layout", ".qa-intro", ".qa-list",
    ".footer-cta", ".footer-grid", ".footer-bottom",
].join(", ");

export default function useScrollReveal(page) {
    useEffect(() => {
        const root = page.current;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (!root || motion.matches || !("IntersectionObserver" in window)) return;

        const pending = new Set();
        const reveal = (node, immediate = false) => {
            if (!pending.delete(node)) return;
            if (immediate) node.removeAttribute("data-scroll-reveal");
            else node.setAttribute("data-scroll-reveal", "visible");
            observer.unobserve(node);
        };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(({ target, isIntersecting }) => {
                if (isIntersecting) reveal(target);
            });
        }, { rootMargin: "0px 0px -40px 0px", threshold: 0 });

        const nodes = Array.from(root.querySelectorAll(blocks));
        nodes.forEach((node) => {
            // Preserve the first paint, restored scroll positions and deep links.
            if (node.getBoundingClientRect().top < window.innerHeight) return;
            pending.add(node);
            node.setAttribute("data-scroll-reveal", "pending");
            observer.observe(node);
        });

        const onFocus = ({ target }) => {
            pending.forEach((node) => { if (node.contains(target)) reveal(node, true); });
        };
        const onHash = () => {
            let id;
            try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
            const target = document.getElementById(id);
            if (!target) return;
            pending.forEach((node) => {
                if (target.contains(node) || node.contains(target)) reveal(node, true);
            });
        };
        const revealAll = () => pending.forEach((node) => reveal(node, true));
        root.addEventListener("focusin", onFocus);
        window.addEventListener("hashchange", onHash);
        window.addEventListener("pagehide", revealAll);
        motion.addEventListener("change", revealAll);
        onHash();

        return () => {
            observer.disconnect();
            nodes.forEach((node) => node.removeAttribute("data-scroll-reveal"));
            root.removeEventListener("focusin", onFocus);
            window.removeEventListener("hashchange", onHash);
            window.removeEventListener("pagehide", revealAll);
            motion.removeEventListener("change", revealAll);
        };
    }, [page]);
}
