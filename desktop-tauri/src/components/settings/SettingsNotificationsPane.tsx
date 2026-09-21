import { previewCue } from "../../lib/notificationSounds";
import { DEFAULT_NOTIFICATIONS } from "../../lib/notificationPrefs";
import type { NotificationPrefs } from "../../notificationTypes";
import { NotificationEventSettings } from "./NotificationEventSettings";
import { NotificationPermissionRow } from "./NotificationPermissionRow";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";
import { VolumeSteps } from "./VolumeSteps";

/**
 * Three decisions up front: show them, play sounds, send them to the desktop.
 * Everything per event is behind one disclosure so the page reads as three
 * choices, not twenty controls.
 */
export function SettingsNotificationsPane({ settings, update }: SettingsPaneProps) {
  const prefs = settings.notifications ?? DEFAULT_NOTIFICATIONS;
  const off = !prefs.enabled;

  const write = (partial: Partial<NotificationPrefs>) =>
    void update({ notifications: { ...prefs, ...partial } });

  return (
    <>
      <SettingsBlock label="Notifications">
        <div className="settings-group">
          <SettingRow label="Show notifications" hint="Toasts in the corner and a history behind the bell in the title bar.">
            <Switch checked={prefs.enabled} label="Show notifications" onChange={(enabled) => write({ enabled })} />
          </SettingRow>
          <SettingRow label="Play sounds" hint={prefs.soundEnabled && !off ? "Cues are deliberately quiet; this sets how quiet." : undefined}>
            {prefs.soundEnabled && !off && (
              <VolumeSteps
                value={prefs.volume}
                onChange={(volume) => {
                  write({ volume });
                  previewCue("done", volume);
                }}
              />
            )}
            <Switch checked={prefs.soundEnabled} disabled={off} label="Play notification sounds" onChange={(soundEnabled) => write({ soundEnabled })} />
          </SettingRow>
          <NotificationPermissionRow disabled={off} enabled={prefs.osEnabled} onToggle={(osEnabled) => write({ osEnabled })} />
          {prefs.osEnabled && !off && (
            <SettingRow
              label="Only when Vibyra is in the background"
              hint="Off shows a desktop notification even while you are looking at Vibyra."
            >
              <Switch
                checked={prefs.osOnlyWhenAway}
                label="Only notify the desktop when Vibyra is in the background"
                onChange={(osOnlyWhenAway) => write({ osOnlyWhenAway })}
              />
            </SettingRow>
          )}
        </div>
      </SettingsBlock>

      <NotificationEventSettings prefs={prefs} disabled={off} write={write} />
    </>
  );
}
