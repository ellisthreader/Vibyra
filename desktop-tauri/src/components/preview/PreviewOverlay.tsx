import type { PreviewStatus, PreviewTarget } from "../../previewTypes";

interface Props {
  inspecting: boolean;
  status: PreviewStatus;
  target: PreviewTarget | null;
  onRun: () => void;
  onRetryInspect: () => void;
}

export function PreviewOverlay({
  inspecting,
  status,
  target,
  onRun,
  onRetryInspect,
}: Props) {
  if (inspecting) {
    return (
      <div className="preview-overlay">
        <span className="preview-spinner" />
        <strong>Inspecting this project…</strong>
        <p>Looking for safe browser targets without starting anything.</p>
      </div>
    );
  }
  if (!target) {
    return (
      <div className="preview-overlay">
        <strong>Preview inspection failed</strong>
        <p>{status.error ?? "No project target is available."}</p>
        <button className="btn" onClick={onRetryInspect}>Inspect again</button>
      </div>
    );
  }
  if (!target.runnable) {
    return (
      <div className="preview-overlay">
        <strong>{target.name}</strong>
        <p>{target.reason}</p>
        <button className="btn" onClick={onRetryInspect}>Inspect again</button>
      </div>
    );
  }
  if (status.phase === "starting") {
    return (
      <div className="preview-overlay preview-overlay--starting">
        <span className="preview-spinner" />
        <strong>Starting {target.name}…</strong>
        <code>{status.command ?? target.command}</code>
        <div className="preview-start-logs">
          {status.logs.slice(-6).map((line, index) => (
            <span key={index + "-" + line}>{line}</span>
          ))}
        </div>
      </div>
    );
  }
  if (status.phase === "failed") {
    return (
      <div className="preview-overlay">
        <strong>Preview could not start</strong>
        <p>{status.error}</p>
        <code>{target.command}</code>
        <button className="btn btn--primary" onClick={onRun}>Try again</button>
      </div>
    );
  }
  return (
    <div className="preview-overlay">
      <span className="preview-overlay__mark">▶</span>
      <strong>{target.name}</strong>
      <p>Vibyra will run this detected browser target only after you approve it.</p>
      <code>{target.command}</code>
      <button className="btn btn--primary" onClick={onRun}>Run preview</button>
    </div>
  );
}
