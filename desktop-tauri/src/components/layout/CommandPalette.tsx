import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceStore } from "../../state/workspaceStore";
import {
  commandPaletteEntries,
  type CommandPaletteEntry,
} from "./commandPaletteEntries";

export function CommandPalette() {
  const open = useWorkspaceStore((s) => s.paletteOpen);
  const setOpen = useWorkspaceStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const entries = useMemo(() => {
    if (!open) return [];
    const all = commandPaletteEntries();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (e) => e.label.toLowerCase().includes(q) || e.group.toLowerCase().includes(q),
    );
  }, [open, query]);

  if (!open) return null;

  const execute = (entry: CommandPaletteEntry | undefined) => {
    if (!entry) return;
    setOpen(false);
    entry.run();
  };

  let lastGroup = "";

  return (
    <div className="pal-backdrop" onClick={() => setOpen(false)}>
      <div className="pal" onClick={(e) => e.stopPropagation()}>
        <div className="pal__query">
          <span className="pal__prompt">❯</span>
          <input
            ref={inputRef}
            className="pal__input"
            value={query}
            placeholder="Jump to a project, session, or action…"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                execute(entries[selected]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
        <div className="pal__list">
          {entries.length === 0 && <p className="pal__empty">Nothing matches “{query}”.</p>}
          {entries.map((entry, index) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {header && <div className="pal__group">{header}</div>}
                <button
                  className={`pal__row ${index === selected ? "pal__row--sel" : ""} ${
                    entry.attention ? "pal__row--attn" : ""
                  }`}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => execute(entry)}
                >
                  {entry.mono ? (
                    <span
                      className="launch__mono"
                      style={{ "--hc": entry.accent ?? "var(--accent)" } as React.CSSProperties}
                    >
                      {entry.mono}
                    </span>
                  ) : entry.attention ? (
                    <span className="adot adot--attention" />
                  ) : (
                    <span className="pal__spark">›</span>
                  )}
                  <span className="pal__label">{entry.label}</span>
                  {entry.hint && <span className="pal__hint">{entry.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
