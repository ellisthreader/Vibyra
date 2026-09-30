/** One parser for suggestions, highlighting and account-scoped tool routing. */
export function activeMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const end = Math.max(0, Math.min(caret, text.length));
  const match = /(?:^|[\s([{])@([ \t]*[A-Za-z0-9]*)$/.exec(text.slice(0, end));
  return match ? { start: end - match[1].length - 1, query: match[1].trim().toLowerCase() } : null;
}

export function applyMention(
  text: string,
  start: number,
  caret: number,
  id: string,
): { text: string; caret: number } {
  // Replace the complete token even when the caret is in the middle of @github.
  const end = caret + (/^[A-Za-z0-9]*/.exec(text.slice(caret))?.[0].length ?? 0);
  const token = `@${id}` + (/^\s/.test(text.slice(end)) ? '' : ' ');
  return { text: text.slice(0, start) + token + text.slice(end), caret: start + token.length };
}

export function mentionParts(text: string, known: string[]): { text: string; id?: string }[] {
  const canonical = new Map(known.map((id) => [id.toLowerCase(), id]));
  const parts: { text: string; id?: string }[] = [];
  let end = 0;
  for (const match of text.matchAll(/(?:^|[\s([{])@([ \t]*)([A-Za-z0-9]+)(?![A-Za-z0-9_-])/g)) {
    const id = canonical.get(match[2].toLowerCase());
    if (!id) continue;
    const start = match.index! + match[0].indexOf('@');
    if (start > end) parts.push({ text: text.slice(end, start) });
    end = match.index! + match[0].length;
    parts.push({ text: text.slice(start, end), id });
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}

export function mentionedIds(text: string, known: string[]): string[] {
  return [...new Set(mentionParts(text, known).flatMap((part) => (part.id ? [part.id] : [])))];
}
