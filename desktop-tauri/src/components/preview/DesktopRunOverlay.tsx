import type { PreviewStatus, PreviewTarget } from "../../previewTypes";

interface Props {
  status: PreviewStatus;
  target: PreviewTarget;
  onRun: () => void;
}

/** A desktop app runs as its own window, not in this frame. */
export function DesktopRunOverlay({ status, target, onRun }: Props) {
  const lines = status.logs.slice(-6);
  if (status.phase === "starting") {
    const waiting = status.stage === "waiting_for_window";
    return (
      <div className="preview-overlay preview-overlay--starting">
        <span className="preview-spinner" />
        <strong>{waiting ? `Waiting for ${target.name} to open its window…` : `Building ${target.name}…`}</strong>
        <code>{status.command ?? target.command}</code>
        <details className="preview-start-logs"><summary>Build output</summary>
          {lines.map((line, index) => <span key={index + "-" + line}>{line}</span>)}
        </details>
      </div>
    );
  }
  if (status.phase === "running") {
    return (
      <div className="preview-overlay">
        <span className="preview-overlay__mark">▶</span>
        <strong>{target.name} is open</strong>
        <p>It runs in its own window on this computer. Your phone's Live preview shows that window.</p>
      </div>
    );
  }
  return (
    <div className="preview-overlay">
      <span className="preview-overlay__mark">▶</span>
      <strong>{target.name}</strong>
      <p>
        {status.phase === "failed" && status.error ? status.error + " " : ""}
        Runs as its own window on this computer, where your phone's Live preview can show it.
      </p>
      <code>{target.command}</code>
      <button className="btn btn--primary" onClick={onRun}>{status.phase === "failed" ? "Try again" : "Run app"}</button>
    </div>
  );
}
