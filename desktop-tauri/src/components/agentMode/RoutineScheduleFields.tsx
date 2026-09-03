import type { Schedule } from "../../agentTypes";

/**
 * The three shapes a schedule can take, and the day picker one of them needs.
 *
 * Split out of the editor because it is the only part that changes shape as
 * you use it: choosing "on chosen days" grows a row of buttons, choosing an
 * interval replaces the time field entirely, and mixing that with the rest of
 * the form made one file that was hard to read in either state.
 */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

export function RoutineScheduleFields({
  kind,
  onKind,
  time,
  onTime,
  minutes,
  onMinutes,
  days,
  onDays,
  timezone,
  onTimezone,
  zones,
}: {
  kind: Schedule["kind"];
  onKind: (kind: Schedule["kind"]) => void;
  time: string;
  onTime: (time: string) => void;
  minutes: number;
  onMinutes: (minutes: number) => void;
  days: number[];
  onDays: (days: number[]) => void;
  timezone: string;
  onTimezone: (zone: string) => void;
  zones: string[];
}) {
  return (
    <>
      <div className="routine-editor__schedule">
        <label className="field">
          <span>Repeats</span>
          <select className="input" value={kind} onChange={(event) => onKind(event.target.value as Schedule["kind"])}>
            <option value="daily">Every day</option>
            <option value="weekdays">On chosen days</option>
            <option value="every">On an interval</option>
          </select>
        </label>

        {kind === "every" ? (
          <label className="field">
            <span>Every</span>
            <select className="input" value={minutes} onChange={(event) => onMinutes(Number(event.target.value))}>
              {INTERVALS.map((value) => (
                <option key={value} value={value}>
                  {value < 60 ? `${value} minutes` : `${value / 60} hour${value === 60 ? "" : "s"}`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>At</span>
            <input className="input" type="time" value={time} onChange={(event) => onTime(event.target.value)} />
          </label>
        )}

        {/* An interval is not civil time, so it has no timezone to get wrong. */}
        {kind !== "every" && (
          <label className="field">
            <span>Timezone</span>
            <select className="input" value={timezone} onChange={(event) => onTimezone(event.target.value)}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {kind === "weekdays" && (
        <div className="routine-editor__days">
          {DAYS.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={days.includes(index)}
              className={days.includes(index) ? "is-on" : ""}
              onClick={() =>
                onDays(
                  days.includes(index)
                    ? days.filter((day) => day !== index)
                    : [...days, index].sort((left, right) => left - right),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
