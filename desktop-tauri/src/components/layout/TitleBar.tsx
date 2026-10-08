import { WorkspaceActions } from './WorkspaceActions';
import { SidebarIcon, PlusIcon } from "../common/Icons";
import { useProjectStore } from "../../state/projectStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { useProductMode } from "../../state/productModeStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { UpdateChip } from "./UpdateChip";
import { ResizeHandles, WindowControls } from "./WindowChrome";
import { useAccountStore } from "../../state/accountStore";
import { accountBillingPage } from "../../ipc/accountBilling";
import { allows, trialDaysLeft } from "../../lib/planLimits";
import { TitleAccount } from "./TitleAccount";
import { TitleTrail } from "./TitleTrail";

/** The title bar over the main column: where you are on the left, the
 * Code/Agents pill in the centre, and the actions for this page on the right. */
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
      </div>
      <div className="chrome__drag" data-tauri-drag-region>
        <TitleTrail />
        <div className="product-mode-switch">
          <div className="product-mode-tabs" role="tablist" aria-label="Workspace mode" data-mode={mode}>
            <span className="product-mode-indicator" aria-hidden="true" />
            {(['work', 'agent'] as const).map(value => <button key={value} role="tab" aria-selected={mode === value} onClick={() => choose(value)}>{value === 'work' ? 'Code' : 'Agents'}{value === 'agent' && agentsLocked && <span className="pro-mark" aria-label="Needs Vibyra Pro">Pro</span>}</button>)}
          </div>
        </div>
      </div>
      <div className="chrome__right">
        {mode === 'work' && inProject && <button type="button" className="btn chrome__new-terminal" onClick={() => useWorkspaceStore.getState().openAgentPicker()}><PlusIcon size={14} />New terminal</button>}
        {trialDays !== null && <button type="button" className="trial-chip" title="Your free Pro trial. Get Pro to keep everything."
          onClick={() => void accountBillingPage("pro").catch(() => {})}>
          Pro trial · {trialDays === 0 ? "ends today" : `${trialDays} ${trialDays === 1 ? "day" : "days"} left`}
        </button>}
        <UpdateChip />
        {inProject && mode === 'work' && <WorkspaceActions />}<NotificationBellHost /><TitleAccount /><WindowControls />
      </div>
    </header>
    <ResizeHandles />
  </>;
}
