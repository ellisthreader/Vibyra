import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../shared.jsx";

const scenes = [
    { id: "projects", label: "Shared projects", description: "Orbit, Weekend project, and Studio website opening on both your computer and phone.", version: "20260928-3", mobileVersion: "20260928-5" },
    { id: "terminal", label: "Same terminal", description: "A terminal running on your computer, viewed from your phone." },
    { id: "preview", label: "Live preview", description: "Your computer's preview, open on your phone." },
];

function ProductRecording({ scene }) {
    const video = useRef(null);
    const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
    const name = compact ? `mobile-${scene.id}` : scene.id;
    const version = compact ? scene.mobileVersion ?? "20260928-4" : scene.version ?? "20260927-3";
    useEffect(() => {
        const media = window.matchMedia("(max-width: 760px)");
        const sync = () => setCompact(media.matches);
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const sync = () => {
            if (media.matches) { video.current?.pause(); return; }
            video.current?.play().catch(() => {});
        };
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, [compact]);
    return <video key={name} ref={video} className={`pl-recording${compact ? " is-portrait" : ""}`} controls loop muted playsInline
        preload="metadata" poster={`/media/pocket/${name}.jpg?v=${version}`}
        aria-label={scene.description}>
        <source src={`/media/pocket/${name}.mp4?v=${version}`} type="video/mp4" />
        Your browser cannot play this product recording.
    </video>;
}

export default function PocketDemo() {
    const [view, setView] = useState("projects");
    const current = scenes.find(scene => scene.id === view);
    const onKeys = event => {
        const focused = scenes.findIndex(scene => event.target.id === `link-tab-${scene.id}`);
        const index = focused < 0 ? scenes.findIndex(scene => scene.id === view) : focused;
        const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
        if (next !== undefined) {
            event.preventDefault();
            setView(scenes[next].id);
            document.getElementById(`link-tab-${scenes[next].id}`)?.focus();
        }
    };
    return <div className="pocket-link-demo">
        <h4 className="pl-title">Your computer. Right here.</h4>
        <div className="pl-connection" role="img" aria-label="End-to-end encrypted connection from your computer, through Vibyra Cloud, to your phone">
            <span className="pl-endpoint"><Icon name="monitor" size={19} /><span>Computer</span></span>
            <span className="pl-wire" key={`computer-${view}`}><i /></span>
            <span className="pl-cloud"><Icon name="shield" size={26} /><span>End-to-end encrypted<small>Vibyra Cloud</small></span></span>
            <span className="pl-wire" key={`phone-${view}`}><i /></span>
            <span className="pl-endpoint"><Icon name="phone" size={19} /><span>iPhone</span></span>
        </div>
        <div className="pl-tabs" role="tablist" aria-label="Watch the computer and phone connection" onKeyDown={onKeys}>
            {scenes.map(scene => <button key={scene.id} id={`link-tab-${scene.id}`} type="button" role="tab"
                aria-selected={view === scene.id} aria-controls="pocket-link-panel" tabIndex={view === scene.id ? 0 : -1}
                onClick={() => setView(scene.id)}>{scene.label}</button>)}
        </div>
        <div className="pl-stage" role="tabpanel" id="pocket-link-panel" aria-labelledby={`link-tab-${view}`} tabIndex={0}>
            <ProductRecording key={view} scene={current} />
        </div>
        <div className="pl-footnote"><span><Icon name="shield" size={14} /> Your computer runs the work. The Cloud relay cannot read it.</span><span>Recorded product UI · Example project</span></div>
    </div>;
}
