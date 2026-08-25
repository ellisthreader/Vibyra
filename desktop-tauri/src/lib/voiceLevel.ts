// Turning a microphone level into a pulse. Pure, so the shaping is a unit test
// rather than something judged by talking at the machine.
//
// The native meter already emits a smoothed 50 ms RMS window, so nothing here
// needs a frame loop: an event *is* the clock. Twenty style writes a second
// plus a short CSS transition lets the compositor draw the frames in between,
// which is why this meter costs almost nothing to run.

/** How long to wait for the first level before assuming none is coming. */
export const VOICE_LEVEL_STALE_MS = 900;
/** Rises quickly, so the first syllable is not swallowed. */
export const VOICE_ATTACK = 0.6;
/** Falls slowly, so consonants do not make it strobe. */
export const VOICE_RELEASE = 0.22;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** One step of attack/release smoothing towards the newest reading. */
export function smoothVoiceLevel(current: number, next: number): number {
  const target = clamp01(next);
  const from = clamp01(current);
  return from + (target - from) * (target > from ? VOICE_ATTACK : VOICE_RELEASE);
}

export interface PulseShape {
  /** Scale of the soft square behind the dot. */
  halo: number;
  /** Scale of the dot itself. */
  core: number;
  /** Halo opacity — silence still shows a faint resting state, never nothing. */
  opacity: number;
}

/**
 * The resting shape is deliberately visible. A meter that collapses to
 * invisible at silence looks like a microphone that has failed, which is the
 * one thing this HUD exists to rule out.
 */
export function pulseShape(level: number): PulseShape {
  const eased = clamp01(level);
  return {
    halo: 0.5 + eased * 0.5,
    core: 1 + eased * 0.55,
    opacity: 0.14 + eased * 0.3,
  };
}
