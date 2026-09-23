import { openNewProject } from '../../state/newProject';
import { WorkspaceActions } from './WorkspaceActions';
import { PlusIcon } from "../common/Icons";
import { vibyraLogoUrl as logoUrl } from "../../assets/vibyraLogo";
import { useProjectStore } from "../../state/projectStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { LifebuoyIcon } from "../report/ReportIcons";
import { useReportStore } from "../../state/reportStore";
import { useProductMode } from "../../state/productModeStore";
import { UpdateChip } from "./UpdateChip";
import { ResizeHandles, WindowControls } from "./WindowChrome";

export function TitleBar({ onReplayWelcome }: { onReplayWelcome: () => void }) {
  const inProject = useProjectStore((s) => s.view === "project");
  const { mode, choose } = useProductMode();
  return <>
    <header className="chrome" data-tauri-drag-region>
      <div className="chrome__brand" data-tauri-drag-region>
        <img className="chrome__logo" src={logoUrl} alt="" />
        <div className="chrome__copy"><h1>Vibyra</h1></div>
      </div>
      <div className="chrome__drag" data-tauri-drag-region>
        <div className="product-mode-switch">
          <div className="product-mode-tabs" role="tablist" aria-label="Workspace mode">
            {(['work', 'agent'] as const).map(value => <button key={value} role="tab" aria-selected={mode === value} onClick={() => choose(value)}>{value === 'work' ? 'Code' : 'Agents'}</button>)}
          </div>
          {/* Temporary control for reviewing the first-login introduction. */}
          <button type="button" title="Replay the welcome introduction" onClick={event => {
            event.currentTarget.focus();
            onReplayWelcome();
          }}>Test intro</button>
        </div>
      </div>
      <div className="chrome__right">
        {mode === 'work' && <button type="button" className="icon-btn" aria-label="New project" title="New project" onClick={openNewProject}><PlusIcon size={17} /></button>}
        <UpdateChip />
        {inProject && mode === 'work' && <WorkspaceActions />}
        <button type="button" className="icon-btn chrome__report" aria-label="Report a bug" title="Report a bug" onClick={() => void useReportStore.getState().begin()}><LifebuoyIcon size={16} /></button>
        <NotificationBellHost /><WindowControls />
      </div>
    </header>
    <ResizeHandles />
  </>;
}
