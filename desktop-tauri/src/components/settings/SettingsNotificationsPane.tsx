import { previewCue } from "../../lib/notificationSounds";
import { DEFAULT_NOTIFICATIONS } from "../../lib/notificationPrefs";
import type { NotificationCategory, NotificationPrefs } from "../../notificationTypes";
import { CATEGORY_DESCRIPTORS } from "./notificationCategories";
import { NotificationCategoryRow } from "./NotificationCategoryRow";
import { NotificationPermissionRow } from "./NotificationPermissionRow";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";
import { VolumeSteps } from "./VolumeSteps";

export function SettingsNotificationsPane({ settings, update }: SettingsPaneProps) {
  const prefs = settings.notifications ?? DEFAULT_NOTIFICATIONS;
  const off = !prefs.enabled;

  const write = (partial: Partial<NotificationPrefs>) =>
    void update({ notifications: { ...prefs, ...partial } });

  const setCategory = (id: NotificationCategory, next: NotificationPrefs["categories"][NotificationCategory]) =>
    write({ categories: { ...prefs.categories, [id]: next } });

  return (
    <>
      <SettingsBlock label="Notifications">
        <div className="settings-group">
          <SettingRow
            label="Show notifications"
            hint="Toasts in the corner, and a history behind the bell in the title bar."
          >
            <Switch
              checked={prefs.enabled}
              label="Show notifications"
              onChange={(enabled) => write({ enabled })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <SettingsBlock label="Sound">
        <div className="settings-group">
          <SettingRow label="Play sounds" hint="A short, distinct cue for each kind of event.">
            <Switch
              checked={prefs.soundEnabled}
              disabled={off}
              label="Play notification sounds"
              onChange={(soundEnabled) => write({ soundEnabled })}
            />
          </SettingRow>
          <SettingRow label="Volume" hint="Cues are deliberately quiet; this sets how quiet.">
            <VolumeSteps
              value={prefs.volume}
              disabled={off || !prefs.soundEnabled}
              onChange={(volume) => {
                write({ volume });
                previewCue("done", volume);
              }}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <SettingsBlock label="Desktop">
        <div className="settings-group">
          <NotificationPermissionRow disabled={off} />
          <SettingRow
            label="Only when Vibyra is in the background"
            hint="With this off, a desktop notification appears even while you are looking at Vibyra."
          >
            <Switch
              checked={prefs.osOnlyWhenAway}
              disabled={off || !prefs.osEnabled}
              label="Only notify the desktop when Vibyra is in the background"
              onChange={(osOnlyWhenAway) => write({ osOnlyWhenAway })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <SettingsBlock label="What to tell me about">
        <div className="settings-group">
          {CATEGORY_DESCRIPTORS.map((descriptor) => (
            <NotificationCategoryRow
              key={descriptor.id}
              descriptor={descriptor}
              prefs={prefs.categories[descriptor.id] ?? DEFAULT_NOTIFICATIONS.categories[descriptor.id]}
              volume={prefs.volume}
              soundEnabled={prefs.soundEnabled}
              disabled={off}
              onChange={(next) => setCategory(descriptor.id, next)}
            />
          ))}
          <SettingRow
            label="Tell me when an agent goes quiet"
            hint="Some AI CLIs never exit. This reports a long run that has stopped producing output."
          >
            <Switch
              checked={prefs.agentIdleEnabled}
              disabled={off}
              label="Tell me when an agent goes quiet"
              onChange={(agentIdleEnabled) => write({ agentIdleEnabled })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>
    </>
  );
}
