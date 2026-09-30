import { computerName } from "../lib/platform";
import { useProductMode } from './productModeStore';
import { stopCurrentReplySpeech } from '../lib/speechPlayback';
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
  draftTarget: { mode?: "work" | "agent"; title: string; append(text: string): void } | null;
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
  let recordingDraft: VoiceStore["draftTarget"] = null;
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
    const candidate = get().draftTarget;
    recordingDraft = candidate && (candidate.mode ?? "agent") === useProductMode.getState().mode ? candidate : null;
    if (useProductMode.getState().mode === "agent" && !recordingDraft) { fail("Open a teammate conversation first"); return; }
    const panes = useTerminalStore.getState().panes;
    const focusedId = useTerminalStore.getState().focusedId;
    const target =
      panes.find((p) => p.id === focusedId && p.status === "running") ??
      panes.find((p) => p.status === "running" && p.visibility !== "hibernated");
    if (!target && !recordingDraft) {
      fail("Open a terminal first");
      return;
    }
    set({ targetId: recordingDraft ? null : target!.id });
    show("starting", "Opening microphone", recordingDraft?.title ?? target!.title);
    try {
      await stopCurrentReplySpeech();
      if (generation !== get().generation) return;
      const status = await voiceStatus();
      if (generation !== get().generation) return;
      if (!status.recorder) {
        fail("No microphone recorder is available on this computer");
        return;
      }
      if (!status.keyConfigured) {
        clearTimers();
        show("error", `Dictation is not set up on this ${computerName}`, "OPENAI_API_KEY is not configured");
        hideSoon(5200);
        return;
      }
      if (generation !== get().generation) return;
      await voiceStart();
      // Cancellation already queued its stop behind this start. Do not stop
      // again here: a newer recording may now own the microphone.
      if (generation !== get().generation) return;
      show("listening", "Listening", `${recordingDraft?.title ?? target!.title} · ${voiceShortcut()} to finish`);
      maxTimer = setTimeout(() => {
        if (get().phase === "listening") void stop();
      }, 60_000);
    } catch (error) {
      if (generation === get().generation) fail(String(error));
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
      if (text && recordingDraft) {
        if (recordingDraft !== get().draftTarget || useProductMode.getState().mode !== (recordingDraft.mode ?? "agent")) { get().cancel(); return; }
        recordingDraft.append(text); show("sent", "Added to draft", recordingDraft.title); hideSoon(1800); return;
      }
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
      if (generation === get().generation) fail(String(error));
    }
  };

  return {
    phase: "idle",
    title: "",
    sub: "",
    targetId: null,
    draftTarget: null,
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
