import { previewCue } from "../../lib/notificationSounds";
import { DEFAULT_NOTIFICATIONS } from "../../lib/notificationPrefs";
import type { NotificationPrefs } from "../../notificationTypes";
import { NotificationEventSettings } from "./NotificationEventSettings";
import { NotificationPermissionRow } from "./NotificationPermissionRow";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";
import { VolumeSlider } from "./VolumeSlider";

/**
 * Two groups: where Vibyra may say something, then which events are worth it.
 * The two "where" switches lead — in the window, and on the desktop — and the
 * sound follows them with its volume indented underneath. No heading on the
 * first group: the pane header already says Notifications, and a "SOUND"
 * heading over a row called "Play sounds" says the same word twice and costs a
 * 42px gap to do it.
 */
export function SettingsNotificationsPane({ settings, update }: SettingsPaneProps) {
  const prefs = settings.notifications ?? DEFAULT_NOTIFICATIONS;
  const off = !prefs.enabled;

  const write = (partial: Partial<NotificationPrefs>) =>
    void update({ notifications: { ...prefs, ...partial } });

  return (
    <>
      <SettingsBlock>
        <div className="settings-group">
          <SettingRow label="Show notifications" hint="Toasts in the corner, and history behind the bell.">
            <Switch checked={prefs.enabled} label="Show notifications" onChange={(enabled) => write({ enabled })} />
          </SettingRow>
          <NotificationPermissionRow
            disabled={off}
            enabled={prefs.osEnabled}
            onToggle={(osEnabled) => write({ osEnabled })}
          />
          <SettingRow dim={off} label="Play sounds">
            <Switch
              checked={prefs.soundEnabled}
              disabled={off}
              label="Play notification sounds"
              onChange={(soundEnabled) => write({ soundEnabled })}
            />
          </SettingRow>
          {prefs.soundEnabled && !off && (
            <SettingRow sub label="Volume">
              <VolumeSlider
                value={prefs.volume}
                onChange={(volume) => write({ volume })}
                onPreview={(volume) => previewCue("done", volume)}
              />
            </SettingRow>
          )}
        </div>
      </SettingsBlock>

      <NotificationEventSettings prefs={prefs} disabled={off} write={write} />
    </>
  );
}
