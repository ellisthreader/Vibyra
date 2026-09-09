import { useEffect, useRef, useState } from "react";
import { BotIcon } from "../common/Icons";
import { LaunchSettingsPanel } from "../rail/LaunchSettings";
import { terminalGridLayout, type GridLayout } from "../../lib/gridLayout";
import { measuredCellSize } from "../../lib/terminalRegistry";
import { useProjectStore } from "../../state/projectStore";
import { useProjects, useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { TerminalPaneCard } from "./TerminalPaneCard";

function EmptyState({ projectName }: { projectName: string }) {
  return (
    <div className="grid-empty">
      <span className="workspace-launcher__icon"><BotIcon size={28} /></span>
      <h2>Start something in {projectName}</h2>
      <p>Choose a model and open your first terminal.</p>
      <div className="workspace-launcher"><LaunchSettingsPanel /></div>
      <span className="workspace-launcher__hint">Your project, chats and layout stay together.</span>
    </div>
  );
}

/**
 * Cell size at the configured font, normalised off whatever a live pane is
 * rendering at. Kept once per font, because the layout may answer a measured
 * cell by changing the font that produced it: re-reading it every pass lets a
 * rounding difference flip a close layout back and forth between renders.
 */
const cells = new Map<string, { width: number; height: number }>();

function baseCell(fontSize: number, family: string): { width: number; height: number } {
  const key = `${fontSize}/${family}`;
  const cached = cells.get(key);
  if (cached) return cached;
  const measured = measuredCellSize();
  if (!measured) return { width: fontSize * 0.6, height: fontSize * 1.33 };
  const ratio = fontSize / measured.fontSize;
  const cell = { width: measured.width * ratio, height: measured.height * ratio };
  cells.set(key, cell);
  return cell;
}

function gridStyle(layout: GridLayout): React.CSSProperties {
  return {
    gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
    gridAutoRows: `minmax(${Math.round(layout.minPaneHeight)}px, 1fr)`,
  } as React.CSSProperties;
}

export function TerminalStage() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const allPanes = useTerminalStore((state) => state.panes);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const fontSize = useSettingsStore((state) => state.settings?.fontSize ?? 13);
  const fontFamily = useSettingsStore((state) => state.settings?.fontFamily ?? "");
  const project = projects.find((entry) => entry.id === activeId);
  const panes = allPanes.filter((pane) => pane.projectId === activeId);
  const zoomed = zoomedId === null ? undefined : panes.find((pane) => pane.id === zoomedId);
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A zoomed pane is the whole stage, so it lays out as a single comfortable
  // one — the grid behind it keeps its own metrics for when zoom is dropped.
  const cell = baseCell(fontSize, fontFamily);
  const layout = terminalGridLayout(zoomed ? 1 : panes.length, {
    width: box.width,
    height: box.height,
    cellWidth: cell.width,
    cellHeight: cell.height,
    fontSize,
  });

  return (
    <div ref={host} className="workspace__body terminal-stage">
      {panes.length === 0 ? (
        <EmptyState projectName={project?.name ?? "This project"} />
      ) : (
        <div
          className={`grid grid--${layout.density}${layout.scrolls ? " grid--scrolls" : ""}`}
          style={gridStyle(layout)}
        >
          {panes.map((pane) => (
            <TerminalPaneCard
              key={pane.id}
              pane={pane}
              hidden={zoomed !== undefined && pane.id !== zoomed.id}
              fontSize={layout.fontSize}
              density={layout.density}
            />
          ))}
        </div>
      )}
    </div>
  );
}
