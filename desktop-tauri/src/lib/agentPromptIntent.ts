import type { AgentPromptIntent } from "../notificationTypes";

// What one option of an agent's prompt means, and how it reads on a button.
// Split from the parser so the shape rules (where the block is, what the
// question was) stay separate from the language rules (what "Yes, and don't
// ask again" is), which are the ones most likely to need a new phrase.

const MAX_LABEL_CHARS = 120;
/** Buttons wider than this start pushing the toast's layout around. */
const MAX_BUTTON_CHARS = 22;

const REMEMBER =
  /(don['’]?t ask|do not ask|always allow|always approve|remember this|for this session|for the rest of)/i;
const AFFIRM = /^(y|yes|allow|approve|proceed|continue|accept|ok|okay|run)\b/i;
const DECLINE = /^(n|no|deny|decline|cancel|reject|abort|stop|never|don['’]?t|do not|esc)\b/i;

export function clampLabel(text: string, limit = MAX_LABEL_CHARS): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

export function intentOf(label: string): AgentPromptIntent {
  // Order matters: "Yes, and don't ask again" opens with an affirmative and is
  // still a remember, which is the one intent the toast must never offer.
  if (REMEMBER.test(label)) return "remember";
  if (AFFIRM.test(label)) return "affirm";
  if (DECLINE.test(label)) return "decline";
  return "other";
}

/** "No, and tell Codex what to do differently" is a button that reads "No". */
export function buttonLabel(label: string): string {
  const clause = label
    .replace(/[,:]\s+(and|but|then)\b.*$/i, "")
    .replace(/\s+[—–-]\s+.*$/, "")
    .trim();
  return clampLabel(clause || label, MAX_BUTTON_CHARS);
}
