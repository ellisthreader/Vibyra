import { useEffect } from "react";

import { useNotificationStore } from "../state/notificationStore";
import { useUpdateStore } from "../state/updateStore";
import { updateNotification, updateSignature, type UpdateState } from "./updateNotifications.ts";

// The impure half of the updater's notifications: subscribes to the update
// store and pushes when the state actually changes. Kept out of `updateStore`
// so that store stays a plain model of the Tauri plugin, and out of
// `notificationStore`, which may not import other stores at all.

let lastSignature = "";

function announce(state: UpdateState): void {
  const signature = updateSignature(state);
  if (signature === lastSignature) return;
  lastSignature = signature;
  const notice = updateNotification(state);
  if (notice) useNotificationStore.getState().push(notice);
}

/**
 * Turns updater states into notifications for as long as the workspace is up.
 *
 * The first check runs eight seconds after launch, so subscribing on mount is
 * early enough to catch every transition — including the `available` that
 * arrives before the user has touched anything.
 */
export function useUpdateNotifications(): void {
  useEffect(() => useUpdateStore.subscribe(announce), []);
}
