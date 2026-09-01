import { parseInline, type InlineSpan } from "./agentMarkdownInline.ts";

export type { InlineSpan } from "./agentMarkdownInline.ts";

/** One block of a rendered answer. */
export type MarkdownBlock =
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "heading"; level: 2 | 3 | 4; spans: InlineSpan[] }
  | { kind: "list"; ordered: boolean; items: InlineSpan[][] }
  | { kind: "quote"; spans: InlineSpan[] }
  | { kind: "code"; language: string; text: string; open: boolean }
  | { kind: "rule" };

// The block half of the answer grammar.
//
// Deliberately not a markdown library. What an agent emits is a small, known
// set — headings, lists, quotes, fences, paragraphs — and a parser for it fits
// in one file with no dependency, no startup cost, and no HTML that has to be
// sanitised afterwards because none is ever produced. Every span reaches the
// DOM as a text node.
//
// The rule that shapes it: **an unterminated fence is a fence.** Answers are
// parsed while they stream, so the closing ``` has not arrived yet for most of
// the life of a code block. Treating that as literal backticks makes a block
// snap from prose to code when the model finishes typing it, which reads as
// the app glitching. `open` marks the ones still arriving.

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** Heading depth, flattened: a transcript is not a document outline. */
function headingLevel(hashes: number): 2 | 3 | 4 {
  if (hashes <= 1) return 2;
  return hashes === 2 ? 3 : 4;
}

export function parseAnswer(source: string): MarkdownBlock[] {
  const lines = source.split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = FENCE.exec(line);

    if (fence) {
      flush();
      const marker = fence[1][0];
      const body: string[] = [];
      let closed = false;
      index += 1;
      for (; index < lines.length; index += 1) {
        const candidate = FENCE.exec(lines[index]);
        if (candidate && candidate[1][0] === marker && !candidate[2]) {
          closed = true;
          break;
        }
        body.push(lines[index]);
      }
      blocks.push({
        kind: "code",
        language: fence[2] ?? "",
        text: body.join("\n"),
        open: !closed,
      });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: headingLevel(heading[1].length),
        spans: parseInline(heading[2]),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const last = blocks[blocks.length - 1];
      const item = parseInline((bullet ?? numbered)![1]);
      // A list interrupted by a paragraph starts a new list; one that simply
      // continues keeps its numbering and its bullet column.
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "quote") last.spans.push({ kind: "text", text: `\n${quote[1]}` });
      else blocks.push({ kind: "quote", spans: parseInline(quote[1]) });
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}
