/** The sign-in card's words (security review F-24): the heading is the app's own; the reason is the teammate's, quoted. */
export const TAKEOVER_TITLE = 'Your teammate is asking you to sign in';
export const REASON_CAP = 160;

// Code point ranges of control, separator, zero-width and direction-override characters: none belongs in one plain line.
const INVISIBLE: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x2028, 0x2029], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
// Straight and curly double quotes.
const QUOTES = [0x22, 0x201c, 0x201d, 0x201e, 0x201f];

/**
 * What the model wrote as its reason, made safe to show in quotes: one line, no invisible or
 * direction characters, no double quotes (so it cannot close its own quotation and carry on in the
 * app's voice), at most 160 characters. `null` when nothing readable is left.
 */
export function teammateSays(reason: string | null | undefined): string | null {
  const plain = [...String(reason ?? '')].map(ch => {
    const code = ch.codePointAt(0)!;
    return INVISIBLE.some(([from, to]) => code >= from && code <= to) ? ' ' : QUOTES.includes(code) ? "'" : ch;
  }).join('').replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  const letters = [...plain];
  return letters.length <= REASON_CAP ? plain : `${letters.slice(0, REASON_CAP - 1).join('').trimEnd()}${String.fromCodePoint(0x2026)}`;
}
