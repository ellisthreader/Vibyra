import { useLayoutEffect, useReducer, useRef } from 'react';

import { terminalGridColumns, terminalGridCells } from './terminalGridColumns';

/**
 * The grid for `count` panes in `element`. Only the column choice renders:
 * the observer fires on every frame of a panel drag, and re-rendering the
 * stage and every pane card under it for a size nothing else reads was pure
 * waste. The size lives in a ref, and a new size re-renders only when it
 * changes the columns.
 */
export function useTerminalGrid(element: HTMLElement | null, count: number) {
  const size = useRef({ width: 1000, height: 650 });
  const columns = terminalGridColumns(count, size.current.width, size.current.height);
  const shown = useRef({ count, columns });
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => { shown.current = { count, columns }; });
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      size.current = { width, height };
      const { count, columns } = shown.current;
      if (terminalGridColumns(count, width, height) !== columns) rerender();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const { rows, tracks, cells } = terminalGridCells(count, columns);
  return { cells, style: { gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } };
}
