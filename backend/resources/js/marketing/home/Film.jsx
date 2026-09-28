import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared.jsx";

const SRC = "/media/vibyra-film.mp4?v=20260927-9";
// Painted cover art (the teammates as the cast on the site's cobalt stage, with the
// logo and "The agentic coding workspace." above them), not a film frame: the render script's own poster would repeat the hero's app window.
const POSTER = "/media/vibyra-film-cover.jpg?v=2";

/* The launch film (remotion/src/film) as an ordinary section: same column,
 * radius and heading as the rest of the page. It waits on its poster until
 * someone presses play, so it starts with sound and never nags for it, and it
 * pauses when scrolled away. "Watch the film" in the hero lands here and plays. */
export default function Film() {
    const frame = useRef(null);
    const video = useRef(null);
    const inView = useRef(false);
    const [state, setState] = useState("idle"); // idle | playing | paused | ended
    const [muted, setMuted] = useState(false);

    const play = (fromStart = false) => {
        const node = video.current;
        if (!node) return;
        if (fromStart || node.ended) node.currentTime = 0;
        node.play().catch(() => {
            // Refused with sound (no gesture reached us): play silently instead.
            node.muted = true;
            setMuted(true);
            node.play().catch(() => undefined);
        });
    };
    const toggle = () => (video.current?.paused ? play() : video.current?.pause());

    // Pause once most of the frame has left the screen (but not while the
    // hero link is still scrolling it in: it must have been on screen first).
    useEffect(() => {
        const node = video.current;
        if (!node || !("IntersectionObserver" in window)) return undefined;
        const seen = new IntersectionObserver(([entry]) => {
            if (entry.intersectionRatio >= 0.35) inView.current = true;
            else if (inView.current) { inView.current = false; if (!node.paused) node.pause(); }
        }, { threshold: [0, 0.35] });
        seen.observe(frame.current);
        return () => seen.disconnect();
    }, []);

    // "Watch the film" in the hero centres the frame and starts it.
    useEffect(() => {
        const onClick = (event) => {
            if (!event.target.closest?.('a[href="#film"]')) return;
            event.preventDefault();
            frame.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            play(true);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    // Playback progress for the hairline, written without re-rendering.
    useEffect(() => {
        const node = video.current;
        if (!node) return undefined;
        const tick = () => frame.current?.style.setProperty("--t", (node.currentTime / (node.duration || 64)).toFixed(4));
        node.addEventListener("timeupdate", tick);
        return () => node.removeEventListener("timeupdate", tick);
    }, []);

    const toggleSound = () => {
        const node = video.current;
        if (!node) return;
        node.muted = !node.muted;
        setMuted(node.muted);
    };
    const fullscreen = () => {
        const node = video.current;
        if (document.fullscreenElement) document.exitFullscreen();
        else if (frame.current?.requestFullscreen) frame.current.requestFullscreen();
        else if (node?.webkitEnterFullscreen) node.webkitEnterFullscreen();
    };

    return (
        <section className="film-section section-space" id="film" aria-labelledby="film-title">
            <div className="page-width">
                <div className="section-heading home-section-heading">
                    <h2 id="film-title">Big ideas, in motion.</h2>
                </div>
                <div className="film-frame" ref={frame} data-state={state}>
                    <video
                        ref={video}
                        poster={POSTER}
                        preload="none"
                        playsInline
                        onPlay={() => setState("playing")}
                        onPause={(event) => !event.currentTarget.ended && setState("paused")}
                        onEnded={() => setState("ended")}
                        onClick={toggle}
                        aria-label="Vibyra launch film, 64 seconds, with music"
                    >
                        <source src={SRC} type="video/mp4" />
                    </video>
                    <i className="film-progress" aria-hidden="true" />
                    {state !== "playing" && (
                        <button type="button" className="film-play" onClick={() => play(state === "ended")}>
                            <span className="film-play-body">
                                <span className="film-play-disc"><Icon name="play" size={22} /></span>
                                <span className="film-play-label">
                                    {state === "ended" ? "Watch again" : state === "paused" ? "Resume" : "Watch the film"}
                                    <span>1:04</span>
                                </span>
                            </span>
                        </button>
                    )}
                    {state !== "idle" && (
                        <div className="film-controls">
                            <button type="button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute"}><SoundIcon off={muted} /></button>
                            <button type="button" onClick={fullscreen} aria-label="Full screen"><FullIcon /></button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function SoundIcon({ off = false }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
            {off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11" />}
        </svg>
    );
}

function FullIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
    );
}
