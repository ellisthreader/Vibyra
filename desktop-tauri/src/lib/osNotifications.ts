import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type { NotificationItem } from "../notificationTypes";

// The operating-system half of the notification system. Deliberately thin: on
// Linux this hands off to the D-Bus notification daemon, which offers no action
// buttons and no click callback, and on Windows toasts only appear for an
// installed build and are swallowed silently by Focus Assist. So an OS
// notification is a nudge, never a UI — every actionable affordance lives in
// the app — and "no error" must never be read as "the user saw it".

export type OsPermission = "unknown" | "granted" | "denied";

let cached: OsPermission = "unknown";

export function osPermission(): OsPermission {
  return cached;
}

/** Reads the current grant without prompting, so Settings can render a state. */
export async function refreshOsPermission(): Promise<OsPermission> {
  try {
    cached = (await isPermissionGranted()) ? "granted" : "unknown";
  } catch {
    cached = "denied";
  }
  return cached;
}

/**
 * Prompts if needed. Called from the Settings button and lazily on the first
 * escalation — never at startup, where a prompt before the user has seen a
 * single notification is just a dark pattern.
 */
export async function ensureOsPermission(): Promise<boolean> {
  if (cached === "granted") return true;
  try {
    if (await isPermissionGranted()) {
      cached = "granted";
      return true;
    }
    const result = await requestPermission();
    cached = result === "granted" ? "granted" : "denied";
    return cached === "granted";
  } catch {
    cached = "denied";
    return false;
  }
}

/** Never rejects: a failed OS notification must not surface as an app error. */
export async function raiseOsNotification(item: NotificationItem): Promise<void> {
  try {
    if (!(await ensureOsPermission())) return;
    sendNotification({ title: item.title, body: item.body });
  } catch {
    // No daemon, no Start-menu identity, or the user revoked the grant.
  }
}
