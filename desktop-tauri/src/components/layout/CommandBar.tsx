import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { SearchIcon } from "../common/Icons";

/**
 * A visible surface for the palette that already exists.
 *
 * Ctrl K has always opened it; nothing in the window said so. This replaces the
 * Home / Project breadcrumb in the titlebar's centre — a two-level breadcrumb
 * for a two-level app, sitting directly above a strip of project tiles that
 * already showed which project was active.
 *
 * The count is the whole reason this is a bar and not an icon: when an agent
 * is blocked, the way in is the same key you were already going to press.
 */
export function CommandBar() {
  const setPaletteOpen = useWorkspaceStore((state) => state.setPaletteOpen);
  const waiting = useTerminalStore(
    (state) => state.panes.filter((pane) => state.activity[pane.id] === "attention").length,
  );

  return (
    <button
      type="button"
      className={`cmdbar ${waiting > 0 ? "cmdbar--attn" : ""}`}
      title="Search sessions, run a command, or send a message to an agent"
      onClick={() => setPaletteOpen(true)}
    >
      <SearchIcon size={13} />
      <span className="cmdbar__hint">
        {waiting > 0
          ? `${waiting} agent${waiting === 1 ? "" : "s"} waiting on you`
          : "Search or run a command"}
      </span>
      {waiting > 0 && <span className="adot adot--attention" />}
      <kbd className="kbd cmdbar__kbd">Ctrl K</kbd>
    </button>
  );
}
