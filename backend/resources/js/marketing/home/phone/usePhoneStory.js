import { useEffect, useRef, useState } from "react";
import { CYCLE, scenes, stillStory, storyAt } from "./phoneStory.js";

/* Runs the phone's clock. It only ticks while the section is on screen and
 * the tab is visible, so the loop never burns time nobody can see, and it
 * renders only when something the phone shows actually changes. The scene
 * progress is written straight onto the stage as `--p` for the tab's bar. */
export default function usePhoneStory(stageRef) {
    const [story, setStory] = useState(() => storyAt(0));
    const [still, setStill] = useState(false);
    const [paused, setPaused] = useState(false);
    const clock = useRef({ t: 0, last: 0, running: false, frame: 0, onScreen: false });

    useEffect(() => {
        const el = stageRef.current;
        if (!el) return undefined;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
            setStill(true);
            setStory(stillStory);
            return undefined;
        }
        const c = clock.current;
        const section = el.closest("section") || el;
        let shown = { phase: "", scene: -1, typed: -1, streamed: -1 };
        const tick = (now) => {
            if (!c.running) return;
            c.t = (c.t + Math.min(64, now - c.last)) % CYCLE;
            c.last = now;
            const s = storyAt(c.t);
            section.style.setProperty("--p", s.progress.toFixed(3));
            if (s.phase !== shown.phase || s.scene !== shown.scene || s.typed !== shown.typed || s.streamed !== shown.streamed) {
                shown = s;
                setStory(s);
            }
            c.frame = requestAnimationFrame(tick);
        };
        const sync = () => {
            const should = c.onScreen && !document.hidden && !paused;
            if (should === c.running) return;
            c.running = should;
            if (should) {
                c.last = performance.now();
                c.frame = requestAnimationFrame(tick);
            } else cancelAnimationFrame(c.frame);
        };
        const io = new IntersectionObserver(
            ([entry]) => {
                c.onScreen = entry.isIntersecting;
                el.classList.toggle("is-live", entry.isIntersecting);
                if (entry.isIntersecting) el.classList.add("is-shown");
                sync();
            },
            { threshold: 0.2 },
        );
        io.observe(el);
        document.addEventListener("visibilitychange", sync);
        return () => {
            c.running = false;
            cancelAnimationFrame(c.frame);
            io.disconnect();
            document.removeEventListener("visibilitychange", sync);
        };
    }, [stageRef, paused]);

    /* A step tab jumps the clock to that scene; under reduced motion it shows
     * that scene's resting frame instead. */
    const jump = (index) => {
        if (still) {
            setStory({ ...stillStory, scene: index, phase: ["rail", "card", "done", "tick3"][index] });
            return;
        }
        const c = clock.current;
        c.t = scenes[index].at;
        c.last = performance.now();
        const next = storyAt(c.t);
        const el = stageRef.current;
        (el?.closest("section") || el)?.style.setProperty("--p", next.progress.toFixed(3));
        setStory(next);
    };

    return { story, still, jump, paused, togglePause: () => setPaused((value) => !value) };
}

/* The phone, and the stage it stands on, are drawn at a fixed size and scaled
 * to their column; `name` is the custom property the scale is written to. */
export function usePhoneScale(wrapRef, width, name = "--k") {
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const fit = () => el.style.setProperty(name, Math.min(1, el.clientWidth / width).toFixed(4));
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        fit();
        return () => ro.disconnect();
    }, [wrapRef, width, name]);
}
