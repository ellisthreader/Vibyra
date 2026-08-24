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

/** Longest cue is 0.18 s, so this only ever fires between notifications. */
const IDLE_SUSPEND_MS = 3_000;

let ctx: AudioContext | null = null;
let idleTimer = 0;
/** True once the context has actually been observed running, i.e. a gesture
 * unlocked it. Until then `resume()` is the platform's to grant, not ours. */
let unlocked = false;
/** Turned off for good the first time a resume fails to take, so a WebKit
 * build that only honours `resume()` inside a gesture can never be left mute. */
let idleSuspend = true;
let rearmPrimer: () => void = () => {};

/** Lets the runtime re-offer its one-shot gesture listeners if audio ever
 * gets stuck suspended. Injected rather than imported: this module must not
 * depend on React. */
export function setAudioPrimerRearm(rearm: () => void): void {
  rearmPrimer = rearm;
}

/**
 * A running AudioContext costs real CPU whether or not anything is playing:
 * WebKitGTK keeps a GStreamer `webkitwebaudiosrc` pulling ~344 quanta/s for
 * the life of the context. Measured at 3.4% of a core on an app that had made
 * no sound in an hour. Suspending between cues gives that back.
 */
function scheduleIdleSuspend(): void {
  if (!idleSuspend) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (ctx?.state === "running") void Promise.resolve(ctx.suspend()).catch(() => {});
  }, IDLE_SUSPEND_MS);
}

/** Audio is asleep and would not wake. Stop suspending it and let the next
 * click or keypress unlock it again — one cue is lost, never the feature. */
function abandonIdleSuspend(): void {
  idleSuspend = false;
  window.clearTimeout(idleTimer);
  rearmPrimer();
}

/** Call from a user gesture. Cheap and idempotent after the first success. */
export function primeAudio(): void {
  try {
    if (!ctx) {
      if (typeof AudioContext === "undefined") return;
      ctx = new AudioContext();
    }
    if (ctx.state === "running") unlocked = true;
    else void Promise.resolve(ctx.resume()).then(() => {
      if (ctx?.state === "running") unlocked = true;
    }, () => {});
    // The gesture that unlocks audio is usually nowhere near a notification,
    // so without this the context runs idle from the first click onwards.
    scheduleIdleSuspend();
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
  if (!audio) return;
  if (audio.state === "running") {
    unlocked = true;
    play(audio, tones, volume);
    return;
  }
  // Suspended. If a gesture has never unlocked this context then resuming is
  // not ours to do — stay silent exactly as before. If we put it to sleep,
  // wake it and play on the far side.
  if (!unlocked || !idleSuspend || audio.state !== "suspended") return;
  void Promise.resolve(audio.resume()).then(
    () => {
      if (audio.state === "running") play(audio, tones, volume);
      else abandonIdleSuspend();
    },
    abandonIdleSuspend,
  );
}

function play(audio: AudioContext, tones: readonly ToneSpec[], volume: number): void {
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
  scheduleIdleSuspend();
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
