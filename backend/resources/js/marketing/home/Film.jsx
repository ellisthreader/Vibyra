import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared.jsx";

const SRC = "/media/vibyra-film.mp4?v=2";
// The film's own first frame, so the hand-over from poster to playback is invisible.
const POSTER = "/media/vibyra-film-poster.png?v=2";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* The launch film (remotion/src/film) as a scroll moment, not a player.
 * Scrolling in lifts the frame out of a tilt and grows it to fill the screen
 * (--p, 0→1, written straight onto the section); once it is in place the film
 * plays by itself. Browsers only allow sound after the visitor has clicked or
 * pressed a key on the page, so if the unmuted start is refused it plays muted
 * and the first click or key anywhere turns the sound on. It pauses when
 * scrolled away and picks up where it was. No dialog, no scroll lock. */
export default function Film() {
    const section = useRef(null);
    const stage = useRef(null);
    const video = useRef(null);
    const wantSound = useRef(true);
    const [muted, setMuted] = useState(false);
    const [waitingForSound, setWaitingForSound] = useState(false);
    const [ended, setEnded] = useState(false);
    const [still, setStill] = useState(false);

    const play = async (fromStart = false) => {
        const node = video.current;
        if (!node) return;
        if (fromStart || node.ended) node.currentTime = 0;
        setEnded(false);
        node.muted = !wantSound.current;
        try {
            await node.play();
            setMuted(node.muted);
            setWaitingForSound(false);
        } catch {
            node.muted = true;
            setMuted(true);
            setWaitingForSound(wantSound.current);
            try { await node.play(); } catch { /* the poster stays */ }
        }
    };

    // Scroll progress → --p, one write per frame, no re-render.
    useEffect(() => {
        const el = section.current;
        if (!el) return undefined;
        if (reducedMotion()) {
            setStill(true);
            el.style.setProperty("--p", "1");
            return undefined;
        }
        let frame = 0;
        const update = () => {
            frame = 0;
            const top = el.getBoundingClientRect().top;
            const p = Math.min(1, Math.max(0, 1 - top / (window.innerHeight * 0.92)));
            el.style.setProperty("--p", p.toFixed(4));
        };
        const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    // Load ahead, start when the frame has landed, pause when it leaves.
    useEffect(() => {
        const node = video.current;
        const frameEl = stage.current;
        if (!node || !frameEl || !("IntersectionObserver" in window)) return undefined;
        const near = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { node.preload = "auto"; near.disconnect(); }
        }, { rootMargin: "1200px 0px" });
        near.observe(frameEl);
        const seen = new IntersectionObserver(([entry]) => {
            if (still) return;
            if (entry.intersectionRatio >= 0.72) { if (node.paused && !node.ended) play(); }
            else if (entry.intersectionRatio < 0.3 && !node.paused) node.pause();
        }, { threshold: [0, 0.3, 0.72, 1] });
        seen.observe(frameEl);
        return () => { near.disconnect(); seen.disconnect(); };
    }, [still]);

    // The first click or key anywhere on the page is what lets sound play.
    useEffect(() => {
        if (!waitingForSound) return undefined;
        const unmute = (event) => {
            if (event.target.closest?.(".film-frame")) return; // the frame's own controls handle it
            const node = video.current;
            if (!node || !wantSound.current) return;
            node.muted = false;
            setMuted(false);
            setWaitingForSound(false);
            if (node.paused && !node.ended) node.play().catch(() => undefined);
        };
        const opts = { capture: true };
        window.addEventListener("pointerdown", unmute, opts);
        window.addEventListener("keydown", unmute, opts);
        return () => {
            window.removeEventListener("pointerdown", unmute, opts);
            window.removeEventListener("keydown", unmute, opts);
        };
    }, [waitingForSound]);

    // "Watch the film" in the hero scrolls here and starts it with sound.
    useEffect(() => {
        const onClick = (event) => {
            if (!event.target.closest?.('a[href="#film"]')) return;
            wantSound.current = true;
            play(true);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    });

    // Playback progress for the hairline, written without re-rendering.
    useEffect(() => {
        const node = video.current;
        if (!node) return undefined;
        const tick = () => stage.current?.style.setProperty("--t", (node.currentTime / (node.duration || 64)).toFixed(4));
        node.addEventListener("timeupdate", tick);
        return () => node.removeEventListener("timeupdate", tick);
    }, []);

    const toggleSound = () => {
        const node = video.current;
        if (!node) return;
        wantSound.current = node.muted;
        node.muted = !node.muted;
        setMuted(node.muted);
        setWaitingForSound(false);
        if (node.paused) play();
    };
    const fullscreen = () => {
        const node = video.current;
        const target = stage.current;
        if (!node || !target) return;
        if (document.fullscreenElement) document.exitFullscreen();
        else if (target.requestFullscreen) target.requestFullscreen();
        else if (node.webkitEnterFullscreen) node.webkitEnterFullscreen();
    };

    return (
        <section className="film-section" id="film" ref={section} aria-labelledby="film-title" data-still={still}>
            <div className="film-sticky">
                <div className="film-heading home-section-heading">
                    <h2 id="film-title">Big ideas, <span>in motion.</span></h2>
                </div>
                <div className="film-frame" ref={stage} data-ended={ended}>
                    <video
                        ref={video}
                        poster={POSTER}
                        preload="metadata"
                        playsInline
                        onEnded={() => setEnded(true)}
                        onClick={toggleSound}
                        aria-label="Vibyra launch film, 64 seconds, with music"
                    >
                        <source src={SRC} type="video/mp4" />
                    </video>
                    <i className="film-progress" aria-hidden="true" />
                    {waitingForSound && (
                        <button type="button" className="film-sound-hint" onClick={toggleSound}>
                            <SoundIcon off />Click anywhere for sound
                        </button>
                    )}
                    {(ended || still) && (
                        <button type="button" className="film-replay" onClick={() => { wantSound.current = true; play(true); }}>
                            <span><Icon name="play" size={26} /></span>{ended ? "Watch again" : "Watch the film"}
                        </button>
                    )}
                    <div className="film-controls">
                        <button type="button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute"}><SoundIcon off={muted} /></button>
                        <button type="button" onClick={fullscreen} aria-label="Full screen"><FullIcon /></button>
                    </div>
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
