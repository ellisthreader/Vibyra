import { computerName } from "../../lib/platform";
import {
  ACTIVITY_TICK_MS,
  activityTickMs,
  backgroundThrottleEnabled,
  leanChromeEnabled,
  normalizePerformanceMode,
  perfWatchEnabled,
  startupPrefetchEnabled,
  type PerformanceMode,
} from "../../lib/performanceMode";
import { SettingHint } from "./SettingHint";
import { Segmented, StatusChip } from "./SettingsControls";
import { SettingRow, type SettingsPaneProps } from "./SettingsShared";

const MODES: { id: PerformanceMode; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "balanced", label: "Balanced" },
  { id: "best", label: "Best performance" },
];

const LABELS = Object.fromEntries(MODES.map((mode) => [mode.id, mode.label])) as Record<PerformanceMode, string>;

/** What the chosen level costs or buys, never a restatement of its name. Only
 * Full points at the recommendation: someone who has gone past Balanced on
 * purpose does not need telling twice. */
const MODE_HINTS: Record<PerformanceMode, string> = {
  full:
    `The complete interface, with every animation and blur retained. Suited to a ${computerName} on mains power; Balanced is recommended.`,
  balanced:
    "Reduces background work without changing the interface. Output is deferred only while the window is hidden.",
  best:
    "Also disables decorative motion and blur, and reduces shadow depth. Suited to battery use, or to several terminals streaming at once.",
};

interface Effect {
  /** One short sentence that stands on its own: this is a summary read on
   * hover, not a manual. Anything needing a caveat belongs in the note. */
  title: string;
  /** This line's own gate, taken straight from `lib/performanceMode.ts` — not
   * a comparison against the level. Reading the real function is what stops
   * the summary claiming something the runtime is not doing. */
  active: (mode: PerformanceMode) => boolean;
}

/** In ladder order, so the summary reads from the cheapest change to the most
 * visible. Adding a line means adding a gate in `performanceMode.ts` first. */
const EFFECTS: Effect[] = [
  {
    active: backgroundThrottleEnabled,
    title: "Output is deferred while the window is hidden.",
  },
  {
    active: (mode) => !startupPrefetchEnabled(mode),
    title: "Nothing is preloaded in advance.",
  },
  {
    active: leanChromeEnabled,
    title: "Decorative motion is disabled.",
  },
  {
    active: leanChromeEnabled,
    title: "Background blur is disabled and shadow depth reduced.",
  },
  {
    active: (mode) => !perfWatchEnabled(mode),
    title: "The performance watchdog is stopped.",
  },
  {
    active: (mode) => activityTickMs(mode) > ACTIVITY_TICK_MS,
    title: "Terminal activity is polled at half the rate.",
  },
];

/**
 * Performance as three levels rather than a switch. What the selected level
 * does sits behind the "?" beside the label, summarised for that level alone
 * rather than as a table the reader has to find their row in.
 */
export function PerformanceRow({ settings, update }: SettingsPaneProps) {
  const mode = normalizePerformanceMode(settings.performanceMode);
  const active = EFFECTS.filter((effect) => effect.active(mode));
  return (
    <div className="settings-group">
      <SettingRow
        label={
          <span className="setting-label">
            Performance
            {mode === "balanced" ? <StatusChip tone="accent">Recommended</StatusChip> : null}
            <SettingHint label={`What ${LABELS[mode]} does`}>
              <p className="setting-hint__title">
                <span>{LABELS[mode]}</span>
                <StatusChip tone={active.length > 0 ? "on" : "off"}>
                  {active.length > 0 ? `${active.length} changes` : "No changes"}
                </StatusChip>
              </p>
              {active.length > 0 ? (
                <ul className="setting-hint__list">
                  {active.map((effect) => (
                    <li key={effect.title}>
                      <span>{effect.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="setting-hint__note">
                  Nothing is held back. Every animation, blur and background check runs as designed.
                </p>
              )}
            </SettingHint>
          </span>
        }
        hint={MODE_HINTS[mode]}
      >
        <Segmented
          label="Performance"
          value={mode}
          options={MODES}
          onChange={(performanceMode) => void update({ performanceMode })}
        />
      </SettingRow>
    </div>
  );
}
