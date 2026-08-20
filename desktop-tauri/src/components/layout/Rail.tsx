import { useProjectStore } from "../../state/projectStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { GearIcon, PlusIcon } from "../common/Icons";
import { LaunchSettingsPanel } from "../rail/LaunchSettings";
import { SessionList } from "../rail/SessionList";

export function Rail() {
  const activeId = useProjectStore((s) => s.activeId);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openAgentPicker = useWorkspaceStore((s) => s.openAgentPicker);
  const hasSessions = useTerminalStore((s) => s.panes.some((pane) => pane.projectId === activeId));

  return (
    <aside className="rail">
      <div className="rail__scroll">
        {hasSessions && (
          <div className="rail__section rail__sessions">
            <div className="rail__section-head">
              <span className="section-label">Terminals</span>
              <div className="rail__section-actions">
                <button className="icon-btn" title="New terminal" onClick={openAgentPicker}>
                  <PlusIcon size={13} />
                </button>
              </div>
            </div>
            <SessionList />
          </div>
        )}
        {!hasSessions && (
          <div className="rail__section">
            <div className="rail__section-head">
              <span className="section-label">New terminal</span>
            </div>
            <LaunchSettingsPanel />
          </div>
        )}
      </div>
      <div className="rail__footer">
        <button className="rail__settings" onClick={openSettings}>
          <GearIcon size={15} /> Settings
        </button>
      </div>
    </aside>
  );
}
