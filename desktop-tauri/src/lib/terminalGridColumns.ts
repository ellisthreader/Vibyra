/** Balance text width and visible history without putting any pane off screen. */
export function terminalGridColumns(count: number, width: number, height: number): number {
  if (count <= 1) return 1;
  let best = 1; let bestScore = Infinity;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const paneWidth = Math.max(1, (width - 8 * (columns - 1)) / columns);
    const paneHeight = Math.max(1, (height - 8 * (rows - 1)) / rows - 34);
    const shape = Math.abs(Math.log(paneWidth / paneHeight / 1.65));
    const empty = (columns * rows - count) / count;
    const score = shape + empty * 1.4;
    if (score < bestScore) { best = columns; bestScore = score; }
  }
  return best;
}

/** Balance row populations and let shorter rows use all their horizontal space. */
export function terminalGridCells(count: number, columns: number) {
  const rows = Math.max(1, Math.ceil(count / columns));
  const small = Math.floor(count / rows);
  const extra = count % rows;
  const tracks = Math.max(1, extra ? small * (small + 1) : small);
  const cells: { gridColumn: string; gridRow: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const size = small + (row < extra ? 1 : 0);
    for (let col = 0; col < size; col++) {
      const span = tracks / size;
      cells.push({ gridColumn: `${col * span + 1} / span ${span}`, gridRow: row + 1 });
    }
  }
  return { rows, tracks, cells };
}
