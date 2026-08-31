import { create } from "zustand";

import { synthesizeSpeech } from "../ipc/speech";
import { speakableText } from "../lib/askSpeech";
import { useSettingsStore } from "./settingsStore";

// Ask's own voice: fetch the audio, play it, and expose the analyser the orb
// draws from.
//
// The node graph lives outside the store because it is not state the UI
// renders — only `phase` and `analyser` are. One AudioContext is kept for the
// life of the window; creating one per utterance leaks them on WebKit.

export type SpeechPhase = "idle" | "loading" | "speaking";

interface AskSpeechStore {
  phase: SpeechPhase;
  /** Which assistant turn is playing, so only that bubble shows a stop button. */
  turnKey: string | null;
  error: string | null;
  analyser: AnalyserNode | null;
  speak: (turnKey: string, markdown: string) => Promise<void>;
  stop: () => void;
}

let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
/** Bumped by every `speak` and `stop`, so a slow fetch cannot play late. */
let generation = 0;

function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

function teardown(): void {
  if (!source) return;
  source.onended = null;
  try {
    source.stop();
  } catch {
    // Already ended; stopping a finished source throws on some engines.
  }
  source.disconnect();
  source = null;
}

export const useAskSpeechStore = create<AskSpeechStore>((set, get) => ({
  phase: "idle",
  turnKey: null,
  error: null,
  analyser: null,

  speak: async (turnKey, markdown) => {
    generation += 1;
    const mine = generation;
    teardown();
    const text = speakableText(markdown);
    if (!text) {
      set({ phase: "idle", turnKey: null, analyser: null });
      return;
    }
    set({ phase: "loading", turnKey, error: null, analyser: null });
    try {
      const voice = useSettingsStore.getState().settings?.askVoice ?? "nova";
      const bytes = await synthesizeSpeech(text, voice);
      if (mine !== generation) return;
      const ctx = audioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const buffer = await ctx.decodeAudioData(bytes);
      if (mine !== generation) return;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(analyser);
      analyser.connect(ctx.destination);
      node.onended = () => {
        if (mine !== generation) return;
        teardown();
        set({ phase: "idle", turnKey: null, analyser: null });
      };
      source = node;
      node.start();
      set({ phase: "speaking", turnKey, analyser });
    } catch (error) {
      if (mine !== generation) return;
      set({
        phase: "idle",
        turnKey: null,
        analyser: null,
        error: String(error).replace(/^Error:\s*/, ""),
      });
    }
  },

  stop: () => {
    generation += 1;
    teardown();
    if (get().phase !== "idle") set({ phase: "idle", turnKey: null, analyser: null });
  },
}));
