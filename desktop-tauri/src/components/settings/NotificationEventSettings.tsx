import { useState } from "react";

import { DEFAULT_NOTIFICATIONS } from "../../lib/notificationPrefs";
import type { NotificationCategory, NotificationPrefs } from "../../notificationTypes";
import { CATEGORY_DESCRIPTORS } from "./notificationCategories";
import { NotificationCategoryRow } from "./NotificationCategoryRow";
import { Disclosure } from "./SettingsControls";
import { SettingRow, Switch } from "./SettingsShared";

/** The events people actually decide about, first. */
const FREQUENT: NotificationCategory[] = ["agentAttention", "agentDone", "agentFailed", "aiSpend"];

/**
 * Per-event choices behind one disclosure, frequent events first and the rest
 * under a second fold. The page above stays three rows long.
 */
export function NotificationEventSettings({
  prefs,
  disabled,
  write,
}: {
  prefs: NotificationPrefs;
  disabled: boolean;
  write: (partial: Partial<NotificationPrefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const setCategory = (id: NotificationCategory, next: NotificationPrefs["categories"][NotificationCategory]) =>
    write({ categories: { ...prefs.categories, [id]: next } });
  const on = CATEGORY_DESCRIPTORS.filter((d) => (prefs.categories[d.id] ?? DEFAULT_NOTIFICATIONS.categories[d.id]).channel !== "off").length;
  const rows = (ids: NotificationCategory[]) =>
    CATEGORY_DESCRIPTORS.filter((d) => ids.includes(d.id)).map((descriptor) => (
      <NotificationCategoryRow
        key={descriptor.id}
        descriptor={descriptor}
        prefs={prefs.categories[descriptor.id] ?? DEFAULT_NOTIFICATIONS.categories[descriptor.id]}
        volume={prefs.volume}
        soundEnabled={prefs.soundEnabled}
        disabled={disabled}
        onChange={(next) => setCategory(descriptor.id, next)}
      />
    ));
  const rest = CATEGORY_DESCRIPTORS.map((d) => d.id).filter((id) => !FREQUENT.includes(id));

  return (
    <Disclosure title="Customize notifications" summary={`${on} of ${CATEGORY_DESCRIPTORS.length} events on`} open={open} onToggle={setOpen}>
      <div className="settings-group">
        {rows(FREQUENT)}
        <SettingRow
          label="Agent goes quiet"
          hint="Some AI CLIs never exit. This reports a long run that has stopped producing output."
        >
          <Switch
            checked={prefs.agentIdleEnabled}
            disabled={disabled}
            label="Tell me when an agent goes quiet"
            onChange={(agentIdleEnabled) => write({ agentIdleEnabled })}
          />
        </SettingRow>
      </div>
      <Disclosure title="More events" summary="Preview, Performance, New models, Updates, App problems" open={more} onToggle={setMore}>
        <div className="settings-group">{rows(rest)}</div>
      </Disclosure>
    </Disclosure>
  );
}
