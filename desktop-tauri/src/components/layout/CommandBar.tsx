import { useWorkspaceStore } from "../../state/workspaceStore";
import { SearchIcon } from "../common/Icons";

/**
 * A visible surface for the palette that already exists.
 *
 * Ctrl K has always opened it; nothing in the window said so. This replaces the
 * Home / Project breadcrumb in the titlebar's centre — a two-level breadcrumb
 * for a two-level app, sitting directly above a strip of project tiles that
 * already showed which project was active.
 */
export function CommandBar() {
  const setPaletteOpen = useWorkspaceStore((state) => state.setPaletteOpen);

  return (
    <button
      type="button"
      className="cmdbar"
      title="Search projects, terminals and commands"
      onClick={() => setPaletteOpen(true)}
    >
      <SearchIcon size={13} />
      <span className="cmdbar__hint">Search or run a command</span>
      <kbd className="kbd cmdbar__kbd">Ctrl K</kbd>
    </button>
  );
}
