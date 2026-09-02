// The shape of the voice orb: a ring of bars, driven by whoever is talking.
//
// Two sources feed the same ring and they are not the same kind of data. The
// microphone gives one scalar level per event, so its bars are a stylised
// profile of that single number. Playback gives a real frequency spectrum from
// an AnalyserNode, so its bars are the spectrum itself, folded to a mirror.
// Keeping both pure means the motion is unit-tested rather than eyeballed.

/** Bars around the ring. Even, so the spectrum can be mirrored across it. */
export const BAR_COUNT = 56;
/** Every bar is visible at silence: a ring that vanishes reads as a fault. */
const FLOOR = 0.12;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A fixed profile that makes one scalar look like a voice: tallest at the
 * front of the ring, tapering to the back, with a fine alternation so the
 * ring never reads as a smooth mechanical circle.
 */
export function barsFromLevel(level: number, count = BAR_COUNT): number[] {
  const eased = clamp01(level);
  return Array.from({ length: count }, (_, index) => {
    const around = (index / count) * Math.PI * 2;
    const lobe = 0.55 + 0.45 * Math.cos(around);
    const grain = 0.82 + 0.18 * Math.sin(index * 2.399);
    return clamp01(FLOOR + eased * lobe * grain);
  });
}

/**
 * The real spectrum, folded so the ring is symmetric left to right. Only the
 * lower bins carry speech, so the upper half of the range is dropped rather
 * than drawn as a permanently flat arc.
 */
export function barsFromSpectrum(data: Uint8Array, count = BAR_COUNT): number[] {
  const half = Math.floor(count / 2);
  const usable = Math.max(1, Math.floor(data.length * 0.55));
  const perBar = Math.max(1, Math.floor(usable / half));
  const front: number[] = [];
  for (let bar = 0; bar < half; bar += 1) {
    let sum = 0;
    for (let bin = 0; bin < perBar; bin += 1) sum += data[bar * perBar + bin] ?? 0;
    front.push(clamp01(FLOOR + (sum / perBar / 255) * 1.35));
  }
  // Mirrored rather than continued: a ring that is symmetric about its axis
  // reads as one voice, where an asymmetric one reads as a rolling chart.
  return [...front, ...front.slice().reverse()];
}

/** The resting ring, for idle and for the moment before the first sample. */
export function restingBars(count = BAR_COUNT): number[] {
  return Array.from({ length: count }, () => FLOOR);
}

/**
 * The waiting ring: one bright arc travelling round it. Used while a request is
 * in flight, where there is no level to show and a still ring would read as a
 * stall. A pure function of elapsed time, so it is drawn identically each frame
 * regardless of when the loop started.
 */
export function sweepBars(elapsedMs: number, count = BAR_COUNT): number[] {
  const head = ((elapsedMs / 1_100) % 1) * count;
  return Array.from({ length: count }, (_, index) => {
    const behind = (head - index + count) % count;
    const tail = Math.max(0, 1 - behind / (count / 3));
    return clamp01(FLOOR + tail * tail * 0.7);
  });
}

/** Attack fast so a syllable is not swallowed, release slow so it never strobes. */
export function easeBars(current: number[], next: number[]): number[] {
  return next.map((target, index) => {
    const from = current[index] ?? FLOOR;
    return from + (target - from) * (target > from ? 0.55 : 0.16);
  });
}

/**
 * A slow undulation just above the floor, blended under every other source.
 *
 * Silence is not the same as "off", and the ring has to say so. Without this
 * the ring is geometrically perfect whenever nobody is talking, and a perfect
 * circle reads as a graphic rather than a live meter — which is exactly the
 * complaint a frozen ring draws. The amplitude is deliberately tiny: it must
 * never be mistaken for signal.
 */
export function breatheBars(elapsedMs: number, count = BAR_COUNT): number[] {
  const phase = elapsedMs / 1_450;
  return Array.from({ length: count }, (_, index) => {
    const around = (index / count) * Math.PI * 2;
    const swell = Math.sin(around * 2 + phase) + Math.sin(around * 3 - phase * 0.7);
    return clamp01(FLOOR + (swell * 0.25 + 0.5) * 0.08);
  });
}

/** The louder of two rings, position by position. Blends breath under signal. */
export function liftBars(bars: number[], floor: number[]): number[] {
  return bars.map((value, index) => {
    const under = floor[index] ?? 0;
    return under > value ? under : value;
  });
}
