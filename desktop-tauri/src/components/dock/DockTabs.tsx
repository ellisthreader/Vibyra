import { useRef } from "react";
import type { ComponentType, KeyboardEvent } from "react";

import type { DockTool } from "../../lib/dockLayout";
import { FolderIcon, GitBranchIcon, SparklesIcon } from "../common/Icons";
import { useReadyCount } from "../review/fleet/useFleet";
import { MonitorIcon } from "../common/StatusIcons";

/**
 * The dock's tool switch — and its open/close control.
 *
 * Pressing the tool that is already up closes the dock. That is what keeps the
 * titlebar at three buttons: the sizes live there, the tools live here, and
 * neither needs a fourth "hide the panel" glyph beside it.
 *
 * The segmented shape comes from `nav-segmented.css`, which the titlebar's
 * size control shares — before that sheet the two used different idioms while
 * sitting on the same row.
 */

const TOOLS: { id: DockTool; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "preview", label: "Preview", icon: MonitorIcon },
  { id: "ask", label: "Ask", icon: SparklesIcon },
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "review", label: "Review", icon: GitBranchIcon },
];

interface Props {
  tool: DockTool | null;
  onTool: (tool: DockTool | null) => void;
}

export function DockTabs({ tool, onTool }: Props) {
  const buttons = useRef<Partial<Record<DockTool, HTMLButtonElement | null>>>({});
  // How many safe-mode workspaces are finished and unread. Review is the one
  // tool whose contents change while you are not looking at it, so it is the
  // one tab that needs to say so — the count comes from the same `fleetRows`
  // the panel draws, never a second tally that could disagree with the list.
  const ready = useReadyCount();

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + TOOLS.length) % TOOLS.length;
    else if (event.key === "ArrowRight") next = (index + 1) % TOOLS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TOOLS.length - 1;
    else return;
    event.preventDefault();
    const id = TOOLS[next].id;
    onTool(id);
    requestAnimationFrame(() => buttons.current[id]?.focus());
  };

  return (
    <nav className="dock__tabs" role="tablist" aria-label="Dock tools">
      {TOOLS.map((entry, index) => {
        const Icon = entry.icon;
        const active = tool === entry.id;
        const badge = entry.id === "review" && ready > 0 ? ready : 0;
        return (
          <button
            key={entry.id}
            ref={(node) => {
              buttons.current[entry.id] = node;
            }}
            type="button"
            id={`dock-tab-${entry.id}`}
            role="tab"
            aria-selected={active}
            aria-controls="dock-panel"
            tabIndex={active || (tool === null && index === 0) ? 0 : -1}
            title={active ? `Hide ${entry.label}` : entry.label}
            aria-label={badge > 0 ? `${entry.label} — ${badge} ready` : undefined}
            className={`dock__tab ${active ? "dock__tab--active" : ""} ${badge > 0 ? "dock__tab--badged" : ""}`}
            onClick={() => onTool(active ? null : entry.id)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            <Icon size={13} />
            <span className="dock__tab-label">{entry.label}</span>
            {badge > 0 && (
              <span className="pill dock__tab-badge" aria-hidden="true">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
