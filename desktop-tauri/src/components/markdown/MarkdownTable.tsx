import { useLayoutEffect, useRef, useState } from "react";
import { columnWidths, type TableAlignment } from "../../lib/markdownTable.ts";
import { MarkdownInline } from "./MarkdownInline";

/** Before the observer has measured anything, a sidebar-shaped guess. */
const FALLBACK = 320;

/**
 * A real `<table>`, so a screen reader gets row and column association for
 * free — the whole reason not to build this out of divs. `table-layout: fixed`
 * with header-derived widths is the other half: under `fixed` the browser is
 * forbidden from measuring a body cell, so a row arriving mid-stream cannot
 * move a column the reader is already reading.
 */
export function MarkdownTable({
  headers,
  rows,
  alignments,
}: {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const node = wrap.current;
    if (!node) return;
    // The sidebar resizes 320–560 and can be pulled to 760; widths follow it.
    const observer = new ResizeObserver(() => setAvailable(node.clientWidth));
    observer.observe(node);
    setAvailable(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const widths = columnWidths(headers, available || FALLBACK);
  const total = widths.reduce((sum, width) => sum + width, 0);
  // A tab stop is only worth a keyboard's time when there is something to scroll.
  const scrolls = available > 0 && total > available + 1;
  const region = scrolls ? ({ tabIndex: 0, role: "region", "aria-label": "Table, scrolls sideways" } as const) : {};

  return (
    <div className="md-table" ref={wrap} {...region}>
      <table style={{ width: Math.max(total, available) }}>
        <colgroup>
          {widths.map((width, at) => (
            <col key={at} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {headers.map((header, at) => (
              <th key={at} scope="col" style={{ textAlign: alignments[at] }}>
                <MarkdownInline text={header} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, at) => (
            <tr key={at}>
              {row.map((cell, column) => (
                <td key={column} style={{ textAlign: alignments[column] }}>
                  <MarkdownInline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
