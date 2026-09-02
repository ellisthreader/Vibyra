// Drawing the voice orb. Split from the component so the component is only
// the loop and its lifecycle, and so the shape can change without touching a
// single effect.
//
// The ring used to be fifty-six separate spokes, which at this radius reads as
// a cog rather than a voice: the eye sees the teeth, not the envelope. Here the
// same tested bar data is drawn as two closed curves through those points, so
// what you see is the outline the level traces. Everything the orb paints —
// glow included — is inside the canvas: `base-performance.css` strips CSS
// `filter` under maximum performance, so a drop-shadow glow would vanish for
// exactly the users who cannot afford to lose the only "it is live" signal.

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

export interface OrbMotion {
  /** Keep asking for frames. False draws one frame and stops. */
  live: boolean;
  /** Draw the decoration too — the drift and the resting breath. */
  flourish: boolean;
}

/**
 * What reduced motion is allowed to take away.
 *
 * It may take the decoration, and it may stop the ring entirely in the one
 * mode that is measuring nothing — while a request is in flight, the sweep is
 * an ornament. It may never stop a mode that is showing a real reading: the
 * motion *is* the reading, and a meter holding still is indistinguishable from
 * a microphone that has failed, which is the single question this orb exists
 * to answer. Shipping without that distinction froze the orb outright for
 * anyone on maximum performance, which turns the setting on for them.
 */
export function orbMotion(mode: OrbMode, reduced: boolean): OrbMotion {
  const measuring = mode === "listening" || mode === "speaking";
  return { live: mode !== "idle" && (!reduced || measuring), flourish: !reduced };
}

/** Radius of the quiet core, before loudness pushes the ring outwards. */
const INNER = 0.26;
/** How far the loudest bar can reach, as a share of the orb's radius. */
const REACH = 0.2;

export interface OrbPaint {
  /** One value per ring position, 0–1. Already eased by the caller. */
  bars: number[];
  /** Resolved CSS colour — the caller reads the token, this only draws it. */
  colour: string;
  /** Decorative drift, in radians. Zero when the user has reduced motion. */
  spin: number;
  /** CSS pixel size of the square canvas. */
  size: number;
}

/**
 * A closed curve through every ring position.
 *
 * Quadratic segments between the midpoints of consecutive points, which is the
 * cheapest smoothing that stays exactly on a closed loop — no seam at the
 * wrap, and no control points to keep in sync with the bar count.
 */
function ringPath(
  context: CanvasRenderingContext2D,
  bars: number[],
  mid: number,
  inner: number,
  reach: number,
  spin: number,
): void {
  const count = bars.length;
  const at = (index: number): [number, number] => {
    const angle = ((index % count) / count) * Math.PI * 2 - Math.PI / 2 + spin;
    const radius = inner + (bars[index % count] ?? 0) * reach;
    return [mid + Math.cos(angle) * radius, mid + Math.sin(angle) * radius];
  };

  const [firstX, firstY] = at(0);
  const [lastX, lastY] = at(count - 1);
  context.beginPath();
  context.moveTo((lastX + firstX) / 2, (lastY + firstY) / 2);
  for (let index = 0; index < count; index += 1) {
    const [x, y] = at(index);
    const [nextX, nextY] = at(index + 1);
    context.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
  }
  context.closePath();
}

/** The loudest bar on the ring — what the core and the glow scale with. */
function peak(bars: number[]): number {
  let loudest = 0;
  for (const value of bars) if (value > loudest) loudest = value;
  return loudest;
}

/** One frame. Clears and repaints the whole canvas; nothing is retained. */
export function paintOrb(context: CanvasRenderingContext2D, paint: OrbPaint): void {
  const { bars, colour, spin, size } = paint;
  const mid = size / 2;
  const inner = size * INNER;
  const reach = size * REACH;
  const loudest = peak(bars);

  context.clearRect(0, 0, size, size);

  // The glow. Sized by the ring itself so a loud moment blooms rather than
  // merely stretching — the change in light is what the eye catches first.
  const glow = context.createRadialGradient(mid, mid, inner * 0.2, mid, mid, inner + reach);
  glow.addColorStop(0, colour);
  glow.addColorStop(1, "transparent");
  context.globalAlpha = 0.12 + loudest * 0.26;
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  // The core: a soft disc that breathes with the level, so the orb has a
  // centre of gravity instead of being a hollow outline.
  const core = context.createRadialGradient(mid, mid, 0, mid, mid, inner * (0.72 + loudest * 0.3));
  core.addColorStop(0, colour);
  core.addColorStop(0.55, colour);
  core.addColorStop(1, "transparent");
  context.globalAlpha = 0.16 + loudest * 0.2;
  context.fillStyle = core;
  context.beginPath();
  context.arc(mid, mid, inner * (0.72 + loudest * 0.3), 0, Math.PI * 2);
  context.fill();

  // The inner curve, at reduced amplitude and drifting the other way. Two
  // curves at different speeds is what makes the shape read as fluid rather
  // than as one wobbling circle.
  context.lineJoin = "round";
  context.strokeStyle = colour;
  context.globalAlpha = 0.22 + loudest * 0.22;
  context.lineWidth = Math.max(1, size * 0.008);
  ringPath(context, bars, mid, inner * 0.82, reach * 0.42, -spin * 0.6);
  context.stroke();

  // The outer curve — the level's own outline, and the brightest thing here.
  context.globalAlpha = 0.55 + loudest * 0.45;
  context.lineWidth = Math.max(1.2, size * 0.017);
  ringPath(context, bars, mid, inner, reach, spin);
  context.stroke();

  context.globalAlpha = 1;
}
