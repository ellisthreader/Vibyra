import type { CSSProperties, ReactNode } from "react";

import type { PaletteRange } from "../../lib/paletteQuery";
import type { RankedPaletteEntry } from "../../lib/paletteTypes";

/** Lights up the characters the query matched, so a fuzzy hit explains itself. */
function Highlighted({ text, ranges }: { text: string; ranges: PaletteRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="pal__hit">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** The mark at the head of a row: a coloured initial, an icon, or a dot. */
function Mark({ entry }: { entry: RankedPaletteEntry }) {
  const Icon = entry.icon;
  if (entry.mono) {
    return (
      <span
        className="launch__mono pal__mono"
        style={{ "--hc": entry.accent ?? "var(--accent)" } as CSSProperties}
      >
        {entry.mono}
      </span>
    );
  }
  if (Icon) return <span className="pal__icon"><Icon size={14} /></span>;
  if (entry.attention) return <span className="adot adot--attention" />;
  return <span className="pal__spark">›</span>;
}

interface Props {
  entry: RankedPaletteEntry;
  selected: boolean;
  onHover: () => void;
  onRun: () => void;
}

export function CommandPaletteRow({ entry, selected, onHover, onRun }: Props) {
  const classes = [
    "pal__row",
    selected ? "pal__row--sel" : "",
    entry.attention ? "pal__row--attn" : "",
    entry.danger ? "pal__row--danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      data-selected={selected ? "1" : undefined}
      onMouseMove={onHover}
      onClick={onRun}
    >
      <Mark entry={entry} />
      <span className="pal__text">
        <span className="pal__label">
          <Highlighted text={entry.label} ranges={entry.ranges} />
        </span>
        {entry.detail && (
          <span className={`pal__detail ${entry.code ? "pal__detail--code" : ""}`}>
            {entry.detail}
          </span>
        )}
      </span>
      {entry.hint && <span className="pal__hint">{entry.hint}</span>}
    </button>
  );
}
