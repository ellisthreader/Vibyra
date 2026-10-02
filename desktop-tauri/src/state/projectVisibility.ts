import { setTerminalVisibility } from "../ipc/terminal";
import { useTerminalStore } from "./terminalStore";

/** Rust throttles hidden terminals; tell it which project is on stage. */
export function orchestrateVisibility(activeId: string | null): void {
  const { panes } = useTerminalStore.getState();
  for (const pane of panes) {
    if (pane.status !== "running" || pane.visibility === "hibernated") continue;
    const target = pane.projectId === activeId ? "visible" : "hidden";
    if (pane.visibility !== target) {
      void setTerminalVisibility(pane.id, target).catch(() => {});
    }
  }
  useTerminalStore.setState((state) => ({
    zoomedId: null,
    panes: state.panes.map((p) =>
      p.status !== "running" || p.visibility === "hibernated"
        ? p
        : { ...p, visibility: p.projectId === activeId ? "visible" : "hidden" },
    ),
  }));
}
