import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const HANDLES: { className: string; direction: ResizeDirection }[] = [
  { className: "n", direction: "North" },
  { className: "s", direction: "South" },
  { className: "e", direction: "East" },
  { className: "w", direction: "West" },
  { className: "ne", direction: "NorthEast" },
  { className: "nw", direction: "NorthWest" },
  { className: "se", direction: "SouthEast" },
  { className: "sw", direction: "SouthWest" },
];

function MinimizeGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 8.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function WindowControls() {
  const appWindow = getCurrentWindow();
  return (
    <div className="window-controls">
      <button type="button" aria-label="Minimize" onClick={() => void appWindow.minimize()}>
        <MinimizeGlyph />
      </button>
      <button type="button" aria-label="Maximize" onClick={() => void appWindow.toggleMaximize()}>
        <MaximizeGlyph />
      </button>
      <button
        type="button"
        aria-label="Close"
        className="close"
        onClick={() => void appWindow.close()}
      >
        <CloseGlyph />
      </button>
    </div>
  );
}

export function ResizeHandles() {
  const appWindow = getCurrentWindow();
  return (
    <>
      {HANDLES.map(({ className, direction }) => (
        <div
          key={className}
          className={`resize-handle ${className}`}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void appWindow.startResizeDragging(direction);
          }}
        />
      ))}
    </>
  );
}
