import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { NotificationsApi } from './api';
/** A short lease, never durable presence. Leaving or backgrounding stops refreshes. */
export function useVisibleWork(
  api: NotificationsApi | undefined,
  run: string | null,
  active: boolean,
) {
  useEffect(() => {
    if (!api || !run || !active) return;
    let alive = true;
    let device: string | null = null;
    const ping = () => {
      if (alive && device)
        void api.presence(device, AppState.currentState === 'active' ? run : null).catch(() => {});
    };
    void api
      .settings()
      .then((value) => {
        if (alive) {
          device = value.deviceId ?? null;
          ping();
        }
      })
      .catch(() => {});
    const interval = setInterval(ping, 20000);
    const listener = AppState.addEventListener('change', ping);
    return () => {
      alive = false;
      clearInterval(interval);
      listener.remove();
      if (device) void api.presence(device, null).catch(() => {});
    };
  }, [api, run, active]);
}
