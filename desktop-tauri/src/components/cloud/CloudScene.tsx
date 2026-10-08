import { useEffect, useMemo, useRef, useState } from "react";

import { MAX_CARDS, SCENE_HEIGHT, STAGGER_MS, sceneLayout, slots, travellers } from "../../lib/cloudLift";
import { CLOUD_H, CLOUD_W, CloudShape } from "./CloudShape";
import { LiftTraveller } from "./LiftTraveller";

export type ScenePhase = "waiting" | "connecting" | "flying" | "landed" | "failed";

/** Which picked project ids a traveller stands for: one each, the last "+N more" card for all the rest. */
function standsFor(index: number, ids: string[]): string[] {
  if (ids.length <= MAX_CARDS) return [ids[index]];
  return index < MAX_CARDS - 1 ? [ids[index]] : ids.slice(MAX_CARDS - 1);
}

/**
 * The Connect to cloud scene (the iPhone's CloudLiftScene), drawn over the page's night sky: the picked projects (and
 * the AI accounts coming along) wait above the Mac, a faint beam rising from its screen to the cloud. On Connect the
 * beam brightens and each card is swept by light, locks and turns to cipher text. Unlike the phone, a project card
 * only shoots up the beam once that project has really landed in Vibyra Cloud (`arrived`), so the flight is the
 * progress; the cloud fills as they arrive and the finale (`landed`) brightens the sky, bursts and draws the tick.
 * Decorative: the sheet says all of it in words.
 */
export function CloudScene({ projects, accounts, phase, arrived, still }: {
  projects: { id: string; name: string }[]; accounts: string[]; phase: ScenePhase; arrived: string[]; still: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [landedKeys, setLandedKeys] = useState<string[]>([]);
  const [bursts, setBursts] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const names = useMemo(() => projects.map((p) => p.name), [projects]);
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const items = useMemo(() => travellers(names, accounts), [names, accounts]);
  useEffect(() => { if (phase === "waiting" || phase === "failed") setLandedKeys([]); }, [phase]);

  const moving = phase === "connecting" || phase === "flying" || phase === "landed";
  const sent = phase === "flying" || phase === "landed";
  const layout = sceneLayout(width);
  const at = slots(items, width);
  const landing = { x: layout.cloud.x, y: layout.cloud.y + 22 };
  const share = items.length ? landedKeys.length / items.length : 0;
  const level = phase === "landed" ? 1 : 0.85 * share;
  return (
    <div ref={box} className={`cc-scene cc-scene--${phase}${still ? " is-still" : ""}`} style={{ height: SCENE_HEIGHT }} aria-hidden="true">
      {width > 0 && <>
        <svg className="cc-beam" width={width} height={SCENE_HEIGHT}>
          <defs>
            <linearGradient id="cc-beam-light" x1="0" y1={landing.y} x2="0" y2={layout.mac.top + 6} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#C9D5FF" stopOpacity={0.5} />
              <stop offset="0.45" stopColor="#7C9BFF" stopOpacity={0.12} />
              <stop offset="1" stopColor="#C9D5FF" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <polygon fill="url(#cc-beam-light)" points={`${layout.mac.x - 54},${layout.mac.top + 6} ${layout.mac.x + 54},${layout.mac.top + 6} ${landing.x + 30},${landing.y} ${landing.x - 30},${landing.y}`} />
        </svg>
        {!still && <div className="cc-motes" style={{ left: layout.mac.x, top: layout.mac.top + 6, ["--rise" as string]: `${landing.y - layout.mac.top - 6}px` }}>
          {Array.from({ length: 7 }, (_, i) => <span key={i} className="cc-mote" style={{ ["--lane" as string]: `${((i * 37) % 11 - 5) * 4}px`, animationDelay: `${(i * 1500) / 7}ms`, width: i % 3 === 0 ? 5 : 3, height: i % 3 === 0 ? 5 : 3 }} />)}
        </div>}
        <div className="cc-mac" style={{ left: layout.mac.x - 84, top: layout.mac.top }}>
          <div className="cc-mac__lid"><div className="cc-mac__screen"><span className="cc-mac__light" />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(232,238,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 16l5-4-5-4" /><path d="M12 17h7" /></svg>
          </div></div>
          <div className="cc-mac__deck"><span className="cc-mac__lip" /></div>
        </div>
        {items.map((item, i) => {
          const owns = item.kind === "project" ? standsFor(i, ids) : [];
          const key = item.kind === "project" ? `project:${owns.join(":")}` : `account:${item.label}`;
          const flying = item.kind === "account" ? sent : sent && owns.length > 0 && owns.every((id) => arrived.includes(id));
          return <LiftTraveller key={key} kind={item.kind} label={item.label} index={i} at={at[i].at} to={landing} width={width}
            pill={at[i].width} lockDelay={i * STAGGER_MS} locked={moving} flying={flying} still={still}
            onLanded={() => { setLandedKeys((keys) => (keys.includes(key) ? keys : [...keys, key])); setBursts((n) => n + 1); }} />;
        })}
        <div className="cc-cloud-wrap" style={{ left: layout.cloud.x - CLOUD_W / 2, top: layout.cloud.y - CLOUD_H / 2 - 8 }}>
          <CloudShape level={level} tick={phase === "landed"} glow={phase === "landed" ? 1 : share} />
        </div>
        {bursts > 0 && !still && <Sparks key={`b${bursts}`} x={landing.x} y={landing.y} count={10} radius={52} size={5} />}
        {phase === "landed" && !still && <Sparks key="finale" x={layout.cloud.x} y={layout.cloud.y} count={22} radius={Math.min(170, width * 0.46)} size={7} finale />}
      </>}
    </div>
  );
}

/** A burst of sparks from one point with a ring of light spreading behind them; plays once on mount. Decorative. */
function Sparks({ x, y, count, radius, size, finale }: { x: number; y: number; count: number; radius: number; size: number; finale?: boolean }) {
  const ring = radius * 0.9;
  return (
    <div className={`cc-sparks${finale ? " cc-sparks--finale" : ""}`} style={{ left: x, top: y }}>
      <span className="cc-sparks__ring" style={{ width: ring * 2, height: ring * 2, left: -ring, top: -ring }} />
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.21;
        const reach = radius * (0.7 + (i % 4) * 0.1);
        const d = i % 2 === 0 ? size : size * 0.65;
        return <span key={i} className="cc-spark" style={{ width: d, height: d, left: -d / 2, top: -d / 2,
          ["--dx" as string]: `${Math.cos(angle) * reach}px`, ["--dy" as string]: `${Math.sin(angle) * reach * 0.8 + reach * 0.15}px` }} />;
      })}
    </div>
  );
}
