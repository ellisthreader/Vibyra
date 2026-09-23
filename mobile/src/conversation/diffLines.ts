export interface DiffLine {
  text: string;
  kind: 'added' | 'removed' | 'context' | 'hunk' | 'meta';
  oldLine?: number;
  newLine?: number;
}
export function diffLines(patch: string): DiffLine[] {
  let oldLine = 0,
    newLine = 0,
    inHunk = false;
  return patch.split('\n').map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      return { text, kind: 'hunk' };
    }
    if (!inHunk || text.startsWith('\\')) return { text, kind: 'meta' };
    if (text.startsWith('+')) return { text, kind: 'added', newLine: newLine++ };
    if (text.startsWith('-')) return { text, kind: 'removed', oldLine: oldLine++ };
    if (text.startsWith(' '))
      return { text, kind: 'context', oldLine: oldLine++, newLine: newLine++ };
    return { text, kind: 'meta' };
  });
}
export function splitDiff(
  lines: DiffLine[],
): { left?: DiffLine; right?: DiffLine; header?: DiffLine }[] {
  const result: { left?: DiffLine; right?: DiffLine; header?: DiffLine }[] = [];
  let removed: DiffLine[] = [],
    added: DiffLine[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      result.push({ left: removed[i], right: added[i] });
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === 'removed') {
      if (added.length) flush();
      removed.push(line);
    } else if (line.kind === 'added') added.push(line);
    else {
      flush();
      result.push(line.kind === 'context' ? { left: line, right: line } : { header: line });
    }
  }
  flush();
  return result;
}
