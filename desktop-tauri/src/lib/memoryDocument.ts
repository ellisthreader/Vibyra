export interface MemoryHeading {
  id: string;
  level: number;
  text: string;
}

export type MemoryBlock =
  | { kind: "heading"; heading: MemoryHeading }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "rule" };

export interface MemoryDocumentModel {
  blocks: MemoryBlock[];
  headings: MemoryHeading[];
}

function headingId(text: string, seen: Map<string, number>): string {
  const base = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

export function parseMemoryDocument(markdown: string): MemoryDocumentModel {
  const blocks: MemoryBlock[] = [];
  const headings: MemoryHeading[] = [];
  const seen = new Map<string, number>();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let language = "";

  const flush = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([^\s`]*)/);
    if (fence) {
      if (code) {
        blocks.push({ kind: "code", language, text: code.join("\n") });
        code = null;
        language = "";
      } else {
        flush();
        code = [];
        language = fence[1] ?? "";
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      flush();
      const item = {
        id: headingId(heading[2], seen),
        level: heading[1].length,
        text: heading[2],
      };
      headings.push(item);
      blocks.push({ kind: "heading", heading: item });
      continue;
    }
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const list = line.match(/^\s*(?:(\d+)[.)]|[-*+])\s+(.+)$/);
    if (list) {
      flush();
      const ordered = Boolean(list[1]);
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(list[2]);
      else blocks.push({ kind: "list", ordered, items: [list[2]] });
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flush();
      blocks.push({ kind: "quote", text: quote[1] });
      continue;
    }
    if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  if (code) blocks.push({ kind: "code", language, text: code.join("\n") });
  flush();
  return { blocks, headings };
}
