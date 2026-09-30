import { previewRecovery } from "../../lib/previewUrl";
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
        <p>Finding a preview for this working folder.</p>
      </div>
    );
  }
  if (!target) {
    return (
      <div className="preview-overlay">
        <strong>No preview available</strong>
        <p>{status.error ?? "Start your app in a terminal, then paste its URL above."}</p>
        <button className="btn" onClick={onRetryInspect}>Inspect again</button>
      </div>
    );
  }
  if (!target.runnable) {
    return (
      <div className="preview-overlay">
        <strong>{target.name}</strong>
        <p>{target.reason}</p>
        <p>Start it in your terminal and paste its URL above, or check for a web app and inspect again.</p>
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
        <details className="preview-start-logs"><summary>Startup details</summary>
          {status.logs.slice(-6).map((line, index) => (
            <span key={index + "-" + line}>{line}</span>
          ))}
        </details>
      </div>
    );
  }
  if (status.phase === "failed") {
    return (
      <div className="preview-overlay">
        <strong>Preview could not start</strong>
        <p>{status.error}</p>
        <p>{previewRecovery(status.error, status.logs)}</p>
        <details className="preview-error-details"><summary>Startup details</summary>
          <code>{status.command ?? target.command}</code>
          <pre>{status.logs.join("\n") || status.error || "No startup output was received."}</pre>
        </details>
        <button className="btn btn--primary" onClick={onRun}>Try again</button>
        <button className="btn" onClick={onRetryInspect}>Inspect again</button>
      </div>
    );
  }
  return (
    <div className="preview-overlay">
      <span className="preview-overlay__mark">▶</span>
      <strong>{target.name}</strong>
      <p>{target.framework === "Expo web" ? "Preview the web version of your Expo app. For the native app, use Expo Go on your phone or an iPhone Simulator." : "Start this project to see your changes live."}</p>
      <code>{target.command}</code>
      <button className="btn btn--primary" onClick={onRun}>Run preview</button>
    </div>
  );
}
