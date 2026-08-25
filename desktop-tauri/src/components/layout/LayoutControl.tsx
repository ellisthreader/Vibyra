import type { ReactElement } from "react";

import type { StageLayout } from "../../lib/stageLayout";
import { useWorkspaceStore } from "../../state/workspaceStore";

// Where Terminals / Preview used to live. Moving the choice into the titlebar
// is what let the 46px mode bar above the terminals go: it was the only thing
// on that row that a person actually pressed.

function TerminalsGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    </svg>
  );
}

function SplitGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M13 4.5v15" />
    </svg>
  );
}

function PreviewGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 8.6h18" />
    </svg>
  );
}

interface Choice {
  id: StageLayout;
  label: string;
  Glyph: () => ReactElement;
}

const CHOICES: Choice[] = [
  { id: "terminals", label: "Terminals", Glyph: TerminalsGlyph },
  { id: "split", label: "Split", Glyph: SplitGlyph },
  { id: "preview", label: "Preview", Glyph: PreviewGlyph },
];

export function LayoutControl() {
  const layout = useWorkspaceStore((state) => state.stageLayout);
  const setStageLayout = useWorkspaceStore((state) => state.setStageLayout);

  return (
    <div className="stage-layout" role="group" aria-label="Stage layout">
      {CHOICES.map(({ id, label, Glyph }) => (
        <button
          key={id}
          type="button"
          className={layout === id ? "stage-layout__on" : ""}
          aria-pressed={layout === id}
          aria-label={label}
          title={label}
          onClick={() => setStageLayout(id)}
        >
          <Glyph />
        </button>
      ))}
    </div>
  );
}
