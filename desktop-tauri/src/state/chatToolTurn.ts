import type { ChatToolCall } from "../ipc/ai.ts";
import { findTool, parseArguments } from "../lib/vibyraTools.ts";
import type { ToolResult } from "../lib/vibyraToolShared.ts";
import type { ChatTurn } from "./chatTypes.ts";

/** What actually performs a tool. Passed in rather than imported, so these
 * rules can be tested without the whole store graph behind them — and so a
 * future surface (the phone, say) can supply its own. */
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

// Turning what the model asked for into what actually happened. Kept out of
// `chatStore` so the rules — how many actions one turn may take, what an
// unreadable call does, what the thread ends up showing — can be read and
// tested without a stream in the way.

/** One turn may act a few times (open terminals, then look at them) but not
 * indefinitely: a model that loops on a failing tool would keep launching. */
export const MAX_TOOL_CALLS = 4;

export interface PerformedTool {
  call: ChatToolCall;
  result: ToolResult;
}

/**
 * Runs the calls in order, stopping at the ceiling. Order matters — "open three
 * terminals then tell me what they are doing" is two calls whose second one is
 * only true after the first has run — so these are never run in parallel.
 */
export async function performToolCalls(
  calls: ChatToolCall[],
  run: ToolRunner,
): Promise<PerformedTool[]> {
  const performed: PerformedTool[] = [];
  for (const call of calls.slice(0, MAX_TOOL_CALLS)) {
    performed.push({ call, result: await performOne(call, run) });
  }
  if (calls.length > MAX_TOOL_CALLS) {
    performed.push({
      call: { id: "ceiling", name: "too_many", arguments: "" },
      result: {
        summary: `Stopped after ${MAX_TOOL_CALLS} actions`,
        detail: `Vibyra ran the first ${MAX_TOOL_CALLS} actions and stopped. Ask again for the rest.`,
        failed: true,
      },
    });
  }
  return performed;
}

async function performOne(call: ChatToolCall, run: ToolRunner): Promise<ToolResult> {
  if (!findTool(call.name)) {
    return { summary: `No such action: ${call.name}`, detail: `Vibyra has no ${call.name} action.`, failed: true };
  }
  const args = parseArguments(call.arguments);
  if (!args) {
    return {
      summary: `Could not read the request for ${call.name}`,
      detail: `The arguments for ${call.name} were not valid JSON, so nothing was done.`,
      failed: true,
    };
  }
  return run(call.name, args);
}

/** The thread's own record of an action: one line the person can read, with
 * the detail underneath it that the model will answer from. */
export function toolTurn(performed: PerformedTool, id: string): ChatTurn {
  return {
    id,
    role: "tool",
    content: performed.result.detail,
    status: "complete",
    createdAt: Date.now(),
    tool: {
      name: performed.call.name,
      summary: performed.result.summary,
      failed: performed.result.failed,
    },
  };
}

/** What the model is asked next. The results are restated here rather than
 * left in the thread: the model once read a refusal and still wrote "opened 3
 * terminals as requested", and a fixed sentence did not stop it. */
export function afterTools(performed: PerformedTool[]): string {
  const lines = performed.map((entry) =>
    `- ${entry.call.name}: ${entry.result.failed ? "FAILED" : "DONE"} — ${entry.result.summary}`,
  );
  const anyFailed = performed.some((entry) => entry.result.failed);
  return [
    "Those actions have run. This is exactly what happened:",
    ...lines,
    "",
    "Tell the person this in one short sentence, in the past tense.",
    anyFailed
      ? "At least one FAILED. Say plainly that it did not happen and why. Never describe a " +
        "failed action as done, and never say 'as requested' about one."
      : "Do not repeat the detail unless they asked for it, and do not offer to do it again.",
  ].join("\n");
}
