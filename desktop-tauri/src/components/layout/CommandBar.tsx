import { keyLabel } from "../../lib/platform";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { SearchIcon } from "../common/Icons";

/** The same central command entry as Linux, with the platform's shortcut. */
export function CommandBar() {
  const waiting = useTerminalStore((s) => s.panes.filter((p) => p.status === "running" && s.activity[p.id] === "attention").length);
  return (
    <button className="cmdbar" title="Search projects, terminals and commands"
      onClick={() => useWorkspaceStore.getState().setPaletteOpen(true)}>
      <SearchIcon size={15} />
      <span>{waiting ? `${waiting} ${waiting === 1 ? "agent needs" : "agents need"} your attention` : "Search or run a command"}</span>
      <kbd>{keyLabel("Mod+K")}</kbd>
    </button>
  );
}
