import { invoke } from "@tauri-apps/api/core";

type DesktopEvent =
  | "desktop_app_opened"
  | "desktop_project_created"
  | "desktop_project_opened"
  | "desktop_preview_opened"
  | "desktop_terminal_started"
  | "desktop_prompt_submitted"
  | "desktop_engagement_interval";

export type AnalyticsChoice = "unknown" | "declined" | "aggregate" | "linked";
export interface AnalyticsConsent {
  choice: AnalyticsChoice;
  policy_version: number;
  available: boolean;
  pending_sync: boolean;
}

export function analyticsConsentGet(): Promise<AnalyticsConsent> {
  return invoke<AnalyticsConsent>("analytics_consent_get");
}

export function analyticsConsentSet(choice: Exclude<AnalyticsChoice, "unknown">): Promise<AnalyticsConsent> {
  return invoke<AnalyticsConsent>("analytics_consent_set", { choice });
}

export function analyticsFlush(): Promise<void> {
  return invoke<void>("analytics_flush");
}

/** Best effort usage counts; never pass content, local paths or account data. */
export function trackDesktopEvent(
  event: DesktopEvent,
  properties: Record<string, string | number> = {},
  eventId?: string,
): void {
  void invoke<void>("analytics_track", { event, properties, eventId }).catch(() => {});
}
