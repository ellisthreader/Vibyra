/** Codex ignition adapted from OpenAI's Apache-2.0 CLI renderer.
 * See third-party/codex-effort/NOTICE. Geometry is in terminal character cells.
 * Claude's observed 2.1.278 picker uses an 80ms, 8-shade violet radial wave.
 */
export type IgnitionStyle = 'wave' | 'aurora' | 'pulse';
export type EffortTier = 'max' | 'ultra';
type RGB = [number, number, number];
type Band = [number, number, number];
export const RAINBOW = ['#eb5f57', '#f58b57', '#fac35f', '#91c882', '#82aadc', '#9b82c8', '#c882b4'];
export function ignitionDuration(style: IgnitionStyle, tier: EffortTier) {
  return { wave: [1000, 1300], aurora: [1300, 1600], pulse: [900, 1250] }[style][tier === 'max' ? 0 : 1];
}
export function ignitionHues(tier: EffortTier, light: boolean): RGB[] {
  if (tier === 'max') return light ? [[176,98,0],[150,110,0],[200,70,20]] : [[255,178,66],[255,214,120],[255,120,60]];
  return light ? [[124,58,217],[190,40,150],[30,100,220]] : [[186,130,255],[255,120,220],[120,170,255]];
}
function bands(style: IgnitionStyle, tier: EffortTier): Band[] {
  const ultra = tier === 'ultra';
  if (style === 'wave') return ultra ? [[.10,.70,1],[.35,.55,1]] : [[.10,.75,1]];
  if (style === 'pulse') return ultra ? [[.10,.55,.8],[.45,.55,1.1]] : [[.10,.60,1]];
  return ultra ? [[.35,.15,0],[-.50,.60,1],[.75,.35,2]] : [[.35,.15,0],[-.50,.60,1]];
}
const crest = (distance: number) => distance >= 1 ? 0 : .5 * (1 + Math.cos(Math.PI * distance));
function sample(style: IgnitionStyle, [a,b,c]: Band, seconds: number, x: number, width: number): [number, number] {
  if (style === 'aurora') {
    const center = (.5 + .38 * Math.sin(2 * Math.PI * (a * seconds + b))) * width;
    return [c, crest(Math.abs(x - center) / Math.max(width * .22, 4))];
  }
  const p = (seconds - a) / b;
  if (p < 0 || p > 1) return [0, 0];
  if (style === 'wave') {
    const eased = p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    return [0, crest(Math.abs(x - (eased * (width + 18) - 9)) / 9)];
  }
  const radius = (1 - (1 - p) ** 3) * (width / 2 + 9);
  return [0, crest(Math.abs(Math.abs(x - width / 2) - radius) / 4.5) * c * (1 - .6 * p)];
}
export function ignitionColumn(style: IgnitionStyle, tier: EffortTier, ms: number, x: number, width: number, light: boolean) {
  const total = ignitionDuration(style, tier);
  if (ms <= 0 || ms >= total) return null;
  const weights = [0, 0, 0];
  for (const band of bands(style, tier)) {
    const [hue, strength] = sample(style, band, ms / 1000, x, width);
    weights[hue] = style === 'aurora' ? weights[hue] + strength : Math.max(weights[hue], strength);
  }
  const weight = weights.reduce((sum, w) => sum + w, 0);
  if (weight <= .01) return null;
  const hues = ignitionHues(tier, light);
  const color = [0,1,2].map(channel => Math.floor(weights.reduce((sum,w,i) => sum + w * hues[i][channel], 0) / weight));
  const alpha = style === 'aurora' ? Math.min(weight * .40, .50) * Math.max(0, Math.min(1, ms / 250, (total - ms) / 400)) : weight * .55;
  return { color: `rgb(${color.join(',')})`, alpha: Math.min(alpha, .6) };
}
export function claudeRippleCell(ms: number, column: number, row: number, origin: number) {
  const travel = Math.floor(ms / 80) * 80 * .03;
  const distance = Math.hypot(column - origin, (row - 2) * 2);
  if (distance > travel) return null;
  const phase = ((distance - travel) % 20 + 20) % 20;
  const shade = Math.min(7, Math.round((1 + Math.cos(2 * Math.PI * phase / 20)) / 2 * 7));
  return `rgb(${[62,22,118].map((v,i) => Math.round(v + ([140,80,240][i] - v) * shade / 7)).join(',')})`;
}
