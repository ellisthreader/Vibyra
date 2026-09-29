import { useEffect, useRef } from 'react';
import type { NotificationsApi } from './api';
import { enablePhoneNotifications, notificationModule } from './native';
import { openNotification } from './navigation';
import { openSecurityNotification } from './securityNavigation';
import type { RemoteDashboardApi } from '../remote/dashboardApi';
/** Only an authenticated read can turn a push hint into navigation. Never execute push actions. */
export function useNotificationResponses(
  api: NotificationsApi | undefined,
  account: string | null,
  security?: RemoteDashboardApi,
) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    let remove: (() => void) | undefined;
    seen.current.clear();
    if (!api || !account) return;
    void notificationModule()
      .then(async (module) => {
        if (!alive) return;
        void api
          .settings()
          .then(async (settings) => {
            if (!alive || !settings.deviceId || !settings.capabilities.push) return;
            const permission = await module.getPermissionsAsync();
            if (alive && permission.granted) await enablePhoneNotifications(api);
            else if (alive) await api.revoke(settings.deviceId);
          })
          .catch(() => {});
        module.setNotificationHandler({
          handleNotification: async notification => ({
            shouldShowBanner: typeof notification.request.content.data?.securityEventId === 'string',
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const handle = (response: import('expo-notifications').NotificationResponse) => {
          const data = response.notification.request.content.data;
          const securityId = data?.version === 1 ? data.securityEventId : undefined;
          const id = securityId ?? data?.notificationId;
          if (!alive || typeof id !== 'string' || seen.current.has(id)) return;
          seen.current.add(id);
          const opened = typeof securityId === 'string' && security
            ? openSecurityNotification(security, id) : openNotification(api, id);
          void opened
            .then(() => module.clearLastNotificationResponseAsync())
            .catch(() => {
              seen.current.delete(id);
            });
        };
        const subscription = module.addNotificationResponseReceivedListener(handle);
        remove = () => subscription.remove();
        const last = await module.getLastNotificationResponseAsync();
        if (alive && last) handle(last);
      })
      .catch(() => {}); // Missing native capability must not prevent ordinary app startup.
    return () => {
      alive = false;
      remove?.();
    };
  }, [api, account, security]);
}
