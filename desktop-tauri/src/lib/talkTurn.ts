import type { VoiceLevel } from "../types.ts";

/** Quiet enough to be a pause rather than a room. Speech sits an order of
 * magnitude above this on every microphone we have measured. */
export const SILENCE_RMS = 0.012;
/** How long a pause has to last before it counts as the end of a turn. Shorter
 * cuts people off mid-sentence; longer feels like the app is not listening.
 * The default, and what Settings > Advanced > Voice varies around. */
export const SILENCE_MS = 1_100;
/** What that setting is allowed to ask for. A pause under a third of a second
 * ends a turn between words; past four seconds the microphone reads as dead. */
const MIN_PAUSE_MS = 400;
const MAX_PAUSE_MS = 4_000;
/** Nothing said at all: close the microphone rather than bill a silent minute. */
export const NOTHING_SAID_MS = 9_000;
/** A single turn cannot run forever, whatever the room sounds like. */
export const MAX_TURN_MS = 60_000;

export interface TurnProgress {
  /** Milliseconds of speech-level audio heard so far in this turn. */
  spokeMs: number;
  /** Milliseconds since the last speech-level audio. */
  quietMs: number;
}

export type TurnVerdict = "listening" | "finish" | "nothing";

/** Decides what an open microphone should do next from one level reading.
 *
 * Kept apart from the store so the rule that ends a spoken turn — heard
 * speech, then a pause — can be tested without a microphone, a timer or a
 * network call.
 */
export function turnVerdict(
  level: VoiceLevel,
  progress: TurnProgress,
  elapsedMs: number,
  pauseMs: number = SILENCE_MS,
): TurnVerdict {
  if (elapsedMs >= MAX_TURN_MS) return progress.spokeMs > 0 ? "finish" : "nothing";
  // Without a live level there is nothing to decide on: the person ends the
  // turn with the key, and only the hard ceiling above applies.
  if (!level.metered) return "listening";
  const pause = Number.isFinite(pauseMs)
    ? Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, pauseMs))
    : SILENCE_MS;
  if (progress.spokeMs > 0) return progress.quietMs >= pause ? "finish" : "listening";
  return elapsedMs >= NOTHING_SAID_MS ? "nothing" : "listening";
}

/** Folds one reading into the running totals for the turn. */
export function advanceTurn(progress: TurnProgress, level: VoiceLevel, stepMs: number): TurnProgress {
  if (!level.metered) return progress;
  return level.rms >= SILENCE_RMS
    ? { spokeMs: progress.spokeMs + stepMs, quietMs: 0 }
    : { spokeMs: progress.spokeMs, quietMs: progress.quietMs + stepMs };
}

/** Maps a raw microphone reading onto the 0–1 the meter draws, smoothed so the
 * bars breathe with a voice instead of flickering per sample. Rises fast, so
 * speech shows immediately; falls slowly, so a pause looks like a pause. */
export function meterLevel(rms: number, previous: number): number {
  const target = Math.min(1, Math.max(0, rms / 0.22));
  return target > previous ? target : previous + (target - previous) * 0.25;
}
