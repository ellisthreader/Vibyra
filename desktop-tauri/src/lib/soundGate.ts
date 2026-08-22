// Rate limiting for cues. Pure in the sense that matters: all state is in an
// explicit object the caller owns, so tests drive time instead of waiting on
// it. Combined with the queue's burst collapse, six agents exiting inside one
// PTY drain produce exactly one audible cue.

import type { NotificationCategory, SoundCueId } from "../notificationTypes";

/** Concurrent cues. Two overlapping is a texture; three is a mess. */
export const MAX_VOICES = 2;

const CATEGORY_GAP_MS = 1_500;
const GLOBAL_FLOOR_MS = 400;

export interface SoundGate {
  lastAt: number;
  perCategory: Map<NotificationCategory, number>;
  voices: number;
}

export function createSoundGate(): SoundGate {
  return { lastAt: 0, perCategory: new Map(), voices: 0 };
}

/** The single gate shared by the store and the engine. */
export const soundGate = createSoundGate();

/** Rate limit only. Records the play on success, so never call it for a cue
 * you are not about to hand to the engine. */
export function allowCue(
  gate: SoundGate,
  cue: SoundCueId,
  category: NotificationCategory,
  now: number,
): boolean {
  if (cue === "none") return false;
  if (gate.lastAt !== 0 && now - gate.lastAt < GLOBAL_FLOOR_MS) return false;
  const last = gate.perCategory.get(category);
  if (last !== undefined && now - last < CATEGORY_GAP_MS) return false;
  gate.lastAt = now;
  gate.perCategory.set(category, now);
  return true;
}

/** Claims a voice, or refuses when the engine is already saturated. */
export function takeVoice(gate: SoundGate): boolean {
  if (gate.voices >= MAX_VOICES) return false;
  gate.voices += 1;
  return true;
}

export function releaseVoice(gate: SoundGate): void {
  gate.voices = Math.max(0, gate.voices - 1);
}
