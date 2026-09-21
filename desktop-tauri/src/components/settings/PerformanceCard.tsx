import { useState } from "react";

import { Disclosure } from "./SettingsControls";
import { SettingRow, Switch, type SettingsPaneProps } from "./SettingsShared";

/** What the switch does, in the user's terms. Each line names something the
 * app stops doing, so the mode is inspectable rather than a magic word — and
 * the list is the same set of behaviours `lib/performanceMode.ts` gates. */
const EFFECTS: { title: string; detail: string }[] = [
  {
    title: "No decorative motion.",
    detail: "Panels, menus and status dots settle instantly. Spinners and progress bars still move; those are telling you something.",
  },
  {
    title: "No background blur or layered shadow.",
    detail: "Blurred surfaces become solid and deep shadows go tight; the most expensive thing the window draws.",
  },
  {
    title: "No performance watchdog.",
    detail: "The once-a-second slowness check stops, so the app can go properly idle between keystrokes.",
  },
  {
    title: "Less background bookkeeping.",
    detail: "Terminal activity is polled at half the rate and nothing is preloaded that you have not opened.",
  },
  {
    title: "Drawing waits while the window is off screen.",
    detail: "Minimise Vibyra and your agents keep running at full speed; output catches up the instant you return.",
  },
];

/**
 * Performance mode as one row, with what it changes behind a disclosure.
 * Terminals, output, saved sessions, notifications and every agent feature
 * keep working; this only removes work the app does to look good.
 */
export function PerformanceRow({ settings, update }: SettingsPaneProps) {
  const on = settings.performanceMode;
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-group">
      <SettingRow
        label="Performance mode"
        hint="Strips the interface down to what the work needs. Best on battery or with many terminals streaming. Applies straight away."
      >
        <Switch checked={on} label="Performance mode" onChange={(performanceMode) => void update({ performanceMode })} />
      </SettingRow>
      <Disclosure title="What it changes" open={open} onToggle={setOpen}>
        <ul className="perf-effects perf-effects--inset">
          {EFFECTS.map((effect) => (
            <li key={effect.title} className="perf-effect">
              <span className="perf-effect__mark" aria-hidden="true">&bull;</span>
              <span><strong>{effect.title}</strong> {effect.detail}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}
