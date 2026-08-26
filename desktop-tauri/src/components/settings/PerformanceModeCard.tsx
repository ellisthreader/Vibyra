import type { PerformanceMode } from "../../types";
import { SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

// Reuses the graphics-mode picker classes: same shape of decision (stacked
// choices, each with its trade-off spelled out), same pane, same look. The
// choices are the card — wrapping them in a `.settings-group` as well drew a
// border around a stack of bordered buttons.

const MODES: { id: PerformanceMode; label: string; hint: string }[] = [
  {
    id: "standard",
    label: "Standard",
    hint: "Everything on — animation, notifications and sounds, the full visual finish.",
  },
  {
    id: "max",
    label: "Maximum performance",
    hint:
      "Strips everything nonessential: no animation, no notifications or sounds, no sign-in video, flat visuals, " +
      "and terminals idle for 10 minutes hibernate on their own (never the one you're in — click to wake, output intact). " +
      "Nothing is lost — switching back to Standard restores it all.",
  },
];

/**
 * The pane's headline decision. One switch that temporarily disables every
 * nonessential at once, instead of asking the user to know which of a dozen
 * levers costs what. The individual settings underneath are left untouched so
 * Standard hands back exactly the configuration the user had.
 */
export function PerformanceModeCard({ settings, update }: SettingsPaneProps) {
  return (
    <SettingsBlock label="Performance mode">
      <p className="settings-lead settings-lead--foot">
        How much Vibyra runs beyond the terminals.{" "}
        {settings.performanceMode === "max"
          ? "Maximum performance is on: notifications are silenced and decorative rendering is off."
          : "Standard keeps the full experience on."}
      </p>
      <div className="graphics-modes" role="radiogroup" aria-label="Performance mode">
        {MODES.map((option) => (
          <button
            key={option.id}
            role="radio"
            aria-checked={settings.performanceMode === option.id}
            className={`graphics-mode ${settings.performanceMode === option.id ? "graphics-mode--active" : ""}`}
            onClick={() => void update({ performanceMode: option.id })}
          >
            <span className="graphics-mode__label">{option.label}</span>
            <span className="graphics-mode__hint">{option.hint}</span>
          </button>
        ))}
      </div>
    </SettingsBlock>
  );
}
