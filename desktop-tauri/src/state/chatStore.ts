import { create } from "zustand";

import { aiChat, aiChatStop, type ChatMessage } from "../ipc/ai";
import { toolSchemas } from "../lib/vibyraTools";
import { actOnToolCalls } from "./chatAct";
import { buildPrompt } from "./chatSystemPrompt";
import { applyDelta, contextFor, dropTurn, settleTurn } from "./chatLedger";
import type { ChatTurn } from "./chatTypes";

export type { ChatTurn } from "./chatTypes";

// One conversation per project — context stops leaking between codebases.

interface ChatStore {
  threads: Record<string, ChatTurn[]>;
  /** The one reply being written, and the request that owns it. */
  active: { projectId: string; turnId: string; requestId: string } | null;
  /** Transitional: `ChatPanel` still reads this; it is `active !== null`. */
  sending: boolean;
  error: string | null;
  send: (projectId: string, text: string, options?: SendOptions) => Promise<void>;
  /** Re-runs a failed or stopped reply from the question it answered, without
   * asking that question a second time. */
  retry: (projectId: string, turnId: string) => Promise<void>;
  stop: () => void;
  clear: (projectId: string) => void;
}

export interface SendOptions {
  /** The reply will be read aloud, so it is written to be heard rather than
   * read: a couple of spoken sentences, no markdown, no code blocks. */
  spoken?: boolean;
}

let counter = 0;
const newId = () => `t-${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

// Rust admits one chat at a time, and a stopped stream takes a moment to let
// go of that slot. Holding the previous call here means a Retry fired straight
// after Stop waits for it instead of bouncing off "a request is already running".
let lastCall: Promise<unknown> = Promise.resolve();

export const useChatStore = create<ChatStore>((set, get) => {
  const patch = (projectId: string, turnId: string, fields: Partial<ChatTurn>) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [projectId]: settleTurn(state.threads[projectId] ?? [], turnId, fields),
      },
    }));

  const append = (projectId: string, turns: ChatTurn[]) =>
    set((state) => ({
      threads: { ...state.threads, [projectId]: [...(state.threads[projectId] ?? []), ...turns] },
    }));

  const stream = (projectId: string, turnId: string, text: string) =>
    set((state) => ({
      threads: { ...state.threads, [projectId]: applyDelta(state.threads[projectId] ?? [], turnId, text) },
    }));

  /** What the acting half needs from this store, named once. */
  const drop = (projectId: string, turnId: string) =>
    set((state) => ({
      threads: { ...state.threads, [projectId]: dropTurn(state.threads[projectId] ?? [], turnId) },
    }));

  const actContext = (requestId: string) => ({
    requestId,
    newId,
    reply,
    patch,
    append,
    drop,
    stream,
    context: (id: string) => contextFor(get().threads[id] ?? []),
    prompt: buildPrompt,
    live: () => get().active?.requestId === requestId,
  });

  /** Drives one reply into an assistant turn that is already on screen. */
  const run = async (projectId: string, turn: ChatTurn, query: string) => {
    const requestId = newId();
    set({ active: { projectId, turnId: turn.id, requestId }, sending: true, error: null });
    try {
      await lastCall.catch(() => {});
      const prompt = await buildPrompt(projectId, query, turn.spoken ?? false);
      // Stopped while the brief was still being read: never pay for a reply
      // nobody is waiting for.
      if (get().active?.requestId !== requestId) return patch(projectId, turn.id, { status: "complete" });
      const messages: ChatMessage[] = [
        { role: "system", content: prompt },
        ...contextFor(get().threads[projectId] ?? []),
      ];
      const call = aiChat(
        requestId,
        messages,
        ({ text }) => {
          // A delta belonging to a reply that was stopped or replaced is stale.
          if (get().active?.requestId === requestId) stream(projectId, turn.id, text);
        },
        // A spoken turn acts too: "open three terminals" is the same request
        // whether it was typed or said.
        toolSchemas(),
      );
      lastCall = call;
      const outcome = await call;
      // The returned text wins over everything accumulated from the channel.
      patch(projectId, turn.id, {
        content: outcome.text,
        status: "complete",
        stopped: outcome.stopped,
      });
      if (outcome.toolCalls?.length && !outcome.stopped) {
        // The actions and the answer written after them are the reply. Text
        // sent alongside the call is dropped even when there is some: it is
        // written before anything ran ("Launching 5 Codex terminals…") and
        // sat above the refusal that followed it.
        drop(projectId, turn.id);
        await actOnToolCalls(actContext(requestId), projectId, turn, outcome.toolCalls, query);
      }
    } catch (error) {
      // Whatever arrived before it broke is kept: a half reply is still worth
      // reading, and the question above it stays there to be retried. The
      // composer is only told when it was not the person who ended it.
      patch(projectId, turn.id, { status: "failed", error: String(error) });
      if (get().active?.requestId === requestId) set({ error: String(error) });
    } finally {
      if (get().active?.requestId === requestId) set({ active: null, sending: false });
    }
  };

  const reply = (replyTo: string, spoken?: boolean): ChatTurn => ({
    id: newId(),
    role: "assistant",
    content: "",
    status: "streaming",
    createdAt: Date.now(),
    replyTo,
    spoken,
  });

  return {
    threads: {},
    active: null,
    sending: false,
    error: null,

    send: async (projectId, text, options) => {
      const content = text.trim();
      if (!content || get().active) return;
      const question: ChatTurn = {
        id: newId(),
        role: "user",
        content,
        status: "complete",
        createdAt: Date.now(),
      };
      const answer = reply(question.id, options?.spoken);
      set((state) => ({
        threads: { ...state.threads, [projectId]: [...(state.threads[projectId] ?? []), question, answer] },
        error: null,
      }));
      await run(projectId, answer, content);
    },

    retry: async (projectId, turnId) => {
      if (get().active) return;
      const turns = get().threads[projectId] ?? [];
      const failed = turns.find((entry) => entry.id === turnId);
      const question = turns.find((entry) => entry.id === failed?.replyTo);
      if (!failed || !question) return;
      const answer = reply(question.id, failed.spoken);
      set((state) => ({
        threads: { ...state.threads, [projectId]: [...dropTurn(state.threads[projectId] ?? [], turnId), answer] },
        error: null,
      }));
      await run(projectId, answer, question.content);
    },

    stop: () => {
      const active = get().active;
      if (!active) return;
      // Marked and released in the same frame: the real settle arrives a
      // moment later with the text Rust actually sent.
      patch(active.projectId, active.turnId, { stopped: true });
      set({ active: null, sending: false });
      void aiChatStop(active.requestId).catch(() => {});
    },

    clear: (projectId) => {
      if (get().active?.projectId === projectId) get().stop();
      set((state) => ({ threads: { ...state.threads, [projectId]: [] }, error: null }));
    },
  };
});
