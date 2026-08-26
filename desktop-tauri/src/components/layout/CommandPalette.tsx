import { useEffect, useMemo, useRef, useState } from "react";

import { notePaletteRun } from "../../lib/paletteRecents";
import type { PaletteScope } from "../../lib/paletteQuery";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CommandPaletteFooter } from "./CommandPaletteFooter";
import { CommandPaletteRow } from "./CommandPaletteRow";
import { commandPaletteEntries, paletteResults } from "./commandPaletteEntries";
import type { CommandPaletteEntry, RankedPaletteEntry } from "../../lib/paletteTypes";

const PLACEHOLDER: Record<PaletteScope, string> = {
  all: "Search sessions, projects and commands…",
  command: "Run a command…",
  session: "Jump to a session…",
  project: "Open a project…",
  ask: "Type a message for an agent, then pick who gets it…",
};

const NO_ENTRIES: CommandPaletteEntry[] = [];

function emptyMessage(scope: PaletteScope, text: string, hasTargets: boolean): string {
  if (scope !== "ask") return `Nothing matches “${text}”.`;
  if (!hasTargets) return "No agent is running in this project yet.";
  return "Type a message — the next line picks which agent it goes to.";
}

export function CommandPalette() {
  const open = useWorkspaceStore((state) => state.paletteOpen);
  const setOpen = useWorkspaceStore((state) => state.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [base, setBase] = useState<CommandPaletteEntry[]>(NO_ENTRIES);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Snapshot the app once per opening. Reading a blocked agent's question
  // means walking its terminal buffer; doing that per keystroke would make
  // typing here feel like typing into a terminal.
  useEffect(() => {
    if (!open) {
      setBase(NO_ENTRIES);
      return;
    }
    setQuery("");
    setSelected(0);
    setBase(commandPaletteEntries());
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const result = useMemo(() => paletteResults(base, query), [base, query]);
  const { entries, scope, text, grouped } = result;

  // Keyboard navigation is useless if the row it lands on is off-screen.
  useEffect(() => {
    listRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
  }, [selected, entries]);

  if (!open) return null;

  const execute = (entry: RankedPaletteEntry | undefined) => {
    if (!entry) return;
    notePaletteRun(entry.id);
    setOpen(false);
    entry.run();
  };

  const move = (delta: number) => {
    if (entries.length === 0) return;
    setSelected((current) => {
      const next = current + delta;
      return next < 0 ? entries.length - 1 : next >= entries.length ? 0 : next;
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === "ArrowDown" || (ctrl && event.key === "n")) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || (ctrl && event.key === "p")) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(entries[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const chooseScope = (prefix: string) => {
    setQuery((current) => (current.startsWith(prefix) ? current.slice(prefix.length) : prefix + text));
    setSelected(0);
    inputRef.current?.focus();
  };

  let lastGroup = "";

  return (
    <div className="pal-backdrop" onClick={() => setOpen(false)}>
      <div className="pal" onClick={(event) => event.stopPropagation()}>
        <div className="pal__query">
          <span className={`pal__prompt ${scope === "ask" ? "pal__prompt--ask" : ""}`}>
            {scope === "ask" ? "!" : "❯"}
          </span>
          <input
            ref={inputRef}
            className="pal__input"
            value={query}
            placeholder={PLACEHOLDER[scope]}
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="pal__list" ref={listRef}>
          {entries.length === 0 && (
            <p className="pal__empty">
              {emptyMessage(scope, text, base.some((entry) => entry.kind === "session"))}
            </p>
          )}
          {entries.map((entry, index) => {
            const header = grouped && entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {header && <div className="pal__group">{header}</div>}
                <CommandPaletteRow
                  entry={entry}
                  selected={index === selected}
                  onHover={() => setSelected(index)}
                  onRun={() => execute(entry)}
                />
              </div>
            );
          })}
        </div>
        <CommandPaletteFooter scope={scope} count={entries.length} onScope={chooseScope} />
      </div>
    </div>
  );
}
