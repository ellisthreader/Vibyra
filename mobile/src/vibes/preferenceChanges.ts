// Only an invalidation counter is shared. Preferences and memories stay on their account.
let revision = 0;
const listeners = new Set<() => void>();
export const preferenceRevision = () => revision;
export const subscribePreferenceChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function preferencesChanged() {
  revision++;
  listeners.forEach((listener) => listener());
}
