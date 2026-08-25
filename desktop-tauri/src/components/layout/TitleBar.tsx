import logoUrl from "../../assets/vibyra-cobalt.png";
import { terminalsVisible } from "../../lib/stageLayout";
import { useProjectStore } from "../../state/projectStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { AccountMenu } from "./AccountMenu";
import { CommandBar } from "./CommandBar";
import { LayoutControl } from "./LayoutControl";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ResizeHandles, WindowControls } from "./WindowChrome";

function SidePanelGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M15 4v16" />
    </svg>
  );
}

/**
 * Identity, then intent, then state.
 *
 * The row used to carry two readouts it would not let you press — a "N need
 * you" chip and a "N live" chip — above a wordmark whose subtitle counted the
 * same sessions a third time. All three are gone: attention lives on the
 * project tile, the terminal row, the bell and the toast, none of which claim
 * to be a control. Bug report and update check moved into the account menu.
 */
export function TitleBar() {
  const view = useProjectStore((state) => state.view);
  const layout = useWorkspaceStore((state) => state.stageLayout);
  const companionOpen = useWorkspaceStore((state) => state.companionOpen);
  const inProject = view === "project";
  const sidePanelLabel = companionOpen ? "Hide side panel" : "Show side panel";

  return (
    <>
      <header className="chrome" data-tauri-drag-region>
        <div className="chrome__brand" data-tauri-drag-region>
          <img className="chrome__logo" src={logoUrl} alt="" />
          <h1 className="chrome__word">Vibyra</h1>
          <ProjectSwitcher />
        </div>

        <div className="chrome__drag" data-tauri-drag-region>
          <CommandBar />
        </div>

        <div className="chrome__right">
          {inProject && <LayoutControl />}
          {inProject && terminalsVisible(layout) && (
            <button
              type="button"
              className={`icon-btn ${companionOpen ? "icon-btn--active" : ""}`}
              title={sidePanelLabel}
              aria-label={sidePanelLabel}
              aria-pressed={companionOpen}
              onClick={() => useWorkspaceStore.getState().toggleCompanion()}
            >
              <SidePanelGlyph />
            </button>
          )}
          {inProject && <span className="chrome__sep" aria-hidden="true" />}
          <NotificationBellHost />
          <AccountMenu />
          <WindowControls />
        </div>
      </header>
      <ResizeHandles />
    </>
  );
}
