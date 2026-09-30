import { flushSettings, useSettingsStore } from "../../state/settingsStore";

/** Saving · Saved · Could not save, in the page header. Idle renders nothing:
 * the state only speaks when there is something to say. */
export function SettingsSaveState() {
  const state = useSettingsStore((s) => s.saveState);
  const error = useSettingsStore((s) => s.saveError);
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <span className="save-state save-state--error" role="alert">
        <i aria-hidden="true" />
        {error || "Could not save"}
        <button type="button" className="save-state__retry" onClick={() => void flushSettings().catch(() => {})}>
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className={`save-state save-state--${state}`} role="status" aria-live="polite">
      <i aria-hidden="true" />
      {state === "saving" ? "Saving" : "Saved"}
    </span>
  );
}
