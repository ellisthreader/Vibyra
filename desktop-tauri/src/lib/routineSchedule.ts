import type { Schedule } from "../agentTypes";

// The sentence under the routine form.
//
// It has to say the same thing the native `Schedule::describe` does, because
// the user checks this one and the scheduler obeys that one. Kept as a
// deliberate mirror rather than fetched: the form has to stay readable while
// the fields are being changed, and a round trip per keystroke to render a
// preview would be a round trip per keystroke.
//
// `tests/routineSchedule.test.mjs` pins the two to each other.

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function describeSchedule(schedule: Schedule, timezone: string): string {
  const zone = timezone ? ` (${timezone})` : "";
  if (schedule.kind === "every") {
    return `Runs ${everyPhrase(schedule.minutes).toLowerCase()}, from whenever you save it.`;
  }
  if (schedule.kind === "daily") {
    return `Runs every day at ${clock(schedule.minuteOfDay)}${zone}.`;
  }
  if (schedule.days.length === 0) return "Choose at least one day.";
  return `Runs ${dayPhrase(schedule.days)} at ${clock(schedule.minuteOfDay)}${zone}.`;
}

function everyPhrase(minutes: number): string {
  if (minutes % 60 !== 0) return `Every ${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "Every hour" : `Every ${hours} hours`;
}

function dayPhrase(days: readonly number[]): string {
  const ordered = [...new Set(days)].sort((left, right) => left - right);
  if (ordered.join() === "0,1,2,3,4") return "on weekdays";
  if (ordered.join() === "5,6") return "at weekends";
  return `on ${ordered.map((day) => DAY_NAMES[day % 7]).join(", ")}`;
}

function clock(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
