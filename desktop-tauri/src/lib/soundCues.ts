// The cue table, declarative and free of Web Audio types so it can be unit
// tested in plain Node and read by Settings without instantiating an
// AudioContext. Every cue is short (<= 420 ms) and built from sine/triangle
// partials only: square/saw read as an error beep, which is the opposite of
// the product register we want.

import type { SoundCueId } from "../notificationTypes";

/** Deliberately not `OscillatorType` — this module must not pull in DOM lib. */
export type ToneType = "sine" | "triangle";

export interface ToneSpec {
  /** Hz at the tone's start. */
  freq: number;
  /** When present the pitch glides here across `dur`. */
  endFreq?: number;
  type: ToneType;
  /** Seconds after the cue begins. */
  start: number;
  /** Seconds. */
  dur: number;
  /** Peak envelope gain, before the user's volume is applied. 0..1. */
  gain: number;
  /** Seconds to reach the peak. Non-zero, or the attack clicks. */
  attack: number;
}

/** Names for the Settings dropdown. Descriptive rather than onomatopoeic:
 * the user is picking a feeling, not reading a waveform. */
export const CUE_LABELS: Record<SoundCueId, string> = {
  none: "Silent",
  done: "Complete",
  ask: "Question",
  fail: "Error",
  alert: "Alert",
  chime: "Chime",
  blip: "Blip",
};

/** Drives the Settings dropdown, so the order is the order the user sees. */
export const CUE_ORDER: SoundCueId[] = [
  "none",
  "done",
  "ask",
  "fail",
  "alert",
  "chime",
  "blip",
];

export const CUES: Record<SoundCueId, ToneSpec[]> = {
  none: [],

  // Rising major third: "finished".
  done: [
    { freq: 660, type: "triangle", start: 0, dur: 0.16, gain: 0.22, attack: 0.01 },
    { freq: 880, type: "triangle", start: 0.09, dur: 0.16, gain: 0.2, attack: 0.01 },
  ],

  // Interrogative contour (up-down-up): "needs you".
  ask: [
    { freq: 880, type: "sine", start: 0, dur: 0.07, gain: 0.2, attack: 0.008 },
    { freq: 660, type: "sine", start: 0.09, dur: 0.07, gain: 0.2, attack: 0.008 },
    { freq: 880, type: "sine", start: 0.18, dur: 0.07, gain: 0.22, attack: 0.008 },
  ],

  // Descending glide over a low body: "broke".
  fail: [
    { freq: 400, endFreq: 260, type: "triangle", start: 0, dur: 0.28, gain: 0.24, attack: 0.012 },
    { freq: 200, type: "sine", start: 0.02, dur: 0.24, gain: 0.16, attack: 0.012 },
  ],

  // Two even pulses — insistent without being a siren.
  alert: [
    { freq: 720, type: "sine", start: 0, dur: 0.12, gain: 0.22, attack: 0.01 },
    { freq: 720, type: "sine", start: 0.16, dur: 0.12, gain: 0.22, attack: 0.01 },
  ],

  // C5 / E5 / G5 arpeggio — the neutral "something happened".
  chime: [
    { freq: 523.25, type: "sine", start: 0, dur: 0.16, gain: 0.18, attack: 0.01 },
    { freq: 659.25, type: "sine", start: 0.06, dur: 0.16, gain: 0.18, attack: 0.01 },
    { freq: 783.99, type: "sine", start: 0.12, dur: 0.16, gain: 0.16, attack: 0.01 },
  ],

  // The quietest thing that is still audible.
  blip: [{ freq: 1046, type: "sine", start: 0, dur: 0.05, gain: 0.14, attack: 0.006 }],
};

/** Total wall time of a cue in seconds — used by the tests to prove nothing drones. */
export function cueDuration(cue: SoundCueId): number {
  let end = 0;
  for (const tone of CUES[cue]) end = Math.max(end, tone.start + tone.dur);
  return end;
}
