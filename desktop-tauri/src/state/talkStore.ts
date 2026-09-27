import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { voiceLevel, voiceStart, voiceStatus, voiceStop } from "../ipc/tools";
import { shortcutLabel } from "../lib/hotkeys";
import { startReplySpeech, stopCurrentReplySpeech } from "../lib/speechPlayback";
import { advanceTurn, meterLevel, SILENCE_MS, turnVerdict, type TurnProgress } from "../lib/talkTurn";
import { useChatStore } from "./chatStore";
import { useProjectStore } from "./projectStore";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";

// A spoken conversation held in the sidebar's Chat panel: listening → thinking
// → speaking → listening, until the same key ends it. Every turn lands in the
// project's own thread, so the conversation can be read as well as heard.

export type TalkPhase = "idle" | "listening" | "thinking" | "speaking" | "error";

interface TalkStore {
  phase: TalkPhase;
  title: string;
  sub: string;
  /** 0–1 of what the microphone is hearing, for the meter. */
  level: number;
  /** The id of the reply being read aloud. An index went wrong the moment
   * Retry dropped a turn; the id belongs to the reply itself. */
  speakingTurn: string | null;
  /** The last thing it heard you say, shown while it answers. */
  heard: string;
  /** Voice mode takes the panel; the transcript is one tap away and the
   * conversation keeps running behind it. */
  showTranscript: boolean;
  setShowTranscript: (show: boolean) => void;
  /** Invalidates every awaited step belonging to an earlier session. */
  generation: number;
  toggle: () => void;
  end: () => void;
}

const POLL_MS = 120;
const SPEECH_POLL_MS = 220;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function talkShortcut(): string {
  return shortcutLabel(useSettingsStore.getState().settings?.talkShortcut ?? "F10");
}

/** Read per reading rather than per session: lengthening the pause while a
 * conversation is open should take on the next turn, not the next launch. */
function talkPauseMs(): number {
  return useSettingsStore.getState().settings?.talkPauseMs ?? SILENCE_MS;
}

export const useTalkStore = create<TalkStore>((set, get) => {
  const show = (phase: TalkPhase, title: string, sub: string) => set({ phase, title, sub });
  const live = (generation: number) => generation === get().generation && get().phase !== "idle";

  const fail = (message: string) => {
    set((state) => ({
      generation: state.generation + 1,
      phase: "error",
      title: message,
      sub: `Press ${talkShortcut()} to start again`,
      level: 0,
      speakingTurn: null,
    }));
    void voiceStop(true).catch(() => {});
    void stopCurrentReplySpeech().catch(() => {});
    setTimeout(() => { if (get().phase === "error") set({ phase: "idle" }); }, 6_000);
  };

  /** Holds the microphone open until the person stops talking, publishing what
   * it hears as it goes. Resolves to what they said, or null for an empty turn. */
  const listen = async (generation: number): Promise<string | null> => {
    show("listening", "Listening", "Speak, then pause");
    await voiceStart();
    if (!live(generation)) { await voiceStop(true).catch(() => {}); return null; }
    let progress: TurnProgress = { spokeMs: 0, quietMs: 0 };
    const started = Date.now();
    for (;;) {
      await wait(POLL_MS);
      if (!live(generation)) return null;
      const level = await voiceLevel();
      if (!live(generation)) return null;
      if (!level.recording) return null;
      set((state) => ({ level: meterLevel(level.rms, state.level) }));
      progress = advanceTurn(progress, level, POLL_MS);
      const verdict = turnVerdict(level, progress, Date.now() - started, talkPauseMs());
      if (verdict === "nothing") { await voiceStop(true); return null; }
      if (verdict === "finish") break;
    }
    set({ level: 0 });
    show("thinking", "Thinking", "");
    const said = await voiceStop(false);
    if (said) set({ heard: said });
    return said;
  };

  /** Speaks a reply and waits for it to finish, so the next turn does not open
   * the microphone into the app's own voice. */
  const speak = async (generation: number, text: string, turnId: string): Promise<void> => {
    const id = `talk-${generation}`;
    set({ phase: "speaking", title: "Speaking", sub: text, speakingTurn: turnId });
    await startReplySpeech(id, text);
    for (;;) {
      await wait(SPEECH_POLL_MS);
      if (!live(generation)) return;
      if (!(await invoke<boolean>("speech_active", { id }))) return set({ speakingTurn: null });
    }
  };

  const converse = async (generation: number, projectId: string) => {
    try {
      // Said before the microphone opens: being told after speaking a whole
      // sentence is a worse experience than being told up front.
      const status = await voiceStatus();
      if (!live(generation)) return;
      if (!status.recorder) return fail("No microphone is available on this computer");
      if (!status.keyConfigured) return fail("A spoken conversation needs an OpenAI key");
      for (;;) {
        const said = await listen(generation);
        if (!live(generation)) return;
        if (!said) return fail("No speech heard");
        await useChatStore.getState().send(projectId, said, { spoken: true });
        if (!live(generation)) return;
        const error = useChatStore.getState().error;
        if (error) return fail(error);
        const thread = useChatStore.getState().threads[projectId] ?? [];
        const reply = thread.at(-1);
        if (reply?.role !== "assistant") return fail("The assistant did not answer");
        // The turn is on screen before it has any text, so an empty or failed
        // one is silence, not a reply worth opening the speaker for.
        if (reply.status !== "complete" || !reply.content) {
          return fail(reply.error ?? "The assistant did not answer");
        }
        await speak(generation, reply.content, reply.id);
        if (!live(generation)) return;
      }
    } catch (error) {
      if (live(generation)) fail(String(error));
    }
  };

  return {
    phase: "idle",
    title: "",
    sub: "",
    level: 0,
    speakingTurn: null,
    heard: "",
    showTranscript: false,
    generation: 0,

    setShowTranscript: (showTranscript) => set({ showTranscript }),

    toggle: () => {
      if (get().phase !== "idle" && get().phase !== "error") { get().end(); return; }
      // The conversation lives in the Chat panel, so bring it into view first:
      // a voice you cannot see the transcript of is a worse tool than one you can.
      useWorkspaceStore.getState().setCompanionTab("chat");
      const generation = get().generation + 1;
      const projectId = useProjectStore.getState().activeId;
      set({ generation, phase: "listening", title: "Opening microphone", sub: "", level: 0, speakingTurn: null, heard: "", showTranscript: false });
      if (!projectId) return fail("Open a project to talk about");
      void converse(generation, projectId);
    },

    end: () => {
      set((state) => ({ generation: state.generation + 1, phase: "idle", title: "", sub: "", level: 0, speakingTurn: null, heard: "" }));
      void voiceStop(true).catch(() => {});
      void stopCurrentReplySpeech().catch(() => {});
    },
  };
});
