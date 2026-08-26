import type { ReactElement } from "react";

import type { DockSize } from "../../lib/dockLayout";
import { useWorkspaceStore } from "../../state/workspaceStore";

// Where Terminals / Split / Preview used to live. The three buttons mean the
// same thing they always did — how much of the workspace the right-hand
// surface gets — they just no longer decide *which* surface that is. Choosing
// a size opens the dock if it was shut; the tab strip inside it is what closes
// it again, which is why this row is still three glyphs and not four.

function CompactGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M16.5 4.5v15" />
    </svg>
  );
}

function WideGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M12 4.5v15" />
    </svg>
  );
}

function FullGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="currentColor" fillOpacity="0.24" />
    </svg>
  );
}

interface Choice {
  id: DockSize;
  label: string;
  Glyph: () => ReactElement;
}

const CHOICES: Choice[] = [
  { id: "compact", label: "Compact dock", Glyph: CompactGlyph },
  { id: "wide", label: "Wide dock", Glyph: WideGlyph },
  { id: "full", label: "Full dock", Glyph: FullGlyph },
];

export function DockSizeControl() {
  const size = useWorkspaceStore((state) => state.dockSize);
  const open = useWorkspaceStore((state) => state.dockTool !== null);
  const setDockSize = useWorkspaceStore((state) => state.setDockSize);

  return (
    <div className="dock-size" role="group" aria-label="Dock size">
      {CHOICES.map(({ id, label, Glyph }) => {
        const on = open && size === id;
        return (
          <button
            key={id}
            type="button"
            className={on ? "dock-size__on" : ""}
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => setDockSize(id)}
          >
            <Glyph />
          </button>
        );
      })}
    </div>
  );
}
