import type { ReactNode } from "react";

import type { LineRow } from "./diffRows.ts";
import type { WordSpan } from "./diffWords.ts";

/** The +/− column. A UI mark, so it uses the panel's minus, not the ASCII one. */
const SIGN: Record<LineRow["kind"], string> = { add: "+", del: "−", context: " " };

/**
 * The changed segments, wrapped. Everything between them is plain text: the
 * line already carries the +/− tint, so the mark is a second, quieter reading
 * of the same line rather than a colour competing with it.
 */
function marked(text: string, spans: WordSpan[] | null): ReactNode {
  if (!spans || spans.length === 0) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at) parts.push(text.slice(at, span.start));
    parts.push(
      <mark key={span.start} className="review-diff__mark">
        {text.slice(span.start, span.end)}
      </mark>,
    );
    at = span.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * One line of the patch: its two line numbers, its sign, its text.
 *
 * The empty string is rendered as a space so a blank line keeps the row height
 * every other row has — uniform heights are what let the window position rows
 * by arithmetic instead of measuring each one.
 */
export function DiffLineRow({ row, digits }: { row: LineRow; digits: number }) {
  const width = { width: `${digits}ch` };
  return (
    <>
      <span className="review-diff__gutter" aria-hidden="true">
        <span className="review-diff__num" style={width}>
          {row.oldNumber ?? ""}
        </span>
        <span className="review-diff__num" style={width}>
          {row.newNumber ?? ""}
        </span>
        <span className="review-diff__sign">{SIGN[row.kind]}</span>
      </span>
      <code className="review-diff__code">
        {marked(row.text, row.marks) || " "}
        {row.noNewline && (
          <span className="review-diff__nonl" title="No newline at end of file">
            {" ↵"}
          </span>
        )}
      </code>
    </>
  );
}
