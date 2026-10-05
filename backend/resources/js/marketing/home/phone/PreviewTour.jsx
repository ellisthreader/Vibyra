import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../shared.jsx";
import TourPhone from "./TourPhone.jsx";
import { SPEED, chapters, phoneLabels } from "./tourStory.js";

const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export default function PreviewTour({ onClose, onWaitlist }) {
    const [index, setIndex] = useState(0);
    const [run, setRun] = useState(0);
    const [paused, setPaused] = useState(false);
    const [hidden, setHidden] = useState(() => document.hidden);
    const swipe = useRef(null);
    const chapter = chapters[index];
    const go = (next, focus = false) => {
        const target = (next + chapters.length) % chapters.length;
        setIndex(target);
        setRun(value => value + 1);
        if (focus) document.getElementById(`tour-tab-${chapters[target].id}`)?.focus();
    };
    useEffect(() => {
        const sync = () => setHidden(document.hidden);
        document.addEventListener("visibilitychange", sync);
        return () => document.removeEventListener("visibilitychange", sync);
    }, []);
    const onKeys = event => {
        const step = keys[event.key];
        const jump = { Home: 0, End: chapters.length - 1 }[event.key];
        if (step === undefined && jump === undefined) return;
        event.preventDefault();
        go(jump ?? index + step, true);
    };
    const onPointerUp = event => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || Math.abs(event.clientX - start) < 44) return;
        go(index + (event.clientX < start ? 1 : -1));
    };
    return <div className="tour" data-halted={paused || hidden ? "" : undefined} style={{ "--tour-dur": `${Math.round(chapter.duration / SPEED)}ms` }}>
        <button type="button" className="tour-close" onClick={onClose} aria-label="Close preview"><Icon name="close" size={20} /></button>
        <div className="tour-copy">
            <p className="tour-eyebrow">Vibyra for iPhone</p>
            <h3 id="pocket-dialog-title">Build from your pocket.</h3>
            <div className="tour-chapters" role="tablist" aria-orientation="vertical" aria-label="Preview chapters" onKeyDown={onKeys}>
                {chapters.map((item, position) => {
                    const active = position === index;
                    return <button key={item.id} type="button" role="tab" id={`tour-tab-${item.id}`}
                        className={`tour-chapter${position < index ? " is-done" : ""}`}
                        aria-selected={active} aria-controls="tour-stage" tabIndex={active ? 0 : -1} onClick={() => go(position)}>
                        <span className="tour-track">{active && <i key={run} onAnimationEnd={() => go(index + 1)} />}</span>
                        <span className="tour-chapter-title">{item.title}</span>
                        <span className="tour-chapter-text">{item.text}</span>
                    </button>;
                })}
            </div>
            <p className="tour-caption" aria-hidden="true"><b key={`t-${run}`}>{chapter.title}</b><span key={`s-${run}`}>{chapter.text}</span></p>
            <div className="tour-cta">
                <button type="button" className="tour-join" onClick={onWaitlist}>Join iPhone waitlist</button>
                <span>Coming October 2026<br />Sample project shown</span>
            </div>
        </div>
        <div className="tour-stage" id="tour-stage" role="tabpanel" aria-labelledby={`tour-tab-${chapter.id}`}
            onPointerDown={event => { swipe.current = event.clientX; }} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }}>
            <div className="tour-light" aria-hidden="true" />
            <div role="img" aria-label={phoneLabels[chapter.id]}><div aria-hidden="true"><TourPhone chapter={chapter.id} run={run} /></div></div>
            <button type="button" className="tour-pause" onClick={() => setPaused(value => !value)}
                aria-label={paused ? "Play preview" : "Pause preview"} aria-pressed={paused}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paused ? <path d="m9 6 10 6-10 6Z" /> : <path d="M8 6h3v12H8zM13 6h3v12h-3z" />}</svg>
            </button>
        </div>
    </div>;
}
