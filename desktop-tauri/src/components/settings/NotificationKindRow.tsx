import { previewCue } from "../../lib/notificationSounds";
import { CUE_LABELS, CUE_ORDER } from "../../lib/soundCues";
import type {
  NotificationChannel,
  NotificationKindPrefs,
  SoundCueId,
} from "../../notificationTypes";
import { MonitorIcon, PlayIcon } from "../common/StatusIcons";
import { kindMark } from "../notifications/notificationMarks";
import type { KindDescriptor } from "./notificationKinds";
import { SettingRow, Switch } from "./SettingsShared";

interface Props {
  descriptor: KindDescriptor;
  prefs: NotificationKindPrefs;
  volume: number;
  soundEnabled: boolean;
  disabled: boolean;
  onChange: (next: NotificationKindPrefs) => void;
}

function nextChannel(on: boolean, osCapable: boolean): NotificationChannel {
  if (!on) return "off";
  return osCapable ? "system" : "app";
}

export function NotificationKindRow({
  descriptor,
  prefs,
  volume,
  soundEnabled,
  disabled,
  onChange,
}: Props) {
  const on = prefs.channel !== "off";
  const locked = descriptor.locked === true;
  const kind = kindMark(descriptor.id);

  return (
    <SettingRow
      // The same glyph the card carries, so a row and the notices it governs
      // are recognisably the same thing.
      icon={<kind.Icon size={14} />}
      label={descriptor.label}
      hint={
        locked
          ? `${descriptor.hint} Turn off Notifications above to silence these.`
          : descriptor.hint
      }
    >
      <div className="notif-kind">
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
            className="icon-btn notif-kind__os"
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
