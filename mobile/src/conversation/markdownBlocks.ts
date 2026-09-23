export type TableAlignment = 'left' | 'center' | 'right';
export type MarkdownBlock =
  | { kind: 'text' | 'code'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][]; alignments: TableAlignment[] };

/** Escaped pipes belong to the cell, not the column structure. */
export function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\' && line[index + 1] === '|') {
      cell += '|';
      index++;
    } else if (line[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += line[index];
  }
  cells.push(cell.trim());
  if (line.trimStart().startsWith('|')) cells.shift();
  if (/(?<!\\)\|\s*$/.test(line)) cells.pop();
  return cells;
}

/** Recognize tables only after a valid delimiter; fenced examples remain literal. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let plain: string[] = [];
  const flush = () => {
    if (plain.length) blocks.push({ kind: 'text', text: plain.join('\n') });
    plain = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[index]);
    if (fence) {
      flush();
      const code: string[] = [];
      const closing = new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (++index < lines.length && !closing.test(lines[index])) code.push(lines[index]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const headers = tableCells(lines[index]);
    const delimiter = tableCells(lines[index + 1] ?? '');
    if (
      lines[index].includes('|') &&
      headers.length > 0 &&
      headers.length === delimiter.length &&
      delimiter.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      flush();
      index++;
      const rows: string[][] = [];
      while (
        index + 1 < lines.length &&
        lines[index + 1].trim() &&
        lines[index + 1].includes('|') &&
        !/^\s*(`{3,}|~{3,})/.test(lines[index + 1])
      ) {
        const cells = tableCells(lines[++index]);
        rows.push(headers.map((_, column) => cells[column] ?? ''));
      }
      blocks.push({
        kind: 'table',
        headers,
        rows,
        alignments: delimiter.map((cell) =>
          cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : 'left',
        ),
      });
    } else plain.push(lines[index]);
  }
  flush();
  return blocks;
}
