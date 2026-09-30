import { useId, useRef } from "react";

import type { NotificationCategoryPrefs, NotificationChannel } from "../../notificationTypes";
import { categoryMark } from "../notifications/notificationMarks";
import { MonitorIcon } from "../common/StatusIcons";
import type { CategoryDescriptor } from "./notificationCategories";
import { SoundCuePicker } from "./SoundCuePicker";
import { Switch } from "./SettingsShared";

interface Props {
  descriptor: CategoryDescriptor;
  prefs: NotificationCategoryPrefs;
  volume: number;
  soundEnabled: boolean;
  disabled: boolean;
  onChange: (next: NotificationCategoryPrefs) => void;
}



/**
 * One event: what it is, whether it may also leave the window, what it sounds
 * like, whether it happens at all. The controls sit in fixed grid columns so
 * the switches line up down the page even on the rows that cannot reach the
 * desktop — the reserved slot is the alignment, not decoration.
 *
 * The mark is the same glyph and severity the event actually arrives with, so
 * this list doubles as a legend for the bell.
 */
export function NotificationCategoryRow({
  descriptor,
  prefs,
  volume,
  soundEnabled,
  disabled,
  onChange,
}: Props) {
  const id = useId();
  const on = prefs.channel !== "off";
  const locked = descriptor.locked === true;
  const { Icon } = categoryMark(descriptor.id);
  const toDesktop = prefs.channel === "system";

  // Turning an event off and on again must not quietly re-open it to the
  // desktop. The old row always came back as "system"; now that where an event
  // shows is a one-click toggle, silently undoing that choice is worse.
  const lastOn = useRef<NotificationChannel>(descriptor.osCapable ? "system" : "app");
  if (on) lastOn.current = prefs.channel;

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      /* The locked row's only explanation of why its switch is dead lives in
         the hint, so the hint has to be part of the group's description. */
      aria-describedby={descriptor.hint ? `${id}-hint` : undefined}
      className="notif-event"
    >
      <span className={`nmark nmark--${descriptor.tone} notif-event__mark`} aria-hidden="true">
        <Icon size={13} />
      </span>
      <span className="notif-event__text">
        <span id={`${id}-label`} className="notif-event__label">{descriptor.label}</span>
        {descriptor.hint ? (
          <span id={`${id}-hint`} className="notif-event__hint">
            {locked ? `${descriptor.hint} Turn off Show notifications to silence these.` : descriptor.hint}
          </span>
        ) : null}
      </span>

      {descriptor.osCapable ? (
        <button
          type="button"
          className="notif-event__os"
          aria-pressed={toDesktop}
          aria-label={`Also show ${descriptor.label} on the desktop`}
          title="Also show on the desktop"
          disabled={disabled || !on}
          onClick={() => onChange({ ...prefs, channel: toDesktop ? "app" : "system" })}
        >
          <MonitorIcon size={13} />
        </button>
      ) : (
        <span className="notif-event__os-slot" aria-hidden="true" />
      )}

      {soundEnabled ? (
        on ? (
          <SoundCuePicker
            value={prefs.cue}
            volume={volume}
            label={descriptor.label}
            disabled={disabled}
            onChange={(cue) => onChange({ ...prefs, cue })}
          />
        ) : (
          <span className="notif-event__cue-slot" aria-hidden="true" />
        )
      ) : null}

      <Switch
        checked={on}
        disabled={disabled || locked}
        label={descriptor.label}
        onChange={(next) => onChange({ ...prefs, channel: next ? lastOn.current : "off" })}
      />
    </div>
  );
}
