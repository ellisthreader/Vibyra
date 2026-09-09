import logoUrl from "../../assets/vibyra-cobalt.png";
import { useProjectStore } from "../../state/projectStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { AccountMenu } from "./AccountMenu";
import { CommandBar } from "./CommandBar";
import { DockSizeControl } from "./DockSizeControl";
import { ResizeHandles, WindowControls } from "./WindowChrome";

export function TitleBar() {
  const inProject = useProjectStore((s) => s.view === "project");
  return <>
    <header className="chrome" data-tauri-drag-region>
      <div className="chrome__brand" data-tauri-drag-region>
        <img className="chrome__logo" src={logoUrl} alt="" />
        <div className="chrome__copy"><h1>Vibyra</h1></div>
      </div>
      <div className="chrome__drag" data-tauri-drag-region><CommandBar /></div>
      <div className="chrome__right">
        {inProject && <><DockSizeControl /><span className="chrome__sep" aria-hidden="true" /></>}
        <NotificationBellHost /><AccountMenu /><WindowControls />
      </div>
    </header>
    <ResizeHandles />
  </>;
}
