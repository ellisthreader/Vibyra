import { useEffect, useRef } from "react";

import logoUrl from "../../assets/vibyra-cobalt.png";
import {
  startupUpdateCopy,
  type StartupUpdatePhase,
} from "../../lib/startupUpdatePolicy";
import type { UpdateProgress } from "../../lib/updatePolicy";
import "../../styles/startup-update.css";
import { ResizeHandles, WindowControls } from "../layout/WindowChrome";

export interface StartupUpdateScreenProps {
  phase: StartupUpdatePhase;
  version: string;
  progress: UpdateProgress;
  error: string | null;
  onRetry: () => void;
  onContinue: () => void;
}

export function StartupUpdateScreen({
  phase,
  version,
  progress,
  error,
  onRetry,
  onContinue,
}: StartupUpdateScreenProps) {
  const retryRef = useRef<HTMLButtonElement>(null);
  const copy = startupUpdateCopy(phase, version, progress, error);

  useEffect(() => {
    if (phase === "failed") retryRef.current?.focus();
  }, [phase]);

  const progressAttributes = copy.progressValue === null
    ? {}
    : {
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": copy.progressValue,
        "aria-valuetext": `${copy.progressValue}%`,
      };

  return (
    <div className={`startup-update startup-update--${phase}`} data-startup-update-phase={phase}>
      <header className="startup-update__bar" data-tauri-drag-region>
        <WindowControls />
      </header>

      <main className="startup-update__viewport">
        <section
          className="startup-update__panel"
          aria-labelledby="startup-update-title"
        >
          <div className="startup-update__mark" aria-hidden="true">
            <span />
            <img src={logoUrl} alt="" draggable={false} />
          </div>

          <div className="startup-update__copy">
            <h1
              id="startup-update-title"
              aria-live="polite"
              aria-atomic="true"
            >
              {copy.title}
            </h1>
            <p id="startup-update-detail">{copy.detail}</p>
          </div>

          {copy.progressMode !== "hidden" && (
            <div
              className={`startup-update__progress startup-update__progress--${copy.progressMode}`}
              role="progressbar"
              aria-label={copy.progressLabel}
              {...progressAttributes}
            >
              <span
                style={copy.progressValue === null
                  ? undefined
                  : { transform: `scaleX(${copy.progressValue / 100})` }}
              />
            </div>
          )}

          {phase === "failed" && (
            <div className="startup-update__actions">
              <button
                ref={retryRef}
                type="button"
                className="startup-update__button startup-update__button--primary"
                onClick={onRetry}
                aria-describedby="startup-update-detail"
                data-auto-focus
              >
                Try again
              </button>
              <button
                type="button"
                className="startup-update__button startup-update__button--secondary"
                onClick={onContinue}
              >
                Open Vibyra
              </button>
            </div>
          )}
        </section>
      </main>

      <ResizeHandles />
    </div>
  );
}
