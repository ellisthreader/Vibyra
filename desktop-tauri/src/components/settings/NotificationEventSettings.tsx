import { useId, useState } from "react";

import { DEFAULT_NOTIFICATIONS } from "../../lib/notificationPrefs";
import type { NotificationCategory, NotificationPrefs } from "../../notificationTypes";
import { CATEGORY_DESCRIPTORS } from "./notificationCategories";
import { NotificationCategoryRow } from "./NotificationCategoryRow";
import { BotIcon } from "../common/Icons";
import { Disclosure } from "./SettingsControls";
import { SettingsBlock, Switch } from "./SettingsShared";

/** The events people actually decide about, in the order they matter. */
const FREQUENT: NotificationCategory[] = ["agentAttention", "agentDone", "agentFailed", "aiSpend"];
const REST = CATEGORY_DESCRIPTORS.map((d) => d.id).filter((id) => !FREQUENT.includes(id));

/**
 * The four events worth a decision are on the page; the rest fold away. A page
 * that hid all nine behind one chevron left two thirds of the pane empty and
 * asked people to open a drawer to learn what Vibyra even tells them about.
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
  const [more, setMore] = useState(false);
  const idleId = useId();
  const setCategory = (id: NotificationCategory, next: NotificationPrefs["categories"][NotificationCategory]) =>
    write({ categories: { ...prefs.categories, [id]: next } });
  // Counts what is behind the fold, not the whole page: "9 of 10 on" over a
  // closed drawer holding six rows says the wrong thing about both numbers.
  const hidden = REST.length + 1;
  const hiddenOn = REST.filter(
    (id) => (prefs.categories[id] ?? DEFAULT_NOTIFICATIONS.categories[id]).channel !== "off",
  ).length + (prefs.agentIdleEnabled ? 1 : 0);

  // Silent pages drop the sound column entirely rather than leaving nine empty
  // slots behind; the grid is declared by the class, so it has to move with it.
  const grid = `settings-group notif-events${prefs.soundEnabled ? "" : " notif-events--silent"}`;
  const rows = (ids: NotificationCategory[]) =>
    ids.map((id) => {
      const descriptor = CATEGORY_DESCRIPTORS.find((d) => d.id === id);
      if (!descriptor) return null;
      return (
        <NotificationCategoryRow
          key={id}
          descriptor={descriptor}
          prefs={prefs.categories[id] ?? DEFAULT_NOTIFICATIONS.categories[id]}
          volume={prefs.volume}
          soundEnabled={prefs.soundEnabled}
          disabled={disabled}
          onChange={(next) => setCategory(id, next)}
        />
      );
    });

  return (
    <SettingsBlock label="Events" dim={disabled} note="The screen icon also sends that event to your desktop.">
      <div className={grid}>{rows(FREQUENT)}</div>
      <Disclosure
        title="More events"
        summary={`${hiddenOn} of ${hidden} on`}
        open={more}
        onToggle={setMore}
      >
        <div className={grid}>
          {rows(REST)}
          {/* Not a category — it is a plain boolean with no channel and no cue
              of its own — but it is an event, so it belongs in this list rather
              than in a second group whose labels start 34px to the left. */}
          <div role="group" aria-labelledby={idleId} className="notif-event">
            <span className="nmark nmark--info notif-event__mark" aria-hidden="true">
              <BotIcon size={13} />
            </span>
            <span className="notif-event__text">
              <span id={idleId} className="notif-event__label">Agent goes quiet</span>
              <span className="notif-event__hint">
                Some AI CLIs never exit. This reports a long run that has stopped producing output.
              </span>
            </span>
            <span className="notif-event__os-slot" aria-hidden="true" />
            {prefs.soundEnabled ? <span className="notif-event__cue-slot" aria-hidden="true" /> : null}
            <Switch
              checked={prefs.agentIdleEnabled}
              disabled={disabled}
              label="Tell me when an agent goes quiet"
              onChange={(agentIdleEnabled) => write({ agentIdleEnabled })}
            />
          </div>
        </div>
      </Disclosure>
    </SettingsBlock>
  );
}
