import { previewCue } from "../../lib/notificationSounds";
import { CUE_LABELS, CUE_ORDER } from "../../lib/soundCues";
import type {
  NotificationCategoryPrefs,
  NotificationChannel,
  SoundCueId,
} from "../../notificationTypes";
import { PlayIcon } from "../common/StatusIcons";
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

/**
 * One event: where it shows, what it sounds like, whether it is on. The
 * channel is a labelled choice rather than an icon, and the sound controls
 * only appear when sounds are on at all.
 */
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
      hint={locked ? `${descriptor.hint} Turn off Show notifications to silence these.` : descriptor.hint}
    >
      <div className="notif-cat">
        {descriptor.osCapable && on && (
          <select
            className="input input--sm"
            value={prefs.channel === "system" ? "system" : "app"}
            disabled={disabled}
            aria-label={`Where ${descriptor.label} shows`}
            onChange={(event) => onChange({ ...prefs, channel: event.target.value as NotificationChannel })}
          >
            <option value="app">In Vibyra</option>
            <option value="system">Also on desktop</option>
          </select>
        )}
        {soundEnabled && on && (
          <>
            <select
              className="input input--sm input--sound"
              value={prefs.cue}
              disabled={disabled}
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
              disabled={disabled || prefs.cue === "none"}
              onClick={() => previewCue(prefs.cue, volume)}
            >
              <PlayIcon size={13} />
            </button>
          </>
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
