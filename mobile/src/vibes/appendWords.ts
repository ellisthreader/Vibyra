/**
 * Words added to the end of a message, with exactly one space between them and
 * what was already there. Voice input uses it with the same base on every update,
 * because the recogniser re-sends its whole transcript as the guess firms up;
 * appending each update instead would repeat every word.
 */
export function appendWords(base: string, words: string) {
  const added = words.trim();
  if (!added) return base;
  if (!base.trim()) return added;
  return /\s$/.test(base) ? base + added : base + ' ' + added;
}
