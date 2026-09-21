import { useLayoutEffect, useState } from 'react';

import { terminalGridColumns, terminalGridCells } from './terminalGridColumns';

export function useTerminalGrid(element: HTMLElement | null, count: number) {
  const [size, setSize] = useState({ width: 1000, height: 650 });
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize(previous =>
        previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const columns = terminalGridColumns(count, size.width, size.height);
  const { rows, tracks, cells } = terminalGridCells(count, columns);
  return { cells, style: { gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } };
}
