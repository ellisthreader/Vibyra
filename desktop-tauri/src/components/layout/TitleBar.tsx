import logoUrl from "../../assets/vibyra-cobalt.png";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import { NotificationBellHost } from "../notifications/NotificationBellHost";
import { LifebuoyIcon } from "../report/ReportIcons";
import { useReportStore } from "../../state/reportStore";
import { AccountMenu } from "./AccountMenu";
import { ResizeHandles, WindowControls } from "./WindowChrome";

export function TitleBar() {
  const panes = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const setFocus = useTerminalStore((s) => s.setFocus);
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const goHome = useProjectStore((s) => s.goHome);
  const projects = useProjects();
  const beginReport = useReportStore((s) => s.begin);

  const live = panes.filter((p) => p.status === "running" && p.visibility !== "hibernated").length;
  const waiting = panes.filter((p) => activity[p.id] === "attention");
  const project = projects.find((p) => p.id === activeId);
  const status =
    panes.length === 0
      ? "Native workspace"
      : `${panes.length} terminal${panes.length === 1 ? "" : "s"} · ${live} live`;

  const jumpToWaiting = () => {
    const pane = waiting[0];
    if (!pane) return;
    void useProjectStore
      .getState()
      .activate(pane.projectId)
      .then(() => setFocus(pane.id));
  };

  return (
    <>
      <header className="chrome" data-tauri-drag-region>
        <div className="chrome__brand" data-tauri-drag-region>
          <img className="chrome__logo" src={logoUrl} alt="" />
          <div className="chrome__copy">
            <h1>Vibyra</h1>
            <p>{status}</p>
          </div>
        </div>
        <div className="chrome__drag" data-tauri-drag-region>
          <span className="chrome__crumb">
            <button className="chrome__crumb-btn" onClick={goHome}>
              Home
            </button>
            {view === "project" && project && (
              <>
                <span className="chrome__crumb-sep">/</span>
                <b>{project.name}</b>
              </>
            )}
          </span>
        </div>
        <div className="chrome__right">
          {waiting.length > 0 && (
            <button
              className="chip chrome__attn"
              title={waiting.map((p) => paneLabel(p)).join(", ")}
              onClick={jumpToWaiting}
            >
              <span className="adot adot--attention" />
              {waiting.length === 1 ? "1 needs you" : `${waiting.length} need you`}
            </button>
          )}
          {live > 0 && (
            <span className="chip chrome__stats">
              <span className="dot" />
              {live} live
            </span>
          )}
          <button
            className="icon-btn chrome__report"
            title="Report a bug"
            aria-label="Report a bug"
            onClick={() => void beginReport()}
          >
            <LifebuoyIcon size={15} />
          </button>
          <NotificationBellHost />
          <AccountMenu />
          <WindowControls />
        </div>
      </header>
      <ResizeHandles />
    </>
  );
}
