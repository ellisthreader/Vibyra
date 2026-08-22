// The Web Audio engine. One lazily-created AudioContext, never at module load:
// WebKitGTK holds a PulseAudio stream open for the session lifetime the moment
// a context exists, so an app whose sounds are switched off must never make one.
//
// WebKit also creates the context `suspended` and silently ignores `resume()`
// outside a user gesture — no error, `currentTime` simply never advances.
// `primeAudio()` therefore has to be called from a real pointerdown/keydown.
// Before that, `playCue` is a no-op and the first notification of a session may
// be silent. That is the accepted trade.
//
// `prefers-reduced-motion` deliberately does NOT gate audio — it is a motion
// preference; the toast entrance animation is what honours it.

import { CUES, type ToneSpec } from "./soundCues";
import { releaseVoice, soundGate, takeVoice } from "./soundGate";
import type { SoundCueId } from "../notificationTypes";

/** Exponential ramps throw on a target of exactly 0, and linear-to-zero clicks. */
const SILENT = 0.0001;
const TAIL_S = 0.02;

let ctx: AudioContext | null = null;

/** Call from a user gesture. Cheap and idempotent after the first success. */
export function primeAudio(): void {
  try {
    if (!ctx) {
      if (typeof AudioContext === "undefined") return;
      ctx = new AudioContext();
    }
    if (ctx.state !== "running") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Fire-and-forget. Never throws: a build with no PulseAudio socket yields a
 * context that never reaches "running", and that must not reject into the store. */
export function playCue(cue: SoundCueId, volume: number): void {
  render(cue, volume);
}

/** Settings preview. Same path, but it primes first because the click that
 * triggered it *is* the user gesture. */
export function previewCue(cue: SoundCueId, volume: number): void {
  primeAudio();
  render(cue, volume);
}

function render(cue: SoundCueId, volume: number): void {
  if (cue === "none" || volume <= 0) return;
  const tones = CUES[cue];
  if (!tones || tones.length === 0) return;
  const audio = ctx;
  // Re-checked here, not just at prime time: the context can be suspended
  // again by the platform whenever it likes.
  if (!audio || audio.state !== "running") return;
  if (!takeVoice(soundGate)) return;
  const done = releaseOnce();
  try {
    const base = audio.currentTime + 0.01;
    let end = 0;
    for (const tone of tones) {
      schedule(audio, tone, base, volume);
      end = Math.max(end, tone.start + tone.dur);
    }
    window.setTimeout(done, (end + TAIL_S) * 1000 + 50);
  } catch {
    done();
  }
}

/** The voice is released exactly once, whether by the timer or by a failure. */
function releaseOnce(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseVoice(soundGate);
  };
}

function schedule(audio: AudioContext, tone: ToneSpec, base: number, volume: number): void {
  const t0 = base + tone.start;
  const t1 = t0 + tone.dur;
  const osc = audio.createOscillator();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, t0);
  if (tone.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.endFreq, t1);

  const gain = audio.createGain();
  const peak = Math.max(SILENT * 2, Math.min(1, tone.gain * volume));
  gain.gain.setValueAtTime(SILENT, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + tone.attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, t1);

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(t0);
  osc.stop(t1 + TAIL_S);
}
