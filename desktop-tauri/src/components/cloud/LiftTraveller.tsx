import { useEffect, useRef, useState } from "react";

import { PILL_HEIGHT, RISE_MS, SCRAMBLE_MS, arc, scramble } from "../../lib/cloudLift";
import { NightMark } from "./nightMark";

const BADGE = 40;
const TRAIL_H = 120;


/**
 * One thing going to the cloud (the iPhone's LiftTraveller): a project as a frosted card, or an AI account as its
 * maker's badge. `locked` sweeps a band of light across it, snaps a padlock on and turns its name to cipher text;
 * `flying` carries it up the beam into the cloud on a comet trail, shrinking and fading as it enters, then calls
 * `onLanded`. On the Mac a card only flies once its project has really landed in Vibyra Cloud. `still` (Reduce Motion)
 * skips the flight.
 */
export function LiftTraveller({ kind, label, index, at, to, width, pill, lockDelay, locked, flying, still, onLanded }: {
  kind: "project" | "account"; label: string; index: number; at: { x: number; y: number }; to: { x: number; y: number };
  width: number; pill: number; lockDelay: number; locked: boolean; flying: boolean; still: boolean; onLanded(): void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const landed = useRef(onLanded); landed.current = onLanded;
  const [gone, setGone] = useState(false);
  const text = useScramble(kind === "project" ? label : "", locked && !still, lockDelay + 520);
  const w = kind === "project" ? pill : BADGE, h = kind === "project" ? PILL_HEIGHT : BADGE;

  useEffect(() => { if (still) animations.current.forEach(animation => animation.finish()); }, [still]);
  useEffect(() => {
    if (!flying || gone) return;
    const el = node.current;
    if (still || !el || typeof el.animate !== "function") { setGone(true); landed.current(); return; }
    const path = arc(index, width, at, to);
    const scales = [1, 1.04, 0.95, 0.88, 0.82, 0.62, 0.42, 0.3];
    const fly = el.animate(path.input.map((offset, i) => ({
      offset, transform: `translate(${path.x[i] - at.x}px, ${path.y[i] - at.y}px) scale(${scales[i]})`, opacity: offset > 0.85 ? 1 - (offset - 0.85) / 0.15 : 1,
    })), { duration: RISE_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" });
    const tailAnimation = trail.current?.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0.7, offset: 0.9 }, { opacity: 0, offset: 1 }],
      { duration: RISE_MS, fill: "forwards" });
    animations.current = tailAnimation ? [fly, tailAnimation] : [fly];
    fly.onfinish = () => { setGone(true); landed.current(); };
    return () => { fly.onfinish = null; animations.current.forEach(animation => animation.cancel()); animations.current = []; };
    // The flight starts once; later re-packs of the shelf do not restart it.
  }, [flying]); // eslint-disable-line react-hooks/exhaustive-deps

  const tw = Math.min(w * 0.6, 36);
  const tail = `M0 ${tw / 2} A${tw / 2} ${tw / 2} 0 0 1 ${tw} ${tw / 2} L${tw / 2 + 1} ${TRAIL_H} L${tw / 2 - 1} ${TRAIL_H} Z`;
  const classes = ["cc-traveller", `cc-traveller--${kind}`, locked ? "is-locked" : "", gone ? "is-gone" : ""].join(" ");
  return (
    <div ref={node} className={classes} style={{ left: at.x - w / 2, top: at.y - h / 2, width: w, height: h, ["--lock-delay" as string]: `${lockDelay}ms`, ["--sweep-to" as string]: `${w + 12}px` }}>
      <div ref={trail} className="cc-traveller__trail" style={{ left: (w - tw) / 2, top: h / 2, width: tw }}>
        <svg width={tw} height={TRAIL_H}>
          <defs>
            <linearGradient id={`cc-trail-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#C9D5FF" stopOpacity={0.9} />
              <stop offset="0.35" stopColor="#7C9BFF" stopOpacity={0.45} />
              <stop offset="1" stopColor="#7C9BFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={tail} fill={`url(#cc-trail-${index})`} />
        </svg>
      </div>
      <div className="cc-traveller__body">
        <span className="cc-traveller__ring" />
        <span className="cc-traveller__clip"><span className="cc-traveller__sweep" /></span>
        {kind === "project" ? (
          <>
            <span className="cc-traveller__lead">
              <svg className="cc-traveller__folder" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <Padlock className="cc-traveller__lock" size={12} />
            </span>
            <span className={`cc-traveller__name${text !== label ? " is-cipher" : ""}`}>{text}</span>
          </>
        ) : (
          <>
            <NightMark maker={label} size={24} />
            <span className="cc-traveller__badge-lock"><Padlock size={9} /></span>
          </>
        )}
      </div>
    </div>
  );
}

function Padlock({ size, className }: { size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** The name, turning to cipher text from `startMs` after locking began, re-rolled every frame while it turns. */
function useScramble(name: string, active: boolean, startMs: number) {
  const [text, setText] = useState(name);
  const seed = useRef(0);
  useEffect(() => {
    setText(name);
    if (!active || !name) return;
    let timer: number | null = null;
    const begin = window.setTimeout(() => {
      const started = Date.now();
      timer = window.setInterval(() => {
        const progress = (Date.now() - started) / SCRAMBLE_MS;
        setText(scramble(name, progress, ++seed.current));
        if (progress >= 1.6 && timer) window.clearInterval(timer);
      }, 45);
    }, startMs);
    return () => { window.clearTimeout(begin); if (timer) window.clearInterval(timer); };
  }, [name, active, startMs]);
  return text;
}
