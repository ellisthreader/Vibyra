// Rate limiting for cues. Pure in the sense that matters: all state is in an
// explicit object the caller owns, so tests drive time instead of waiting on
// it. Combined with the queue's burst collapse, six agents exiting inside one
// PTY drain produce exactly one audible cue.

import type { NotificationKind, SoundCueId } from "../notificationTypes";

/** Concurrent cues. Two overlapping is a texture; three is a mess. */
export const MAX_VOICES = 2;

const KIND_GAP_MS = 1_500;
const GLOBAL_FLOOR_MS = 400;

export interface SoundGate {
  lastAt: number;
  perKind: Map<NotificationKind, number>;
  voices: number;
}

export function createSoundGate(): SoundGate {
  return { lastAt: 0, perKind: new Map(), voices: 0 };
}

/** The single gate shared by the store and the engine. */
export const soundGate = createSoundGate();

/** Rate limit only. Records the play on success, so never call it for a cue
 * you are not about to hand to the engine. */
export function allowCue(
  gate: SoundGate,
  cue: SoundCueId,
  kind: NotificationKind,
  now: number,
): boolean {
  if (cue === "none") return false;
  if (gate.lastAt !== 0 && now - gate.lastAt < GLOBAL_FLOOR_MS) return false;
  const last = gate.perKind.get(kind);
  if (last !== undefined && now - last < KIND_GAP_MS) return false;
  gate.lastAt = now;
  gate.perKind.set(kind, now);
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
