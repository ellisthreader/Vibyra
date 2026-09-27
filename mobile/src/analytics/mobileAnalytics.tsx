import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createConsentEmitter, type ConsentSnapshot, type ConsentStorage, type MobileAnalyticsCore } from './mobileConsent';

export type Event =
  | { event: 'mobile_app_opened'; properties: { platform: 'ios' | 'android' | 'web'; app_version?: string } }
  | { event: 'mobile_chat_prompt_sent'; properties: { model?: string; effort?: string } }
  | { event: 'mobile_project_prompt_sent'; properties: { provider?: string; session_type: 'conversation' } }
  | { event: 'mobile_screen_viewed'; properties: { screen: 'home' | 'chat' | 'projects' | 'remote' | 'settings' | 'wallet' | 'agents' } }
  | { event: 'mobile_engagement_interval'; properties: { seconds: number } }
  | { event: 'mobile_project_created'; properties: { project_kind: 'app' | 'website' | 'game' | 'other' } }
  | { event: 'mobile_preview_opened'; properties: Record<string, never> }
  | { event: 'mobile_pairing_started'; properties: Record<string, never> }
  | { event: 'mobile_pairing_completed'; properties: { result: 'success' | 'failure' } }
  | { event: 'mobile_integration_started'; properties: { provider: 'github' | 'stripe' | 'figma' | 'gmail' | 'google_calendar' | 'google_drive' | 'google_tasks' | 'notion' | 'deepwiki' } }
  | { event: 'mobile_upgrade_clicked'; properties: Record<string, never> };

export type MobileAnalytics = MobileAnalyticsCore<Event>;

/** Best-effort, account/guest-authenticated counts. Only allowlisted metadata enters this API. */
export function createMobileAnalytics(
  baseUrl: string,
  token: () => Promise<string | null>,
  uuid: () => string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  storage?: ConsentStorage,
): MobileAnalytics {
  return createConsentEmitter<Event>(baseUrl, token, uuid, fetcher, now, storage);
}

const Context = createContext<MobileAnalytics | null>(null);
export function MobileAnalyticsProvider({ value, children }: { value: MobileAnalytics | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useMobileAnalytics = () => useContext(Context);
const unavailable: ConsentSnapshot = { ready: false, choice: 'unknown', saving: false, error: null };
export function useMobileAnalyticsConsent() {
  const analytics = useMobileAnalytics();
  return useSyncExternalStore(analytics?.subscribe ?? (() => () => {}), analytics?.snapshot ?? (() => unavailable), () => unavailable);
}

/** Only the visible top-level surface is counted; project and chat names stay local. */
export function useMobileScreenAnalytics({ enabled, settings, destination, agentMode, phoneChat, inProject }: {
  enabled: boolean; settings: boolean; destination: string; agentMode: boolean; phoneChat: boolean; inProject: boolean;
}) {
  const analytics = useMobileAnalytics();
  const consent = useMobileAnalyticsConsent();
  const screen = settings ? 'settings' : destination === 'vibes' ? 'wallet'
    : agentMode ? 'agents' : destination === 'computers' ? 'remote'
    : destination === 'work' ? phoneChat ? 'chat' : inProject ? 'projects' : 'home' : null;
  useEffect(() => {
    if (enabled && screen && (consent.choice === 'aggregate' || consent.choice === 'linked'))
      void analytics?.track({ event: 'mobile_screen_viewed', properties: { screen } });
  }, [analytics, enabled, screen, consent.choice]);
}
