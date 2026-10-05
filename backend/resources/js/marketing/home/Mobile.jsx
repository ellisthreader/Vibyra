import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./shared.jsx";
import PocketDialog from "./phone/PocketDialog.jsx";
import PocketIcon from "./phone/PocketIcons.jsx";
import TourPhone from "./phone/TourPhone.jsx";
import { SPEED } from "./phone/tourStory.js";

/* Section 02: the iPhone app as three code-drawn screens, never boxed (the
 * owner picked "Three screens" on 2026-10-04): projects, Claude Code carried on
 * in Vibyra Cloud, and the lock-screen nudge. Scrolled into view the side
 * phones fan out from behind the centre one, then the centre plays the
 * hand-off once and rests. Light only: no card, nothing with an edge. */

const AppleLogo = () => <svg className="pk-apple" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M16.37 1.43c0 1.14-.5 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.2-2.98.81-.94 2.15-1.64 3.25-1.68.03.13.06.28.06.43Zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C3.98 18.48 2.94 15.67 2.94 13c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.62 0 2.89.06 4.38 2.19-.13.09-2.39 1.37-2.39 4.19 0 3.26 2.86 4.42 2.96 4.45Z" />
</svg>;

const FaceId = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8V6a3 3 0 0 1 3-3h2m8 0h2a3 3 0 0 1 3 3v2m0 8v2a3 3 0 0 1-3 3h-2m-8 0H6a3 3 0 0 1-3-3v-2M9 9v1.5m6-1.5v1.5M12 9v4.5h-1m-2 2.5a4.5 4.5 0 0 0 6 0" />
</svg>;

const screens = [
    { side: "left", chapter: "projects", icon: <PocketIcon name="folder" />, title: "Every project, live", text: "Your Mac’s projects and terminals, right where you left them." },
    { side: "center", chapter: "cloud", icon: <PocketIcon name="cloud" />, title: "Claude Code, on into the cloud", text: "Type on your phone. Close the lid and Vibyra Cloud keeps going." },
    { side: "right", chapter: "away", icon: <FaceId />, title: "A nudge, then Face ID", text: "Know when the work is done. Only you get back in." },
];

/* still → ready (below the fold, waiting) → rise → story. */
function useStory(stage) {
    const [state, setState] = useState("still");
    useEffect(() => {
        const node = stage.current;
        if (!node || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
        if (node.getBoundingClientRect().top < window.innerHeight * .7) return undefined;
        setState("ready");
        let timer;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            setState("rise");
            timer = setTimeout(() => setState("story"), 1300);
        }, { threshold: .35 });
        observer.observe(node);
        return () => { observer.disconnect(); clearTimeout(timer); };
    }, [stage]);
    return state;
}

/* A mouse leans the rig a few degrees, eased each frame and idle otherwise. */
function useTilt(stage) {
    useEffect(() => {
        const node = stage.current;
        if (!node || window.matchMedia("(prefers-reduced-motion: reduce), (hover: none)").matches) return undefined;
        const now = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
        let frame = 0;
        const step = () => {
            now.x += (goal.x - now.x) * .07;
            now.y += (goal.y - now.y) * .07;
            node.style.setProperty("--tx", now.x.toFixed(4));
            node.style.setProperty("--ty", now.y.toFixed(4));
            frame = Math.abs(goal.x - now.x) + Math.abs(goal.y - now.y) > .0005 ? requestAnimationFrame(step) : 0;
        };
        const kick = () => { if (!frame) frame = requestAnimationFrame(step); };
        const move = event => {
            if (event.pointerType !== "mouse") return;
            const box = node.getBoundingClientRect();
            goal.x = (event.clientX - box.left) / box.width - .5;
            goal.y = (event.clientY - box.top) / box.height - .5;
            kick();
        };
        const leave = () => { goal.x = 0; goal.y = 0; kick(); };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerleave", leave);
        return () => { cancelAnimationFrame(frame); node.removeEventListener("pointermove", move); node.removeEventListener("pointerleave", leave); };
    }, [stage]);
}

export default function Mobile() {
    const [dialog, setDialog] = useState(null);
    const previewButton = useRef(null);
    const waitlistButton = useRef(null);
    const stage = useRef(null);
    const state = useStory(stage);
    useTilt(stage);
    // Leaving "still" creates the centre phone's animations afresh; give them the tour's pace.
    useLayoutEffect(() => {
        stage.current?.querySelector(".is-center .tp-screen.is-on")?.getAnimations({ subtree: true }).forEach(animation => { animation.playbackRate = SPEED; });
    }, [state]);
    return (
        <section className="pk-section section-space" id="mobile" aria-labelledby="mobile-title">
            <div className="page-width">
                <div className="section-heading home-section-heading pk-heading">
                    <h2 id="mobile-title">Your desk, <span>in your pocket.</span></h2>
                    <p>Your projects, terminals and agents, wherever you are.<br />The iPhone app is coming October 2026.</p>
                    <div className="pk-actions">
                        <button type="button" className="pk-join" ref={waitlistButton} onClick={() => setDialog("waitlist")}><AppleLogo />Join iPhone waitlist</button>
                        <button type="button" className="pk-preview" ref={previewButton} onClick={() => setDialog("preview")}>
                            <span className="pk-play"><Icon name="play" size={12} /></span>See preview
                        </button>
                    </div>
                </div>
                <div className="pk3" ref={stage} data-state={state} style={{ "--speed": SPEED }}>
                    <div className="pk3-light" aria-hidden="true"><i className="pk3-key" /><i className="pk3-glow" /><i className="pk3-floor" /></div>
                    <div className="pk3-rig">
                        {screens.map(({ side, chapter, title }) => <button key={side} type="button" className={`pk3-phone is-${side}`}
                            onClick={() => setDialog("preview")} aria-label={`Watch the iPhone preview: ${title}. Sample project.`}>
                            <span className={`pk3-float${side !== "center" || state === "still" ? " tp-still" : ""}`} aria-hidden="true">
                                <TourPhone chapter={chapter} run={0} />
                            </span>
                        </button>)}
                    </div>
                    <ul className="pk3-captions">
                        {screens.map(({ side, icon, title, text }) => <li key={side} className={`pk3-caption is-${side}`}>
                            <span className="pk3-icon">{icon}</span>
                            <h3>{title}</h3>
                            <p>{text}</p>
                        </li>)}
                    </ul>
                </div>
            </div>
            {dialog && <PocketDialog key={dialog} opener={dialog === "preview" ? previewButton : waitlistButton} kind={dialog}
                onClose={() => setDialog(null)} onWaitlist={() => setDialog("waitlist")} />}
        </section>
    );
}
