import logoUrl from "../../assets/vibyra-cobalt.png";
import { useProjectStore } from "../../state/projectStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { AccountMenu } from "./AccountMenu";
import { CommandBar } from "./CommandBar";
import { DockSizeControl } from "./DockSizeControl";
import { ResizeHandles, WindowControls } from "./WindowChrome";

/**
 * Identity, then intent, then state.
 *
 * The row used to carry two readouts it would not let you press — a "N need
 * you" chip and a "N live" chip — above a wordmark whose subtitle counted the
 * same sessions a third time. All three are gone: attention lives on the
 * project tile, the terminal row, the bell and the toast, none of which claim
 * to be a control. Bug report and update check moved into the account menu.
 *
 * The project switcher is gone too. It was a second name for what the strip on
 * the left already shows as tiles, with Home as its own tile at the top — two
 * controls for one choice, on opposite sides of the same window.
 */
export function TitleBar() {
  const view = useProjectStore((state) => state.view);
  const inProject = view === "project";

  return (
    <>
      <header className="chrome" data-tauri-drag-region>
        <div className="chrome__brand" data-tauri-drag-region>
          <img className="chrome__logo" src={logoUrl} alt="" />
          <h1 className="chrome__word">Vibyra</h1>
        </div>

        <div className="chrome__drag" data-tauri-drag-region>
          <CommandBar />
        </div>

        <div className="chrome__right">
          {inProject && <DockSizeControl />}
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
