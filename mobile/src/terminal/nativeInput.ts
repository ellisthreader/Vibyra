import { plainPunctuation } from './composerInput';

// A character before the caret lets iOS report Backspace even at an empty prompt.
export const INPUT_ANCHOR = '\u200b';

/** Translate native editing into terminal keys; the computer owns the echo. */
export function nativeInputDelta(previous: string, next: string): string {
  const before = Array.from(
    plainPunctuation(previous.startsWith(INPUT_ANCHOR) ? previous.slice(1) : previous),
  );
  const after = Array.from(plainPunctuation(next.startsWith(INPUT_ANCHOR) ? next.slice(1) : next));
  if (!next && previous === INPUT_ANCHOR) return '\x7f';
  let same = 0;
  while (same < before.length && same < after.length && before[same] === after[same]) same++;
  return '\x7f'.repeat(before.length - same) + after.slice(same).join('').replace(/\r?\n/g, '\r');
}
