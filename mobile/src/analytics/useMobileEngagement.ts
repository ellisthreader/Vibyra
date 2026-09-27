import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { MobileAnalytics } from './mobileAnalytics';

const TICK_MS = 15_000;
const IDLE_MS = 120_000;

/** Bounded foreground time. A touch renews the two-minute non-idle window. */
export function useMobileEngagement(analytics: MobileAnalytics, enabled: boolean, choice: string,
  scope: string, platform: 'ios' | 'android' | 'web', appVersion?: string) {
  const lastTouch = useRef(Date.now());
  const onActivity = useCallback(() => { lastTouch.current = Date.now(); return false; }, []);
  useEffect(() => {
    if (!enabled || (choice !== 'aggregate' && choice !== 'linked')) return;
    let foreground = AppState.currentState === 'active';
    let lastTick = Date.now();
    lastTouch.current = lastTick;
    const tick = () => {
      const current = Date.now();
      const seconds = Math.min(60, Math.floor((current - lastTick) / 1000));
      // Credit time only while visible and recently touched; dropped ticks never create hours.
      if (foreground && current - lastTouch.current <= IDLE_MS && seconds > 0)
        void analytics.track({ event: 'mobile_engagement_interval', properties: { seconds } });
      lastTick = current;
    };
    if (foreground) void analytics.opened({ platform, app_version: appVersion });
    const timer = setInterval(tick, TICK_MS);
    const subscription = AppState.addEventListener('change', status => {
      if (foreground && status !== 'active') tick();
      foreground = status === 'active';
      lastTick = Date.now();
      if (foreground) {
        lastTouch.current = lastTick;
        void analytics.refresh(scope).then(() => {
          if (analytics.snapshot().choice === 'aggregate' || analytics.snapshot().choice === 'linked')
            void analytics.opened({ platform, app_version: appVersion });
        });
      }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [analytics, enabled, choice, scope, platform, appVersion]);
  return onActivity;
}
