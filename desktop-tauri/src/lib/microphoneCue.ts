/** Quiet, distinct confirmation tones for the F8 microphone transition. */
import { invoke } from '@tauri-apps/api/core';

let context: AudioContext | null = null;

export function microphoneCue(kind: "start" | "stop"): void {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void invoke<boolean>('play_voice_cue', { kind }).then(played => {
      if (!played) webCue(kind);
    }).catch(() => webCue(kind));
  } else webCue(kind);
}

function webCue(kind: "start" | "stop"): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const notes = kind === "start" ? [660, 880] : [780, 520];
    notes.forEach((frequency, index) => {
      const begin = now + index * 0.095;
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, begin);
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(0.075, begin + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + 0.16);
      oscillator.connect(gain).connect(context!.destination);
      oscillator.start(begin);
      oscillator.stop(begin + 0.17);
    });
  } catch {
    // Audio output is optional; a device without it must keep dictation usable.
  }
}
