import type {
  AgentPromptIntent,
  AgentPromptOffer,
  AgentPromptOption,
} from "../notificationTypes";
import { clampLabel, intentOf } from "./agentPromptIntent.ts";

// Pure parser for the approval prompts CLI agents draw at the foot of a pane:
// Codex's numbered list, Claude Code's "[y/n]", Gemini's "Allow?".
//
// It is handed plain logical lines rather than a terminal — `agentPromptScan`
// owns the xterm buffer — so every rule below is a unit test rather than a
// screenshot. Nothing here reaches the PTY either: the worst a wrong parse can
// do is produce a vaguer toast.

/** Prompt blocks sit at the foot of the screen; further up is scrollback. */
const MAX_SCAN_LINES = 24;
/** Lines of command allowed into a notice before it stops being a summary. */
const MAX_DETAIL_LINES = 6;
/** A prompt still followed by output has been answered already. Its own footer
 * ("Press enter to confirm…") is the only trailing text that survives. */
const MAX_TRAILING_LINES = 3;
const GUTTER = /^[\s>❯▸►·•▌▍│┃|╎┆]+/;
const NUMBERED = /^(\d{1,2})[.)]\s+(\S.*)$/;
const KEY_HINT = /\s*\(([A-Za-z])\)\s*$/;
const WORD_HINT = /\s*\((?:esc|enter|return|tab|space)\)\s*$/i;
const YES_NO = /[[(]\s*y\s*\/\s*n\s*[\])]/i;
const COMMAND_LINE = /^[$#]\s+(\S.*)$/;

const QUESTION =
  /^(would you like|do you want|shall i|may i|can i|allow|approve|permission|run |execute|apply |proceed|continue)\b.*\?$/i;

interface OptionBlock {
  options: AgentPromptOption[];
  /** Index the context search stops at — everything above it is context. */
  start: number;
  /** Index of the last option line, for the "already answered" guard. */
  end: number;
}

function strip(line: string): string {
  return line.replace(GUTTER, "").trimEnd();
}

function option(raw: string, fallbackKey: string): AgentPromptOption {
  const text = raw.replace(WORD_HINT, "");
  const hint = KEY_HINT.exec(text);
  const label = clampLabel(hint ? text.slice(0, hint.index) : text);
  // A drawn list is a select: the key alone commits it. See `submit`.
  return { key: hint ? hint[1] : fallbackKey, submit: false, label, intent: intentOf(label) };
}

/** The last ascending 1..N list in the window; a stray "1." earlier restarts it. */
function numberedOptions(lines: string[]): OptionBlock | null {
  const options: AgentPromptOption[] = [];
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = NUMBERED.exec(lines[i]);
    if (!match) {
      // A blank line inside the list is layout; any other text ends it.
      if (options.length > 0 && lines[i] !== "") break;
      continue;
    }
    const number = Number(match[1]);
    if (number === 1) {
      options.length = 0;
      start = i;
    } else if (options.length === 0 || number !== options.length + 1) {
      continue;
    }
    options.push(option(match[2], match[1]));
    end = i;
  }
  return options.length >= 2 ? { options, start, end } : null;
}

/** The "[y/n]" shape, where the question and the options share one line. */
function yesNoOptions(lines: string[]): OptionBlock | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!YES_NO.test(lines[i])) continue;
    return {
      options: [
        { key: "y", submit: true, label: "Yes", intent: "affirm" },
        { key: "n", submit: true, label: "No", intent: "decline" },
      ],
      // `start` is the exclusive upper bound of the context search, and here
      // the question is on the option line itself.
      start: i + 1,
      end: i,
    };
  }
  return null;
}

/**
 * The question above the options.
 *
 * Scans upward but prefers a line that reads like an ask, because a wrapped
 * "…to generate a valid fresh QR?" ends in a question mark too and sits nearer
 * the options than the sentence a human would quote.
 */
function questionFrom(lines: string[], upto: number): string {
  let fallback = "";
  for (let i = upto - 1; i >= 0; i -= 1) {
    const line = lines[i];
    // "Do you want to proceed? [y/n]" ends in a bracket, not a question mark.
    // The marker is dropped for the test and kept for the reader, who should
    // see the line exactly as the agent drew it.
    const text = line.replace(YES_NO, "").trim();
    if (!text.endsWith("?")) continue;
    if (QUESTION.test(text)) return clampLabel(line);
    if (!fallback) fallback = clampLabel(line);
  }
  return fallback;
}

/** The "$ …" block under the question: its first line plus any continuations. */
function detailFrom(lines: string[], upto: number): string[] {
  let head = -1;
  for (let i = upto - 1; i >= 0; i -= 1) {
    if (COMMAND_LINE.test(lines[i])) {
      head = i;
      break;
    }
  }
  if (head < 0) return [];
  const detail = [COMMAND_LINE.exec(lines[head])?.[1] ?? ""];
  for (let i = head + 1; i < upto && lines[i] !== ""; i += 1) detail.push(lines[i]);
  return detail.slice(0, MAX_DETAIL_LINES).map((line) => clampLabel(line));
}

/** FNV-1a. Cheap, stable, and only ever compared against itself. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseAgentPrompt(
  raw: readonly string[],
  sessionId: number,
): AgentPromptOffer | null {
  const lines = raw.slice(-MAX_SCAN_LINES).map(strip);
  const block = numberedOptions(lines) ?? yesNoOptions(lines);
  if (!block) return null;
  if (lines.slice(block.end + 1).filter(Boolean).length > MAX_TRAILING_LINES) return null;

  const question = questionFrom(lines, block.start);
  const detail = detailFrom(lines, block.start);
  if (!question && detail.length === 0) return null;
  const fingerprint = digest(
    [question, detail.join("\n"), ...block.options.map((o) => `${o.key}${o.label}`)].join(" "),
  );
  return { sessionId, question, detail, options: block.options, fingerprint };
}

/** The first option of an intent, or none — a prompt need not offer both. */
export function promptOption(
  offer: AgentPromptOffer,
  intent: AgentPromptIntent,
): AgentPromptOption | undefined {
  return offer.options.find((candidate) => candidate.intent === intent);
}

export function promptHeadline(name: string, offer: AgentPromptOffer): string {
  return offer.detail.length > 0 ? `${name} wants to run a command` : `${name} needs your answer`;
}
