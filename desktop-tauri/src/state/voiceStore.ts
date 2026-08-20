import { create } from "zustand";

import { writeTerminal } from "../ipc/terminal";
import { voiceStart, voiceStatus, voiceStop } from "../ipc/tools";
import { shortcutLabel } from "../lib/hotkeys";
import { useSettingsStore } from "./settingsStore";
import { useTerminalStore } from "./terminalStore";

// F8 dictation, ported from the old app's phase machine:
// idle → starting → listening → transcribing → sent | error.
// The transcript is sent straight into the target terminal.

export type VoicePhase = "idle" | "starting" | "listening" | "transcribing" | "sent" | "error";

interface VoiceStore {
  phase: VoicePhase;
  title: string;
  sub: string;
  targetId: number | null;
  generation: number;
  toggle: () => void;
  cancel: () => void;
}

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

  const start = async () => {
    const generation = get().generation + 1;
    set({ generation });
    const panes = useTerminalStore.getState().panes;
    const focusedId = useTerminalStore.getState().focusedId;
    const target =
      panes.find((p) => p.id === focusedId && p.status === "running") ??
      panes.find((p) => p.status === "running" && p.visibility !== "hibernated");
    if (!target) {
      fail("Open a terminal first");
      return;
    }
    set({ targetId: target.id });
    show("starting", "Opening microphone", target.title);
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
    const generation = get().generation;
    const targetId = get().targetId;
    const pane = useTerminalStore.getState().panes.find((p) => p.id === targetId);
    show("transcribing", "Transcribing", pane?.title ?? "");
    try {
      const text = await voiceStop(false);
      if (generation !== get().generation) return;
      if (!text || targetId === null) {
        fail("No speech heard");
        return;
      }
      if (!pane || pane.status !== "running") {
        fail("The target terminal was closed");
        return;
      }
      await writeTerminal(targetId, `${text}\r`);
      show("sent", "Sent to terminal", pane.title);
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
    generation: 0,

    toggle: () => {
      const phase = get().phase;
      if (phase === "starting") {
        get().cancel();
        return;
      }
      if (phase === "listening") {
        void stop();
        return;
      }
      if (phase === "transcribing") return;
      void start();
    },

    cancel: () => {
      clearTimers();
      set((s) => ({ generation: s.generation + 1, phase: "idle" }));
      void voiceStop(true).catch(() => {});
    },
  };
});
