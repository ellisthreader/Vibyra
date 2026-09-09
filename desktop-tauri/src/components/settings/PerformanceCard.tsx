import type { SettingsPaneProps } from "./SettingsShared";

/** What the switch does, in the user's terms. Each line names something the
 * app stops doing, so the mode is inspectable rather than a magic word — and
 * the list is the same set of behaviours `lib/performanceMode.ts` gates. */
const EFFECTS: { title: string; detail: string }[] = [
  {
    title: "No decorative motion",
    detail: "Panels, menus and the status dots settle instantly instead of easing, so nothing is redrawn while you read it. Spinners and progress bars still move — those are telling you something.",
  },
  {
    title: "No background blur or layered shadow",
    detail: "Blurred surfaces become solid and deep shadows go tight — the most expensive thing the window draws.",
  },
  {
    title: "No performance watchdog",
    detail: "The once-a-second check that looks for slowness stops, which lets the app go properly idle between keystrokes.",
  },
  {
    title: "Less background bookkeeping",
    detail: "Terminal activity is polled at half the rate, and nothing is preloaded at launch that you have not opened yet.",
  },
  {
    title: "Output slows while the window is off screen",
    detail: "Minimise Vibyra and your agents keep running at full speed — only the drawing waits. It catches up the instant you come back.",
  },
];

/**
 * Performance mode. Terminals, output, saved sessions, notifications and every
 * agent feature keep working exactly as they do now — this only removes work
 * the app does to look good rather than to run.
 */
export function PerformanceCard({ settings, update }: SettingsPaneProps) {
  const on = settings.performanceMode;

  return (
    <div className="settings-group">
      <div className={`perf-mode ${on ? "perf-mode--on" : ""}`}>
        <div className="perf-mode__text">
          <span className="perf-mode__title">
            Performance mode
            {on ? <span className="perf-mode__state">On</span> : null}
          </span>
          <span className="perf-mode__blurb">
            Strips the interface down to what the work needs. Best on laptops,
            on battery, or with many terminals streaming at once. Applies
            straight away — no restart.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Performance mode"
          className={`btn ${on ? "btn--primary" : ""}`}
          onClick={() => void update({ performanceMode: !on })}
        >
          {on ? "On" : "Off"}
        </button>
      </div>
      <ul className="perf-effects">
        {EFFECTS.map((effect) => (
          <li key={effect.title} className="perf-effect">
            <span className="perf-effect__mark" aria-hidden="true">
              &bull;
            </span>
            <span>
              <strong>{effect.title}.</strong> {effect.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
