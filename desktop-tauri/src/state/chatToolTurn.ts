import type { ChatToolCall } from "../ipc/ai.ts";
import { findTool, parseArguments } from "../lib/vibyraTools.ts";
import type { ToolResult } from "../lib/vibyraToolShared.ts";
import type { ChatTurn } from "./chatTypes.ts";

/** What actually performs a tool. Passed in rather than imported, so these
 * rules can be tested without the whole store graph behind them — and so a
 * future surface (the phone, say) can supply its own. */
export type ToolRunner = (name: string, args: Record<string, unknown>, request?: string) => Promise<ToolResult>;

// Turning what the model asked for into what actually happened. Kept out of
// `chatStore` so the rules — how many actions one turn may take, what an
// unreadable call does, what the thread ends up showing — can be read and
// tested without a stream in the way.

/** One pass may act a few times (close three terminals, read two) but not
 * indefinitely: a model that loops on a failing tool would keep launching. */
export const MAX_TOOL_CALLS = 6;
/** How many times one reply may go back to the model with results and act
 * again — list the terminals, then read the one it found, then answer. */
export const MAX_ROUNDS = 4;

export interface PerformedTool {
  call: ChatToolCall;
  result: ToolResult;
}

/** What one reply has already done, so a model that asks twice gets it once. */
export interface ReplyMemory {
  /** Changing calls that succeeded: never repeated in the same reply. */
  done: Set<string>;
  /** Reads since the last change: a second identical read shows nothing new. */
  reads: Set<string>;
  /** The person's own words. Some actions need them to have asked. */
  request: string;
}

export const replyMemory = (request = ""): ReplyMemory => ({ done: new Set(), reads: new Set(), request });

/**
 * Actions a model may only take when the person's own message asks for that
 * kind of thing. Small models drift once the task is done: "close this
 * project" removed it from Vibyra, "what projects do I have?" approved a
 * permission prompt, and a plain launch was followed by a task typed into the
 * new terminal. A prompt rule did not stop any of it; this does.
 */
/** "Yes, do it" answers a question the assistant asked, so it asks for anything. */
const CONFIRMS = /^\W*(yes|yeah|yep|sure|ok(ay)?|do it|go ahead|please)\b/i;

export const NEEDS_ASKING: Record<string, RegExp> = {
  open_terminals: /\b(open|launch|start|spin|spawn|new|create|fire|boot|give|get|add|want|need|another|more|run|relaunch|again)\b/i,
  close_terminals: /\b(close|kill|stop|shut|end|quit|exit|terminate|rid|clear|clean)\b/i,
  remove_project: /\b(remove|delete|forget|drop|rid)\b/i,
  add_project: /\b(add|import|existing|folder|directory)\b|[~/]/i,
  rename_project: /\b(rename|call|name|title)\b/i,
  rename_terminal: /\b(rename|call|name|title|label)\b/i,
  restart_terminal: /\b(restart|resume|rerun|reboot|again|revive|relaunch|start)\b/i,
  send_to_terminal: /\b(tell|ask|send|type|say|write|instruct|message|prompt|enter|press|interrupt|stop|cancel|halt|answer|reply|respond|yes|no|approve|accept|allow|deny|decline|reject|confirm|proceed|continue|ahead|let)\b/i,
};

/**
 * Runs the calls in order, stopping at the ceiling. Order matters — "open three
 * terminals then tell me what they are doing" is two calls whose second one is
 * only true after the first has run — so these are never run in parallel.
 * `done` carries the changing calls that already succeeded in this reply: a
 * model that asks to open five terminals twice gets five.
 */
export async function performToolCalls(
  calls: ChatToolCall[],
  run: ToolRunner,
  memory: ReplyMemory = replyMemory(),
): Promise<PerformedTool[]> {
  const performed: PerformedTool[] = [];
  for (const call of calls.slice(0, MAX_TOOL_CALLS)) {
    performed.push({ call, result: await performOne(call, run, memory) });
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

async function performOne(call: ChatToolCall, run: ToolRunner, memory: ReplyMemory): Promise<ToolResult> {
  const tool = findTool(call.name);
  if (!tool) {
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
  const key = `${call.name}:${JSON.stringify(args)}`;
  if (memory.done.has(key) || memory.reads.has(key)) {
    return { summary: "Already done", detail: `${call.name} with those settings already ran in this reply; its result is above. Not repeated.`, skipped: true };
  }
  const asked = NEEDS_ASKING[call.name];
  if (asked && memory.request && !asked.test(memory.request) && !CONFIRMS.test(memory.request)) {
    return {
      summary: "Not asked for",
      detail: `Not done: my message did not ask for ${call.name.replace(/_/g, " ")}. Do not do it — answer what I asked.`,
      skipped: true,
    };
  }
  const result = await run(call.name, args, memory.request);
  if (!tool.changes) memory.reads.add(key);
  else if (!result.failed) {
    memory.done.add(key);
    memory.reads.clear();
  }
  return result;
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
 * terminals as requested", and a fixed sentence did not stop it. It is asked
 * to *finish the request*, not to narrate the tools: "what is this terminal
 * doing?" answered with "the terminal was listed and checked" is the failure
 * the old wording produced. */
export function afterTools(performed: PerformedTool[], canAct = true, request = ""): string {
  const lines = performed.map((entry) =>
    `- ${entry.call.name}: ${entry.result.skipped ? "SKIPPED" : entry.result.failed ? "FAILED" : "DONE"} — ${entry.result.detail.split("\n")[0]}`,
  );
  const anyFailed = performed.some((entry) => entry.result.failed);
  // The person's words are restated: this message is the newest one the model
  // sees, and "finish my last request" once read as this report — the model
  // kept acting, and answered "what projects do I have?" by approving a
  // permission prompt nobody had mentioned.
  return [
    "Vibyra ran those actions. What happened (full results are in the messages above):",
    ...lines,
    "",
    request ? `What I asked for: "${request}"` : "",
    canAct
      ? "If that still needs an action — reading the terminal you just found, fixing a call that failed — " +
        "call that one tool now. Never do anything I did not ask for. Otherwise reply to me."
      : "Now reply to me. No more actions this time.",
    "If I asked a question, answer it from every result in this reply — for each terminal I asked about, say " +
      "what it is actually working on and where it has got to, from its screen. If I asked for an action, say in " +
      "one short sentence what was done.",
    anyFailed
      ? "At least one FAILED. Say plainly that it did not happen and why. Never describe a failed action as " +
        "done, and never say 'as requested' about one."
      : "Do not describe the tools you used, and do not offer to do more.",
  ].join("\n");
}
