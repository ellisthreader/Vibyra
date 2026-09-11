/**
 * Mentions are how a person points a reply at a connected integration: typing
 * `@github` in the composer addresses that turn to GitHub rather than to the
 * model alone, and the composer offers a picker while the token is being typed.
 *
 * Matching is deliberately strict. A mention is an `@` at the very start of the
 * text or directly after whitespace, followed only by letters and digits, and it
 * ends at the first character that is neither. That is what keeps ordinary prose
 * and email addresses out: `me@stripe.com` is mail to a person rather than a
 * request to the Stripe integration, `x@github` is an address, and `@githubbing` is a
 * word. A missed mention costs one keystroke; an invented one silently hands a
 * private message to a third-party service.
 *
 * These are pure string functions with no React or react-native import, so the
 * rules can be exercised on their own under `tsx --test`.
 */

/**
 * The mention token being typed at the caret, or null when the caret is not in
 * one. `query` is what has been typed after the `@`, lowercased for matching,
 * and is '' the moment the `@` itself is typed — that empty query is what opens
 * the picker on the full list of integrations.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const end = Math.max(0, Math.min(caret, text.length));
  for (let index = end - 1; index >= 0; index -= 1) {
    const char = text.charAt(index);
    // An `@` glued to the end of a word belongs to that word, not to a mention.
    if (char === '@') return index === 0 || /\s/.test(text.charAt(index - 1))
      ? { start: index, query: text.slice(index + 1, end).toLowerCase() } : null;
    if (!/[A-Za-z0-9]/.test(char)) return null;
  }
  return null;
}

/**
 * Completes the token at `[start, caret)` with the chosen integration. The trailing
 * space both closes the token and puts the caret where typing continues, so
 * picking from the list never needs a second keystroke to get out of the token.
 */
export function applyMention(text: string, start: number, caret: number, id: string): { text: string; caret: number } {
  // Completing a mention in the middle of a sentence must not double the space
  // that is already there, so the closing space is added only when one is needed.
  const token = `@${id}` + (/^\s/.test(text.slice(caret)) ? '' : ' ');
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}

/**
 * The integrations a finished message actually addresses. Ids come back deduped and
 * in the order they first appear in the text, not the order of `known`, because
 * that is the order the person wrote them in.
 */
export function mentionedIds(text: string, known: string[]): string[] {
  const canonical = new Map<string, string>(known.map(id => [id.toLowerCase(), id] as const));
  const found: string[] = [];
  // The greedy slug is what rejects `@githubbing`: it captures the whole word,
  // and the whole word is not a known id.
  for (const match of text.matchAll(/(?:^|\s)@([A-Za-z0-9]+)/g)) {
    const id = canonical.get(match[1].toLowerCase());
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
