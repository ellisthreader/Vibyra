// When the updater is allowed to ask the feed. Pure, so the "live" claim is a
// test rather than a stopwatch.
//
// "Live" here means: the app notices a release within minutes of it going up,
// and immediately on the events that mean the machine just rejoined the world —
// waking from sleep, regaining network, coming back to the foreground. A laptop
// that was shut all weekend must not wait out a fresh interval before it looks.

export type WatchTrigger =
  | "start"
  | "interval"
  /** The window regained focus, or the webview became visible again. */
  | "wake"
  /** The OS reported the network came back. */
  | "online";

/** Five minutes. The feed answers 204 with an empty body in the common case, so
 * a day of idling costs roughly 290 requests and a few kilobytes — cheap enough
 * to be worth the responsiveness, and well inside the backend's 60/min throttle. */
export const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** The workspace mount races terminal spawn and session restore; letting those
 * settle first keeps the first check off the startup critical path. */
export const FIRST_CHECK_DELAY_MS = 8_000;

/**
 * Floor between event-driven checks. Focus, visibility and `online` all fire
 * together when a lid opens on a different network, and a Mac switching Wi-Fi
 * can emit `online` repeatedly — without this, one wake would be a burst.
 */
export const MIN_EVENT_GAP_MS = 60_000;

/**
 * `lastCheckAt` of 0 means the feed has not been asked at all yet — the first
 * eight seconds of a launch — and a wake inside that window is let through
 * rather than measured against an epoch that never happened. Every attempt
 * stamps it, including a failed one, so this cannot be used to bypass the gap
 * on a dead network.
 */
export function shouldCheck(
  trigger: WatchTrigger,
  lastCheckAt: number,
  now: number,
): boolean {
  if (trigger === "start" || trigger === "interval") return true;
  if (lastCheckAt <= 0) return true;
  return now - lastCheckAt >= MIN_EVENT_GAP_MS;
}
