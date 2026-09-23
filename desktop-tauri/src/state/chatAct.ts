import { aiChat, type ChatMessage, type ChatToolCall } from "../ipc/ai";
import { runVibyraTool } from "../lib/vibyraToolRunner";
import { toolSchemas } from "../lib/vibyraTools";
import { MAX_ROUNDS, afterTools, performToolCalls, replyMemory, toolTurn, type PerformedTool } from "./chatToolTurn";
import type { ChatTurn } from "./chatTypes";

// The second half of a reply that asked Vibyra to do something. Split out of
// `chatStore` — which owns one reply at a time and the thread it lands in —
// because this owns a different thing: the actions, their record, and the
// answer written from them.

/** What this needs from the store, named rather than imported, so the sequence
 * below can be run against a fake thread in a test. */
export interface ActContext {
  /** The reply's own request id: Stop cancels whichever pass is running. */
  requestId: string;
  newId: () => string;
  /** A fresh assistant turn answering `replyTo`. */
  reply: (replyTo: string, spoken?: boolean) => ChatTurn;
  patch: (projectId: string, turnId: string, fields: Partial<ChatTurn>) => void;
  append: (projectId: string, turns: ChatTurn[]) => void;
  drop: (projectId: string, turnId: string) => void;
  stream: (projectId: string, turnId: string, text: string) => void;
  /** The conversation so far, in the shape the model takes it. */
  context: (projectId: string) => { role: "user" | "assistant"; content: string }[];
  prompt: (projectId: string, query: string, spoken: boolean) => Promise<string>;
  /** False once this reply has been stopped or replaced. */
  live: () => boolean;
}

/**
 * Runs the actions, writes one line per action into the thread, then gives the
 * model the results *with its tools still in hand*: finding a terminal and then
 * reading it is two steps, and a model that cannot take the second one answers
 * "the terminals were listed". After `MAX_ROUNDS` it must answer. The actions
 * are the answer if a pass fails — the work is done and on screen, so the reply
 * falls back to the tools' own words rather than an error.
 */
export async function actOnToolCalls(
  ctx: ActContext,
  projectId: string,
  turn: ChatTurn,
  calls: ChatToolCall[],
  /** What the person said, restated to the model on every pass. */
  request = "",
): Promise<void> {
  const memory = replyMemory(request);
  // Every result so far goes into each report: a launch that failed in the
  // first pass was otherwise forgotten once a later pass only read terminals.
  const history: PerformedTool[] = [];
  let pending = calls;
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const performed = await performToolCalls(pending, runVibyraTool, memory);
    history.push(...performed);
    if (!ctx.live()) return;
    const summary = ctx.reply(turn.id, turn.spoken);
    const shown = performed.filter((entry) => !entry.result.skipped);
    ctx.append(projectId, [...shown.map((entry) => toolTurn(entry, ctx.newId())), summary]);

    const canAct = round < MAX_ROUNDS;
    const report = afterTools(history, canAct, request);
    const messages: ChatMessage[] = [
      { role: "system", content: await ctx.prompt(projectId, report, turn.spoken ?? false) },
      ...ctx.context(projectId),
      { role: "user", content: report },
    ];
    const fallback = `${(shown.length ? shown : performed).map((entry) => entry.result.summary).join(". ")}.`;
    try {
      const said = await aiChat(ctx.requestId, messages, ({ text }) => {
        if (ctx.live()) ctx.stream(projectId, summary.id, text);
      }, canAct ? toolSchemas() : undefined);
      if (!ctx.live()) return;
      if (canAct && said.toolCalls?.length && !said.stopped) {
        ctx.drop(projectId, summary.id);
        pending = said.toolCalls;
        continue;
      }
      ctx.patch(projectId, summary.id, { content: said.text || fallback, status: "complete", stopped: said.stopped });
    } catch {
      ctx.patch(projectId, summary.id, { content: fallback, status: "complete" });
    }
    return;
  }
}
