import { previewCue } from "../../lib/notificationSounds";
import { CUE_LABELS, CUE_ORDER } from "../../lib/soundCues";
import type {
  NotificationCategoryPrefs,
  NotificationChannel,
  SoundCueId,
} from "../../notificationTypes";
import { MonitorIcon, PlayIcon } from "../common/StatusIcons";
import type { CategoryDescriptor } from "./notificationCategories";
import { SettingRow, Switch } from "./SettingsShared";

interface Props {
  descriptor: CategoryDescriptor;
  prefs: NotificationCategoryPrefs;
  volume: number;
  soundEnabled: boolean;
  disabled: boolean;
  onChange: (next: NotificationCategoryPrefs) => void;
}

function nextChannel(on: boolean, osCapable: boolean): NotificationChannel {
  if (!on) return "off";
  return osCapable ? "system" : "app";
}

export function NotificationCategoryRow({
  descriptor,
  prefs,
  volume,
  soundEnabled,
  disabled,
  onChange,
}: Props) {
  const on = prefs.channel !== "off";
  const locked = descriptor.locked === true;

  return (
    <SettingRow
      label={descriptor.label}
      hint={
        locked
          ? `${descriptor.hint} Turn off Notifications above to silence these.`
          : descriptor.hint
      }
    >
      <div className="notif-cat">
        <select
          className="input input--sm input--sound"
          value={prefs.cue}
          disabled={disabled || !on}
          aria-label={`${descriptor.label} sound`}
          onChange={(event) => onChange({ ...prefs, cue: event.target.value as SoundCueId })}
        >
          {CUE_ORDER.map((cue) => (
            <option key={cue} value={cue}>{CUE_LABELS[cue]}</option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          title="Play this sound"
          aria-label={`Play the ${descriptor.label} sound`}
          disabled={disabled || !on || !soundEnabled || prefs.cue === "none"}
          onClick={() => previewCue(prefs.cue, volume)}
        >
          <PlayIcon size={13} />
        </button>
        {descriptor.osCapable && (
          // An icon toggle rather than a second pill: two identical switches in
          // one row give the eye nothing to tell them apart.
          <button
            type="button"
            className="icon-btn notif-cat__os"
            aria-pressed={prefs.channel === "system"}
            aria-label={`Also show ${descriptor.label} on the desktop`}
            title="Also show on the desktop when Vibyra is in the background"
            disabled={disabled || !on}
            onClick={() =>
              onChange({ ...prefs, channel: prefs.channel === "system" ? "app" : "system" })
            }
          >
            <MonitorIcon size={14} />
          </button>
        )}
        <Switch
          checked={on}
          disabled={disabled || locked}
          label={descriptor.label}
          onChange={(next) => onChange({ ...prefs, channel: nextChannel(next, descriptor.osCapable) })}
        />
      </div>
    </SettingRow>
  );
}
