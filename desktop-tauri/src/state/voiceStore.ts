import { create } from "zustand";

import { voiceStart, voiceStatus, voiceStop } from "../ipc/tools";
import { shortcutLabel } from "../lib/hotkeys";
import { useAskSpeechStore } from "./askSpeechStore";
import { useSettingsStore } from "./settingsStore";
import { deliverTranscript, resolveSink, type VoiceSink } from "./voiceSinks";

// Dictation, ported from the old app's phase machine:
// idle → starting → listening → transcribing → sent | error.
//
// One machine serves both destinations because there is only one recorder:
// F8 sends the transcript to the focused terminal, Ask's microphone sends it
// to Ask. `voiceSinks` is the only part that differs; everything here — the
// generation guard, the timeouts, the error copy — is shared.

export type VoicePhase = "idle" | "starting" | "listening" | "transcribing" | "sent" | "error";

interface VoiceStore {
  phase: VoicePhase;
  title: string;
  sub: string;
  targetId: number | null;
  sink: VoiceSink;
  generation: number;
  toggle: (sink?: VoiceSink) => void;
  cancel: () => void;
}

/** The destination's display name, kept for the phases that follow the start. */
let destination = "";
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) clearTimeout(hideTimer);
  if (maxTimer) clearTimeout(maxTimer);
  hideTimer = null;
  maxTimer = null;
}

function voiceShortcut(): string {
  return shortcutLabel(useSettingsStore.getState().settings?.voiceShortcut ?? "F8");
}

export const useVoiceStore = create<VoiceStore>((set, get) => {
  const show = (phase: VoicePhase, title: string, sub: string) => set({ phase, title, sub });

  const hideSoon = (ms: number) => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => set({ phase: "idle" }), ms);
  };

  const fail = (message: string) => {
    clearTimers();
    show("error", message, `Press ${voiceShortcut()} to try again`);
    hideSoon(4200);
  };

  const start = async (sink: VoiceSink) => {
    const generation = get().generation + 1;
    set({ generation, sink });
    // Barge-in: speaking over Ask's own voice is how a conversation works, and
    // the microphone would otherwise record the reply playing out loud.
    useAskSpeechStore.getState().stop();

    const target = resolveSink(sink);
    if (!target.ok) {
      fail(target.message);
      return;
    }
    set({ targetId: target.targetId ?? null });
    destination = target.title;
    show("starting", "Opening microphone", destination);
    try {
      const status = await voiceStatus();
      if (!status.recorder) {
        fail("No microphone recorder (arecord) found");
        return;
      }
      if (!status.keyConfigured) {
        clearTimers();
        show("error", "Dictation needs an OpenAI key", "Add one in Settings › Vibyra AI");
        hideSoon(5200);
        return;
      }
      if (generation !== get().generation) return;
      await voiceStart();
      if (generation !== get().generation) {
        await voiceStop(true).catch(() => {});
        return;
      }
      show("listening", "Listening", `${target.title} · ${voiceShortcut()} to send`);
      maxTimer = setTimeout(() => {
        if (get().phase === "listening") void stop();
      }, 60_000);
    } catch (error) {
      fail(String(error));
    }
  };

  const stop = async () => {
    clearTimers();
    const { generation, targetId, sink } = get();
    show("transcribing", "Transcribing", destination);
    try {
      const text = await voiceStop(false);
      if (generation !== get().generation) return;
      if (!text) {
        fail("No speech heard");
        return;
      }
      const delivered = await deliverTranscript(sink, targetId, text);
      if (generation !== get().generation) return;
      if (!delivered.ok) {
        fail(delivered.message);
        return;
      }
      show("sent", delivered.title, delivered.sub);
      hideSoon(1800);
    } catch (error) {
      fail(String(error));
    }
  };

  return {
    phase: "idle",
    title: "",
    sub: "",
    targetId: null,
    sink: "terminal",
    generation: 0,

    toggle: (sink = "terminal") => {
      const phase = get().phase;
      if (phase === "starting") {
        get().cancel();
        return;
      }
      if (phase === "listening") {
        // A second press on the *other* destination's button cancels rather
        // than sends: the transcript would otherwise land somewhere the user
        // did not aim it.
        if (sink !== get().sink) {
          get().cancel();
          return;
        }
        void stop();
        return;
      }
      if (phase === "transcribing") return;
      void start(sink);
    },

    cancel: () => {
      clearTimers();
      set((s) => ({ generation: s.generation + 1, phase: "idle" }));
      void voiceStop(true).catch(() => {});
    },
  };
});
