import { useEffect } from "react";

import { setTerminalVisibility } from "../ipc/terminal";
import { useAgentModeStore } from "../state/agentModeStore";
import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { applyProjectVisibility, syncFocusVisibility } from "./projectTransitions";
import { terminalsOnScreen } from "./terminalPresence";

/**
 * Keeps the native flush rate pointed at whichever pane has the keyboard.
 *
 * Every delivery costs the renderer a full xterm write and a canvas repaint,
 * so the rate is a budget shared by the whole grid rather than something each
 * pane can be given. The focused pane takes the 16 ms tick because its echo is
 * the only latency a person can feel; the rest are paced, which looks the same
 * for streaming output and is what keeps the focused pane inside a frame.
 *
 * Runs off the project effect deliberately: focus changes on every click, and
 * reasserting the whole grid that often would spend a round trip per pane.
 *
 * Silent while the grid is off screen: leaving Code Mode is a demotion the
 * project effect owns, and handing the 16 ms tick back to a pane nobody can
 * see would undo it on the next click.
 */
export function useFocusVisibility(): void {
  const focusedId = useTerminalStore((state) => state.focusedId);
  const activeId = useProjectStore((state) => state.activeId);
  const mode = useAgentModeStore((state) => state.mode);
  const size = useWorkspaceStore((state) => state.dockSize);
  const dockOpen = useWorkspaceStore((state) => state.dockTool !== null);

  useEffect(() => {
    if (!activeId || !terminalsOnScreen(mode, size, dockOpen)) return;
    let current = true;
    void syncFocusVisibility(
      useTerminalStore.getState().panes,
      activeId,
      focusedId,
      setTerminalVisibility,
    ).then((applied) => {
      if (!current || applied.size === 0) return;
      useTerminalStore.setState((state) => ({
        panes: applyProjectVisibility(state.panes, applied),
      }));
    });
    return () => {
      current = false;
    };
  }, [focusedId, activeId, mode, size, dockOpen]);
}
