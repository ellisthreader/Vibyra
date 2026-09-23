import { useSyncExternalStore } from "react";

// Keyed off `document.hidden`, never focus, for the same reason as
// `useBackgroundThrottle.ts`: a window beside the editor is still being read.
const subscribe = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const snapshot = () => !document.hidden;

/**
 * False while the window is minimised or otherwise hidden. Background polls
 * include it in their effect dependencies, so they stop while nobody can see
 * the result and refresh the moment the window is shown again.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
