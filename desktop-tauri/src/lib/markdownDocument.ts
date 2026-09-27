import { settleTail } from "./markdownStreaming.ts";
import { readTable, type TableAlignment } from "./markdownTable.ts";

export type { TableAlignment };

export interface MarkdownHeading {
  id: string;
  level: number;
  text: string;
}

export type ListItem = { text: string; depth: number; checked?: boolean };

export type MarkdownBlock =
  | { kind: "heading"; heading: MarkdownHeading }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; text: string; closed: boolean }
  | { kind: "rule" }
  | { kind: "table"; headers: string[]; rows: string[][]; alignments: TableAlignment[] };

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  headings: MarkdownHeading[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const RULE = /^\s*(?:---+|___+|\*\*\*+)\s*$/;
const LIST = /^(\s*)(?:(\d+)[.)]|[-*+])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const PARTIAL_MARKER = /^\s*(?:[-*+]|\d+[.)]?)\s*$/;

function headingId(text: string, seen: Map<string, number>): string {
  const base = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

/** Nesting belongs to the list above it; a depth-0 marker of the other kind starts a new one. */
function pushItem(blocks: MarkdownBlock[], match: RegExpMatchArray): void {
  const ordered = Boolean(match[2]);
  const depth = Math.min(3, Math.floor(match[1].length / 2));
  const task = match[3].match(TASK);
  const item: ListItem = task ? { text: task[2], depth, checked: task[1] !== " " } : { text: match[3], depth };
  const tail = blocks.at(-1);
  if (tail?.kind === "list" && (tail.ordered === ordered || depth > 0)) tail.items.push(item);
  else blocks.push({ kind: "list", ordered, items: [item] });
}

/**
 * One left-to-right pass with no lookbehind past the current block, so re-parsing a
 * longer prefix of a streamed reply never rewrites a block the reader already has.
 */
export function parseMarkdownDocument(markdown: string, options?: { streaming?: boolean }): MarkdownDocument {
  const streaming = options?.streaming ?? false;
  const blocks: MarkdownBlock[] = [];
  const headings: MarkdownHeading[] = [];
  const seen = new Map<string, number>();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    // A wrapped answer is not one sentence: soft breaks stay where the model put them.
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // A lone bullet is the start of an item, not prose: rendering it would flash a stray line.
    if (streaming && index === lines.length - 1 && PARTIAL_MARKER.test(line)) continue;
    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const closing = new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      const partial = new RegExp(`^\\s{0,3}${fence[1][0]}{1,2}\\s*$`);
      const code: string[] = [];
      while (++index < lines.length && !closing.test(lines[index])) code.push(lines[index]);
      // An open fence still renders; the renderer withholds Copy and Run until it closes.
      const closed = index < lines.length;
      // Its own closer arriving one delta at a time is not body text: hold that line back.
      if (streaming && !closed && partial.test(code.at(-1) ?? "")) code.pop();
      blocks.push({ kind: "code", language: fence[2] ?? "", text: code.join("\n"), closed });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      const item = { id: headingId(heading[2], seen), level: heading[1].length, text: heading[2] };
      headings.push(item);
      blocks.push({ kind: "heading", heading: item });
      continue;
    }
    const table = readTable(lines, index, streaming);
    if (table) {
      flush();
      const { headers, rows, alignments } = table;
      blocks.push({ kind: "table", headers, rows, alignments });
      index = table.next;
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const list = line.match(LIST);
    if (list) {
      flush();
      pushItem(blocks, list);
      continue;
    }
    const quote = line.match(QUOTE);
    if (quote) {
      flush();
      blocks.push({ kind: "quote", text: quote[1] });
      continue;
    }
    if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  if (streaming) settleTail(blocks);
  return { blocks, headings };
}

function inlineText(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|~~|\*|_)([^\n]+?)\1/g, "$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
    .trim();
}

/** A bare row of values means nothing aloud; every cell is read with its column. */
function spokenTable(table: Extract<MarkdownBlock, { kind: "table" }>): string {
  if (!table.rows.length) return table.headers.map((header) => inlineText(header)).join(", ");
  return table.rows
    .map((row) => row.map((cell, at) => `${inlineText(table.headers[at])}: ${inlineText(cell)}`).join(", "))
    .join("\n");
}

function spokenBlock(block: MarkdownBlock): string {
  if (block.kind === "heading") return inlineText(block.heading.text);
  if (block.kind === "paragraph" || block.kind === "quote") return inlineText(block.text);
  if (block.kind === "list") return block.items.map((item) => inlineText(item.text)).join("\n");
  if (block.kind === "code") return block.text.trim();
  if (block.kind === "table") return spokenTable(block);
  return "";
}

/** Readable text with markup stripped: speech must not read pipes and asterisks aloud. */
export function plainText(doc: MarkdownDocument): string {
  return doc.blocks.map(spokenBlock).filter(Boolean).join("\n\n");
}
