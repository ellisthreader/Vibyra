import type { CloudChip } from "../../../lib/cloudOverviewTypes";
import { CloudShape } from "../CloudShape";
import { CloudPageArt } from "./CloudPageArt";

export function CloudPageHero({ sentence, detail, level, done, syncing, chip, busy, onAction }: {
  sentence: string; detail: string | null; level: number; done: boolean; syncing: boolean;
  chip: CloudChip | null; busy: boolean; onAction(action: "wake" | "stop"): void;
}) {
  const percent = syncing ? Math.min(99, Math.floor(level * 100)) : null;
  const stop = chip === "running" || chip === "starting";
  const action = stop ? "Stop" : chip === "error" ? "Try again" : chip === "asleep" ? "Start" : null;
  const coverage = Math.max(0, Math.min(100, (level * 106 - 16) / 30 * 100));
  return <section className="cloud-page__hero" data-panel="cloudStatus">
    <div className="cloud-page__stage" aria-hidden="true">
      <CloudPageArt />
      <div className="cloud-page__cloud">
        <CloudShape level={level} tick={done} glow={syncing ? 0.85 : done ? 0.85 : 0.3} />
        {percent !== null && !done && <div className="cloud-page__digits">
          <span>{percent}%</span><span className="cloud-page__digits-fill" style={{ clipPath: `inset(${100 - coverage}% 0 0)` }}>{percent}%</span>
        </div>}
      </div>
    </div>
    <div className="cloud-page__words" aria-live="polite" aria-atomic="true">
      <h2>{sentence}</h2>
      {detail && <p>{detail}</p>}
      {percent !== null && <span className="cloud-page__sr" role="progressbar" aria-label="Estimated sync progress"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} />}
    </div>
    {action && <button type="button" className="cloud-page__action" disabled={busy} aria-label={`${action} Vibyra Cloud`}
      onClick={() => onAction(stop ? "stop" : "wake")}>{busy ? "Working…" : action}</button>}
  </section>;
}
