import { useLayoutEffect, useRef } from "react";

/** Scroll-driven reveal: the labels tuck behind the handset when scrolling back. */
export default function usePocketReveal() {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const labels = [...node.querySelectorAll(".pocket-callout")];
        let frame = 0;
        let nearby = true;
        let offsets = [];
        const measure = () => {
            const art = node.getBoundingClientRect();
            const phone = node.querySelector(".pocket-handset").getBoundingClientRect();
            offsets = labels.map(label => {
                const centreX = art.left + label.offsetLeft + label.offsetWidth / 2;
                const centreY = art.top + label.offsetTop + label.offsetHeight / 2;
                if (label.classList.contains("pocket-callout-cloud") && window.innerWidth <= 900) {
                    return { x: phone.left + phone.width / 2 - centreX, y: phone.bottom - phone.height * .04 - centreY };
                }
                const fromLeft = centreX < phone.left + phone.width / 2;
                // Each card starts just inside its nearest handset edge.
                const edgeX = fromLeft ? phone.left + phone.width * .22 : phone.right - phone.width * .22;
                return {
                    x: edgeX - centreX,
                    y: Math.max(-48, Math.min(48, (phone.top + phone.height * .5 - centreY) * .18)),
                };
            });
        };
        const update = () => {
            frame = 0;
            if (motion.matches) { delete node.dataset.reveal; return; }
            const rect = node.getBoundingClientRect();
            const distance = Math.min(window.innerHeight * .9, rect.height * .9);
            const progress = (window.innerHeight * .87 - rect.top) / distance;
            node.dataset.reveal = "scroll";
            labels.forEach((label, index) => {
                const p = Math.max(0, Math.min(1, (progress - index * .12) / .68));
                const eased = 1 - (1 - p) ** 3;
                label.style.setProperty("--reveal-x", `${offsets[index].x * (1 - eased)}px`);
                label.style.setProperty("--reveal-y", `${offsets[index].y * (1 - eased)}px`);
                label.style.setProperty("--reveal-scale", .78 + eased * .22);
                label.style.setProperty("--reveal-opacity", Math.min(1, p * 2.5));
                label.style.setProperty("--reveal-blur", `${(1 - eased) * 5}px`);
            });
        };
        const schedule = () => { if (nearby && !frame) frame = requestAnimationFrame(update); };
        const resize = () => { measure(); schedule(); };
        measure(); update();
        const observer = new IntersectionObserver(entries => {
            nearby = entries[0].isIntersecting;
            if (nearby) resize();
        }, { rootMargin: "25% 0px" });
        observer.observe(node);
        const sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(node);
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", resize);
        motion.addEventListener("change", update);
        return () => {
            cancelAnimationFrame(frame); observer.disconnect(); sizeObserver.disconnect();
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", resize);
            motion.removeEventListener("change", update);
            delete node.dataset.reveal;
        };
    }, []);
    return ref;
}
