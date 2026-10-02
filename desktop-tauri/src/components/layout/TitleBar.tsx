import { openNewProject } from '../../state/newProject';
import { WorkspaceActions } from './WorkspaceActions';
import { PlusIcon, SidebarIcon } from "../common/Icons";
import { vibyraLogoUrl as logoUrl } from "../../assets/vibyraLogo";
import { useProjectStore } from "../../state/projectStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { useProductMode } from "../../state/productModeStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { UpdateChip } from "./UpdateChip";
import { ResizeHandles, WindowControls } from "./WindowChrome";
import { useAccountStore } from "../../state/accountStore";
import { accountBillingPage } from "../../ipc/accountBilling";
import { allows, trialDaysLeft } from "../../lib/planLimits";

export function TitleBar() {
  const inProject = useProjectStore((s) => s.view === "project");
  const projectsSidebarOpen = useWorkspaceStore((s) => s.projectsSidebarOpen);
  const { mode, choose } = useProductMode();
  const profile = useAccountStore((s) => s.snapshot.profile);
  const agentsLocked = !allows(profile, "agents");
  const trialDays = trialDaysLeft(profile);
  return <>
    <header className="chrome" data-tauri-drag-region>
      <div className="chrome__brand" data-tauri-drag-region>
        {mode === 'work' && !projectsSidebarOpen && <button type="button" className="chrome__sidebar-toggle icon-btn" aria-label="Show projects sidebar" title="Show projects sidebar" onClick={() => useWorkspaceStore.getState().setProjectsSidebarOpen(true)}><SidebarIcon size={18} /></button>}
        <img className="chrome__logo" src={logoUrl} alt="" />
        <div className="chrome__copy"><h1>Vibyra</h1></div>
      </div>
      <div className="chrome__drag" data-tauri-drag-region>
        <div className="product-mode-switch">
          <div className="product-mode-tabs" role="tablist" aria-label="Workspace mode">
            {(['work', 'agent'] as const).map(value => <button key={value} role="tab" aria-selected={mode === value} onClick={() => choose(value)}>{value === 'work' ? 'Code' : 'Agents'}{value === 'agent' && agentsLocked && <span className="pro-mark" aria-label="Needs Vibyra Pro">Pro</span>}</button>)}
          </div>
        </div>
      </div>
      <div className="chrome__right">
        {mode === 'work' && <button type="button" className="icon-btn" aria-label="New project" title="New project" onClick={openNewProject}><PlusIcon size={17} /></button>}
        {trialDays !== null && <button type="button" className="trial-chip" title="Your free Pro trial. Get Pro to keep everything."
          onClick={() => void accountBillingPage("pro").catch(() => {})}>
          Pro trial · {trialDays === 0 ? "ends today" : `${trialDays} ${trialDays === 1 ? "day" : "days"} left`}
        </button>}
        <UpdateChip />
        {inProject && mode === 'work' && <WorkspaceActions />}<NotificationBellHost /><WindowControls />
      </div>
    </header>
    <ResizeHandles />
  </>;
}
