import { useId } from "react";
import { OUTLINE } from "../CloudShape";

// The exact iOS CloudSkyHero puff bank, in the same 400 × 70 coordinate space.
function bank(puffs: [number, number, number][], bottom: number) {
  const meet = (a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    const l = (a[2] ** 2 - b[2] ** 2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a[2] ** 2 - l * l));
    const px = a[0] + l * dx / d, py = a[1] + l * dy / d;
    return [[px + h * dy / d, py - h * dx / d], [px - h * dy / d, py + h * dx / d]].sort((p, q) => p[1] - q[1])[0];
  };
  const first = puffs[0], last = puffs[puffs.length - 1];
  const points = [[first[0] - first[2], first[1]], ...puffs.slice(1).map((p, i) => meet(puffs[i], p)), [last[0] + last[2], last[1]]];
  let path = `M${points[0][0].toFixed(1)} ${bottom} L${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  const angle = (c: number[], p: number[]) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  puffs.forEach((c, i) => {
    let span = angle(c, points[i + 1]) - angle(c, points[i]);
    while (span <= 0) span += Math.PI * 2;
    path += ` A${c[2]} ${c[2]} 0 ${span > Math.PI ? 1 : 0} 1 ${points[i + 1][0].toFixed(1)} ${points[i + 1][1].toFixed(1)}`;
  });
  return `${path} L${points[points.length - 1][0].toFixed(1)} ${bottom} Z`;
}
const SEA = bank([[-10, 44, 34], [44, 36, 30], [96, 46, 26], [150, 34, 34], [210, 44, 28], [262, 32, 36], [322, 42, 30], [372, 36, 34], [416, 46, 30]], 70);

export function CloudPageArt() {
  const id = useId().replace(/:/g, "");
  return <>
    {[[-6, 40, 110, 0.13], [71, 14, 84, 0.1], [80, 112, 64, 0.08]].map(([left, top, width, opacity], i) => (
      <svg key={i} className={`cloud-page__far cloud-page__far--${i}`} width={width} height={width * 104 / 220}
        viewBox="0 20 220 104" style={{ left: `${left}%`, top, opacity }}>
        <defs><linearGradient id={`${id}-far-${i}`} x1="0" y1="24" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#DCE4FF" /><stop offset=".7" stopColor="#DCE4FF" stopOpacity=".25" /><stop offset="1" stopColor="#DCE4FF" stopOpacity="0" />
        </linearGradient></defs><path d={OUTLINE} fill={`url(#${id}-far-${i})`} />
      </svg>
    ))}
    <svg className="cloud-page__sea" viewBox="0 0 400 70" preserveAspectRatio="none">
      <defs><linearGradient id={`${id}-sea`} x1="0" y1="30" x2="0" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#BCC9F2" stopOpacity=".13" /><stop offset="1" stopColor="#BCC9F2" stopOpacity="0" />
      </linearGradient></defs><path d={SEA} fill={`url(#${id}-sea)`} />
    </svg>
  </>;
}
