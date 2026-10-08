import { fileUri, shellQuotePath } from "../../lib/terminalDrop";
import { useScreenshotStore } from "../../state/screenshotStore";
import { CloseIcon } from "../common/Icons";

function CopyIcon({ done }: { done: boolean }) {
  return done ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
  );
}

export function ScreenshotTray() {
  const shots = useScreenshotStore((s) => s.shots);
  const copiedPath = useScreenshotStore((s) => s.copiedPath);
  const copySaved = useScreenshotStore((s) => s.copySaved);
  const dismiss = useScreenshotStore((s) => s.dismiss);
  const reveal = useScreenshotStore((s) => s.reveal);

  if (shots.length === 0) return null;

  return (
    <div className="shot-tray" aria-label="Screenshots">
      {shots.map((shot) => (
        <div key={shot.path} className="shot-card">
          <button
            className="shot-card__open"
            title={`Show in folder — ${shot.path}`}
            onClick={() => void reveal(shot)}
          >
            <img
              className="shot-card__thumb"
              src={shot.thumbDataUrl}
              alt={`Saved screenshot ${shot.width} by ${shot.height}`}
              draggable
              onDragStart={(event) => {
                // uri-list is what a terminal drop reads; the quoted path
                // behind it is what everything else pastes.
                event.dataTransfer.setData("text/uri-list", fileUri(shot.path));
                event.dataTransfer.setData("text/plain", shellQuotePath(shot.path));
                event.dataTransfer.effectAllowed = "copy";
              }}
            />
          </button>
          <div className="shot-card__actions">
            <button className={`icon-btn shot-card__copy ${copiedPath === shot.path ? "shot-card__copy--done" : ""}`} title="Copy screenshot" onClick={() => void copySaved(shot)}>
              <CopyIcon done={copiedPath === shot.path} />
            </button>
            <button
              className="icon-btn"
              title="Dismiss (file stays on disk)"
              onClick={() => dismiss(shot.path)}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
