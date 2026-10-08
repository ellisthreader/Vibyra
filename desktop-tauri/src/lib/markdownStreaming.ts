import type { MarkdownBlock } from "./markdownDocument.ts";

const RUN = /\*{1,2}|_{1,2}|~{1,2}|`/g;
const WORD = /[\p{L}\p{N}]/u;

/**
 * Where a run opened on this line and never closed. Only a streamed parse can tell a
 * delimiter still waiting for its partner from one the reply meant literally, so the
 * cut belongs here: the renderer never learns that a document is still being written.
 */
function openedAt(line: string): number {
  const open: { token: string; at: number }[] = [];
  for (const match of line.matchAll(RUN)) {
    const token = match[0];
    const at = match.index ?? 0;
    const before = line[at - 1] ?? "";
    const after = line[at + token.length] ?? "";
    const top = open.at(-1);
    // A pair around nothing is one marker still being typed, not an empty span.
    if (top?.token === token && before.trim() && at > top.at + token.length) open.pop();
    // A run opens against text, never against a space: `2 * 3` and `build_brief` are prose.
    else if ((!after || after.trim()) && (token[0] !== "_" || !WORD.test(before))) open.push({ token, at });
  }
  return open[0]?.at ?? -1;
}

/**
 * The half-written tail of a block: an emphasis or code run whose closer has not
 * arrived, or a link label with no closing bracket, along with the text inside it.
 * The phrase appears whole when it is whole, rather than painting its own asterisks.
 */
function trimPartial(text: string): string {
  const start = text.lastIndexOf("\n") + 1;
  const line = text.slice(start);
  let cut = openedAt(line);
  const label = line.lastIndexOf("[");
  if (label >= 0 && !line.includes("]", label) && (cut < 0 || label < cut)) cut = label;
  return (text.slice(0, start) + (cut < 0 ? line : line.slice(0, cut))).trimEnd();
}

/** Only the block still being written may be trimmed; every earlier block is settled. */
export function settleTail(blocks: MarkdownBlock[]): void {
  const tail = blocks.at(-1);
  if (!tail) return;
  if (tail.kind === "paragraph" || tail.kind === "quote") tail.text = trimPartial(tail.text);
  else if (tail.kind === "list") {
    const item = tail.items.at(-1);
    if (item) item.text = trimPartial(item.text);
  }
}
