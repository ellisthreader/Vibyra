import { aiChat, type ChatMessage, type ChatToolCall } from "../ipc/ai";
import { runVibyraTool } from "../lib/vibyraToolRunner";
import { afterTools, performToolCalls, toolTurn } from "./chatToolTurn";
import type { ChatTurn } from "./chatTypes";

// The second half of a reply that asked Vibyra to do something. Split out of
// `chatStore` — which owns one reply at a time and the thread it lands in —
// because this owns a different thing: the actions, their record, and the
// sentence that reports them.

/** What this needs from the store, named rather than imported, so the sequence
 * below can be run against a fake thread in a test. */
export interface ActContext {
  newId: () => string;
  /** A fresh assistant turn answering `replyTo`. */
  reply: (replyTo: string, spoken?: boolean) => ChatTurn;
  patch: (projectId: string, turnId: string, fields: Partial<ChatTurn>) => void;
  append: (projectId: string, turns: ChatTurn[]) => void;
  stream: (projectId: string, turnId: string, text: string) => void;
  /** The conversation so far, in the shape the model takes it. */
  context: (projectId: string) => { role: "user" | "assistant"; content: string }[];
  prompt: (projectId: string, query: string, spoken: boolean) => Promise<string>;
  /** False once this reply has been stopped or replaced. */
  live: () => boolean;
}

/**
 * Runs the actions, writes one line per action into the thread, then asks the
 * model to say what happened. The actions are the answer: if that second pass
 * fails, the work is still done and still on screen, so the summary falls back
 * to the tools' own words rather than an error.
 */
export async function actOnToolCalls(
  ctx: ActContext,
  projectId: string,
  turn: ChatTurn,
  calls: ChatToolCall[],
): Promise<void> {
  const performed = await performToolCalls(calls, runVibyraTool);
  if (!ctx.live()) return;
  const summary = ctx.reply(turn.id, turn.spoken);
  ctx.append(projectId, [...performed.map((entry) => toolTurn(entry, ctx.newId())), summary]);

  const report = afterTools(performed);
  const messages: ChatMessage[] = [
    { role: "system", content: await ctx.prompt(projectId, report, turn.spoken ?? false) },
    ...ctx.context(projectId),
    { role: "user", content: report },
  ];
  try {
    // No tools on this pass: it is being asked to describe, not to act again.
    const said = await aiChat(ctx.newId(), messages, ({ text }) =>
      ctx.stream(projectId, summary.id, text),
    );
    ctx.patch(projectId, summary.id, { content: said.text, status: "complete" });
  } catch {
    ctx.patch(projectId, summary.id, {
      content: `${performed.map((entry) => entry.result.summary).join(". ")}.`,
      status: "complete",
    });
  }
}
