// Turning a written reply into something worth hearing.
//
// A reply is markdown meant for the eye: backticks, asterisks, bullet dashes
// and link URLs all read as noise when spoken. Stripping them is pure, so the
// shaping is a unit test rather than something judged by listening.

/** Mirrors MAX_SPEECH_CHARS in `commands/speech.rs`; the backend still clamps. */
export const SPEAK_MAX_CHARS = 1_200;

const FENCE = /```[\s\S]*?(?:```|$)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const INLINE_CODE = /`([^`]*)`/g;
const STAR_EMPHASIS = /(\*\*?)(\S(?:[^*]*\S)?)\1/g;
// Underscores only count as emphasis when they flank a whole word. Without
// that guard `a_b_c.txt` — an ordinary filename in terminal output — is read
// aloud as "abc.txt".
const UNDER_EMPHASIS = /(^|[\s(])(__?)(\S(?:[^_]*\S)?)\2(?=[\s.,!?;:)]|$)/g;
const HEADING = /^\s{0,3}#{1,6}\s+/gm;
const BULLET = /^\s*[-*+]\s+/gm;
const QUOTE = /^\s*>\s?/gm;
const WHITESPACE = /\s+/g;

/**
 * The spoken form of a reply.
 *
 * Code is named rather than read out: a fenced block spelled character by
 * character is unlistenable, and the user has the written reply on screen for
 * the detail. Everything else keeps its words and loses only its punctuation
 * furniture.
 */
export function speakableText(markdown: string, limit = SPEAK_MAX_CHARS): string {
  const spoken = (markdown ?? "")
    .replace(FENCE, " (code block) ")
    .replace(LINK, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(STAR_EMPHASIS, "$2")
    .replace(UNDER_EMPHASIS, "$1$3")
    .replace(HEADING, "")
    .replace(BULLET, "")
    .replace(QUOTE, "")
    .replace(WHITESPACE, " ")
    .trim();
  return spoken.length <= limit ? spoken : cutAtSentence(spoken, limit);
}

/** Prefers the end of a sentence, so a trimmed reply does not stop mid-word. */
function cutAtSentence(text: string, limit: number): string {
  const head = text.slice(0, limit);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (stop > limit / 2) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(" ");
  return space > 0 ? head.slice(0, space) : head;
}
