import { useId } from "react";
import { SKY } from "./SceneSky";

// The iPhone's cloud (mobile/src/cloud/CloudShape.tsx), drawn the same way for the web.
export const CLOUD_W = 220;
export const CLOUD_H = 150;
/** The tick's drawn length, for its dash offset. */
const TICK_LENGTH = 66;
/** Where the cloud sits flat, as a real cumulus does. */
const BASE = 120;

/** The puffs, left to right ([x, y, r]): small at the ends, one tall one just off centre, so it reads as cumulus. */
const PUFFS: [number, number, number][] = [[46, 100, 20], [74, 82, 27], [112, 62, 38], [150, 74, 30], [180, 98, 22]];

/** The outline: around each puff's top between its neighbours, then a flat base. One path, not overlapping circles. */
function outline() {
  const meet = (a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    const l = (a[2] ** 2 - b[2] ** 2 + d * d) / (2 * d), h = Math.sqrt(a[2] ** 2 - l * l);
    const px = a[0] + (l * dx) / d, py = a[1] + (l * dy) / d;
    return [[px + (h * dy) / d, py - (h * dx) / d], [px - (h * dy) / d, py + (h * dx) / d]].sort((p, q) => p[1] - q[1])[0];
  };
  const angle = (c: number[], p: number[]) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const first = PUFFS[0], last = PUFFS[PUFFS.length - 1];
  const points = [[first[0], first[1] + first[2]], ...PUFFS.slice(1).map((p, i) => meet(PUFFS[i], p)), [last[0], last[1] + last[2]]];
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  PUFFS.forEach((c, i) => {
    const [from, to] = [points[i], points[i + 1]];
    let span = angle(c, to) - angle(c, from);
    while (span <= 0) span += Math.PI * 2;
    d += ` A${c[2]} ${c[2]} 0 ${span > Math.PI ? 1 : 0} 1 ${to[0].toFixed(2)} ${to[1].toFixed(2)}`;
  });
  return `${d} Z`;
}
export const OUTLINE = outline();

/**
 * The cloud, lit against the night sky: a soft halo, a body whose puffs are lit from above and shaded underneath, blue
 * light that fills it from the base as each project arrives (`level` 0 → 1) and a tick that draws itself on landing.
 * The level and tick move with CSS transitions, so Reduce Motion (which turns transitions off) simply jumps.
 */
export function CloudShape({ level, tick, glow }: { level: number; tick: boolean; glow: number }) {
  const id = useId().replaceAll(":", "");
  const rise = -(BASE + 4 - 18) * Math.max(0, Math.min(1, level));
  return (
    <svg width={CLOUD_W} height={CLOUD_H} viewBox={`0 0 ${CLOUD_W} ${CLOUD_H}`} className="cc-cloud">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="56%" rx="50%" ry="46%">
          <stop offset="0" stopColor={SKY.glow} stopOpacity={0.6} />
          <stop offset="1" stopColor={SKY.glow} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="24" x2="0" y2={BASE} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#E9EDF7" />
          <stop offset="1" stopColor="#AEB8D3" />
        </linearGradient>
        <radialGradient id={`${id}-puff`} cx="38%" cy="30%" rx="70%" ry="70%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.25} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-underside`} x1="0" y1="88" x2="0" y2={BASE} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5C6A99" stopOpacity={0} />
          <stop offset="1" stopColor="#5C6A99" stopOpacity={0.45} />
        </linearGradient>
        <linearGradient id={`${id}-level`} x1="0" y1="18" x2="0" y2={BASE + 4} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A9BCFF" stopOpacity={0.9} />
          <stop offset="1" stopColor="#3F5FE0" stopOpacity={0.95} />
        </linearGradient>
        <clipPath id={`${id}-shape`}><path d={OUTLINE} /></clipPath>
      </defs>
      <rect x={0} y={0} width={CLOUD_W} height={CLOUD_H} fill={`url(#${id}-halo)`} className="cc-cloud__halo" style={{ opacity: 0.4 + 0.6 * glow }} />
      <path d={OUTLINE} fill="none" stroke="#DDE4F7" strokeOpacity={0.08} strokeWidth={5} strokeLinejoin="round" />
      <path d={OUTLINE} fill={`url(#${id}-body)`} />
      <g clipPath={`url(#${id}-shape)`}>
        {PUFFS.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill={`url(#${id}-puff)`} />)}
        <rect x={0} y={88} width={CLOUD_W} height={BASE - 88} fill={`url(#${id}-underside)`} />
        <rect x={0} y={BASE + 4} width={CLOUD_W} height={CLOUD_H} fill={`url(#${id}-level)`} className="cc-cloud__level"
          style={{ transform: `translateY(${rise}px)` }} />
        {PUFFS.map(([x, y, r]) => <circle key={`lit${x}`} cx={x} cy={y} r={r} fill={`url(#${id}-puff)`} opacity={0.35} />)}
        <ellipse cx={112} cy={BASE + 6} rx={90} ry={10} fill="#1B2547" opacity={0.25} />
      </g>
      <path d="M94 94 L110 108 L140 76" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none"
        className="cc-cloud__tick" strokeDasharray={`${TICK_LENGTH} ${TICK_LENGTH}`} style={{ strokeDashoffset: tick ? 0 : TICK_LENGTH }} />
    </svg>
  );
}
