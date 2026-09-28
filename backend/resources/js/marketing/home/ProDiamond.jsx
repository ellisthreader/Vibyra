import React, { useEffect, useRef, useState } from 'react';

// The glint is a sprite strip of the 26 flare frames from
// vibyra-pro-sparkle-alpha.webp, stepped by CSS on the same 5s clock as the Pro
// card's light, so every flash lands on the card at the same moment.
// `is-playing` starts both animations in one style change.
export default function ProDiamond() {
    const root = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let visible = false;
        const sync = () => setPlaying(visible && !motion.matches && !document.hidden);
        const observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
        });
        observer.observe(root.current);
        motion.addEventListener('change', sync);
        document.addEventListener('visibilitychange', sync);
        return () => {
            observer.disconnect();
            motion.removeEventListener('change', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, []);
    return <div ref={root} className={`pro-gem-light${playing && ready ? ' is-playing' : ''}`} aria-hidden="true">
        <img className="pro-gem" src="/media/marketing/vibyra-pro.png" alt="" width="768" height="649" loading="lazy" />
        <span className="pro-gem-sparkle">
            <img src="/media/marketing/vibyra-pro-sparkle-strip.webp?v=20260928" alt="" width="6656" height="256"
                onLoad={() => setReady(true)} onError={() => setReady(false)} />
        </span>
    </div>;
}
