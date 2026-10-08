/** The night sky's own colours (the iPhone's `SKY`, mobile/src/cloud/SceneSky.tsx): the stage stays dark in the light
 * theme too, so the light reads as light. The CSS mirrors these as `--sky-*` on `.cc-page`. */
export const SKY = {
  top: "#05070E", middle: "#070A14", bottom: "#0A0E1C",
  glow: "#7C9BFF", core: "#C9D5FF", star: "#E8EEFF",
  glass: "rgba(255,255,255,0.09)", glassEdge: "rgba(255,255,255,0.22)", text: "#F4F6FF", muted: "rgba(232,238,255,0.6)",
  sheet: "#111626", well: "#070A14", line: "rgba(255,255,255,0.07)", ring: "rgba(232,238,255,0.3)",
};

/** Stars at fixed, scattered spots (the phone's hash, so both skies agree), in three groups that twinkle out of step. */
function stars() {
  const out: { x: number; y: number; r: number; group: number }[] = [];
  let seed = 7;
  const next = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 60; i++) out.push({ x: 3 + next() * 94, y: 2 + next() * 58, r: 0.6 + next() * 1.1, group: i % 3 });
  return out;
}
const STARS = stars();

/**
 * The stage: a quiet, near-flat deep navy night sky behind the whole page, a soft glow where the cloud sits, and stars
 * that twinkle softly (still under Reduce Motion). `dawn` washes it with light from the cloud for the finale.
 * Decorative.
 */
export function SceneSky({ dawn }: { dawn: boolean }) {
  return (
    <div className="cc-sky" aria-hidden="true">
      {[0, 1, 2].map((group) => (
        <svg key={group} className={`cc-sky__stars cc-sky__stars--${group}`} width="100%" height="100%">
          {STARS.filter((star) => star.group === group).map((star, i) => (
            <circle key={i} cx={`${star.x}%`} cy={`${star.y}%`} r={star.r} fill={SKY.star} opacity={0.5 + star.r / 3.4} />
          ))}
        </svg>
      ))}
      <div className={`cc-sky__dawn${dawn ? " is-on" : ""}`} />
    </div>
  );
}
