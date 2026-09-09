import { useWorkspaceStore } from "../../state/workspaceStore";
import type { CompanionSize } from "../../lib/companionPreferences";

const SIZES: { id: CompanionSize; label: string; edge: number }[] = [
  { id: "compact", label: "Open compact tools panel", edge: 15 },
  { id: "wide", label: "Open wide tools panel", edge: 10 },
  { id: "full", label: "Open full tools panel", edge: 4 },
];

export function DockSizeControl() {
  const open = useWorkspaceStore((s) => s.companionOpen);
  const size = useWorkspaceStore((s) => s.companionSize);
  const mode = useWorkspaceStore((s) => s.projectMode);
  return <div className="dock-sizes" role="group" aria-label="Tools panel size">
    {SIZES.map((entry) => {
      const active = open && mode === "terminals" && size === entry.id;
      const label = active ? "Close tools panel" : entry.label;
      return <button key={entry.id} className={`icon-btn ${active ? "icon-btn--active" : ""}`}
        aria-label={label} title={label} aria-pressed={active} onClick={() => {
          const store = useWorkspaceStore.getState();
          if (active) store.toggleCompanion();
          else { store.setProjectMode("terminals"); store.setCompanionSize(entry.id); }
        }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d={`M${entry.edge} 5v14`} /><rect x={entry.edge + 1} y="6" width={19-entry.edge} height="12" rx="1" fill="currentColor" stroke="none" opacity=".22" />
        </svg>
      </button>;
    })}
  </div>;
}
