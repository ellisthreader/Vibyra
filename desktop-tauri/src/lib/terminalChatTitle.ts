import { TerminalPromptTracker } from "./terminalPromptTracker.ts";
import { normalizeTerminalChatTitle } from "./terminalTitle.ts";

const MAX_TITLE_CHARS = 64;
const MAX_TITLE_WORDS = 9;

const NATIVE_CHAT_TITLE_AGENTS = new Set(["claude"]);
const NON_CHAT_AGENTS = new Set(["shell", "ssh"]);
const UTILITY_COMMAND = /^\/(?:clear|exit|help|login|logout|model|quit|resume|settings|status|theme)\b/i;
const SHORT_REPLY = /^(?:[yn]|yes|no|ok|okay|allow|deny|always allow|trust|cancel|continue)$/i;

/** Claude supplies its own chat-aware OSC title; shells are not AI chats. */
export function needsPromptDerivedTitle(agentId: string): boolean {
  return !NATIVE_CHAT_TITLE_AGENTS.has(agentId) && !NON_CHAT_AGENTS.has(agentId);
}

interface ChatPane {
  agentId: string;
  status: string;
  chatTitle: string | null;
}

/** A pane still to be named after its conversation, rather than its model. */
export function awaitsChatTitle(pane: ChatPane): boolean {
  return pane.status === "running"
    && needsPromptDerivedTitle(pane.agentId)
    && !normalizeTerminalChatTitle(pane.chatTitle);
}

/**
 * Whether to ask the agent what this pane's conversation is about.
 *
 * A pane that already has a name is still asked once, because the name may
 * have been restored from a session that could only guess at it — and a wrong
 * name nothing ever revisits is worse than none.
 */
export function asksForChatTitle(pane: ChatPane, answered: boolean): boolean {
  if (answered) return awaitsChatTitle(pane);
  return pane.status === "running" && needsPromptDerivedTitle(pane.agentId);
}

/** A compact, local-only title from the first real prompt sent to an AI CLI. */
export function titleFromPrompt(raw: string): string | null {
  let prompt = raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, " ")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/https?:\/\/\S+/gi, " linked page ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " account ")
    .replace(/\b(?:sk-|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/g, " credential ")
    .replace(/\b[A-Za-z0-9_=-]{28,}\b/g, " value ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^\s*(?:[#>*-]+|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!prompt || UTILITY_COMMAND.test(prompt) || SHORT_REPLY.test(prompt)) return null;
  prompt = prompt.replace(/^\/\S+\s+/, "");
  prompt = unwrapRequest(prompt);
  const sentence = prompt
    .split(/(?<=[.!?])\s+/u)
    .map((part) => unwrapRequest(part.replace(/[.!?]+$/, "").trim()))
    .find((part) => !UTILITY_COMMAND.test(part) && !SHORT_REPLY.test(part)
      && (part.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 4);
  if (sentence) prompt = sentence;
  if ((prompt.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 4) return null;

  const words = prompt.split(" ").filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const nextLength = length + (kept.length ? 1 : 0) + word.length;
    if (kept.length >= MAX_TITLE_WORDS || nextLength > MAX_TITLE_CHARS - 1) break;
    kept.push(word);
    length = nextLength;
  }
  if (kept.length === 0) return null;
  const truncated = kept.length < words.length;
  const title = kept.join(" ").replace(/[,:;.!?\-–—]+$/, "").trim();
  return title ? `${title}${truncated ? "…" : ""}` : null;
}

/**
 * Drops the conversational wrapping so the title is the request itself.
 *
 * The openers end at a word boundary rather than a space, because a dictated
 * prompt often trails off — "Can you... Can you make it so …" would otherwise
 * name the pane after the false start.
 */
function unwrapRequest(prompt: string): string {
  const lead = /^(?:(?:please\s+)?(?:can|could|would|will)\s+you\b\s*|please\b\s*|i\s+(?:need|want)\s+you\s+to\b\s*|help\s+me\s+(?:to\s+)?|(?:deeply|carefully|thoroughly)\s+)/i;
  let result = prompt;
  while (lead.test(result)) result = result.replace(lead, "").trimStart();
  result = result.replace(
    /^((?:review|audit|check)(?:ing)?)\s+(?:everything\s+)?(?:what|all(?:\s+of)?\s+what)\s+you(?:'ve|\s+have)?\s+(?:done|changed|implemented)\s+(?:for|with|to)\s+(?:the\s+)?/i,
    "$1 ",
  );
  // A closing courtesy names nothing, and dictated prompts nearly all have one.
  return result.replace(/[,\s]+(?:please|thanks|thank\s+you)\s*$/i, "").trimEnd();
}

const trackers = new Map<number, TerminalPromptTracker>();

/** The title a submitted prompt earns, once one is submitted on this session. */
export function observeTerminalPrompt(id: number, data: string): string | null {
  const tracker = trackers.get(id) ?? new TerminalPromptTracker();
  trackers.set(id, tracker);
  const submitted = tracker.push(data);
  const title = submitted === null ? null : titleFromPrompt(submitted);
  if (title) trackers.delete(id);
  return title;
}

export function clearTerminalPrompt(id: number): void {
  trackers.delete(id);
}
