import { tableCells } from "../../../mobile/src/conversation/markdownBlocks.ts";

export type TableAlignment = "left" | "center" | "right";

export interface MarkdownTableBlock {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
}

const DELIMITER = /^:?-+:?$/;
const FENCE = /^\s{0,3}(?:`{3,}|~{3,})/;
const MINIMUM = 96;

function alignment(cell: string): TableAlignment {
  return cell.endsWith(":") ? (cell.startsWith(":") ? "center" : "right") : "left";
}

/**
 * A table exists only once its delimiter row confirms it, so a header line that is
 * still being typed stays prose and no column ever appears and then moves.
 * `next` is the last line consumed; `last` is the first line the caller cannot trust
 * yet, which while streaming is the unterminated line at the end of the buffer.
 */
export function readTable(
  lines: string[],
  index: number,
  streaming = false,
): (MarkdownTableBlock & { next: number }) | null {
  const last = streaming ? lines.length - 1 : lines.length;
  const headers = tableCells(lines[index]);
  const delimiter = tableCells(lines[index + 1] ?? "");
  if (!lines[index].includes("|") || index + 1 >= last) return null;
  if (!headers.length || headers.length !== delimiter.length) return null;
  if (!delimiter.every((cell) => DELIMITER.test(cell))) return null;

  const row = (at: number) =>
    at < lines.length && Boolean(lines[at].trim()) && lines[at].includes("|") && !FENCE.test(lines[at]);
  const rows: string[][] = [];
  let cursor = index + 1;
  while (row(cursor + 1)) {
    cursor += 1;
    // Half a row is still swallowed by the table: re-reading it as a paragraph would flicker.
    if (cursor >= last) break;
    const cells = tableCells(lines[cursor]);
    rows.push(headers.map((_, column) => cells[column] ?? ""));
  }
  return { headers, rows, alignments: delimiter.map(alignment), next: cursor };
}

/** Widths come from the header row alone, so a row arriving mid-stream cannot shift a column. */
export function columnWidths(headers: string[], available: number): number[] {
  const budget = Math.max(available, headers.length * MINIMUM);
  if (headers.length === 1) return [available];
  if (headers.length === 2) {
    const ratio = headers[0].length * 2 < (headers[1]?.length ?? 0) ? 0.36 : 0.5;
    const first = Math.max(MINIMUM, Math.min(budget - MINIMUM, budget * ratio));
    return [first, budget - first];
  }
  return headers.map((header) => Math.max(120, Math.min(280, header.length * 7 + 56)));
}
