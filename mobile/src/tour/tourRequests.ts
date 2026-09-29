/**
 * "Show walkthrough" asks from wherever it is shown — Settings → Help or Advanced —
 * without threading a route through the sheet. The one tour host on screen
 * listens; with none mounted, a request is simply dropped.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function requestTour() {
  listeners.forEach((listener) => listener());
}
export function onTourRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let finishedWelcome = false;
/** Called as the welcome flow completes: that, and only that, makes this session a first run. */
export function noteWelcomeFinished() {
  finishedWelcome = true;
}
export const welcomeFinished = () => finishedWelcome;

/** The device flag that remembers an account has seen (or skipped) the tour. */
export const tourSeenKey = (email: string) => `tour-seen.${encodeURIComponent(email.toLowerCase())}`;

/**
 * Whether to open the tour by itself. Only for someone who has just come through
 * the welcome screens in this session — a new account, or a new phone — and never
 * for a returning person who updated the app. The sample workspace is a demo,
 * not a first run.
 */
export function shouldOfferTour(state: {
  cameThroughWelcome: boolean;
  complete: boolean;
  signedIn: boolean;
  demo: boolean;
  seen: boolean;
}) {
  return state.cameThroughWelcome && state.complete && state.signedIn && !state.demo && !state.seen;
}
