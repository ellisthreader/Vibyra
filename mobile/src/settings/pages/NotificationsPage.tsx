import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Button, EmptyState, Hint } from '../../ui/primitives';
import type { SettingsPageProps } from '../pages';
import { Group, Label, Row, SwitchRow } from '../SettingsRows';
import type { NotificationSettings, NotificationPreferences } from '../../notifications/api';
import { enablePhoneNotifications } from '../../notifications/native';
import { quiet } from './UpdatesPage';

export function NotificationsPage({ workspace, nav }: SettingsPageProps) {
  const api = workspace.demo ? undefined : workspace.notifications;
  const [value, setValue] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(value?.deviceId);
  const bottom = useSheetBottomInset();
  useEffect(() => {
    let alive = true;
    setValue(null);
    if (api && workspace.account)
      void api
        .settings()
        .then((v) => {
          if (alive) setValue(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [api, workspace.account]);
  const save = async (patch: Partial<NotificationPreferences>) => {
    if (!api || !value || busy) return;
    setBusy(true);
    setError(null);
    try {
      setValue(await api.save({ ...value.preferences, ...patch }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enable = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await enablePhoneNotifications(api);
      setValue(await api.settings());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const p = value?.preferences;
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: bottom + 24,
      }}
    >
      {!workspace.account && !workspace.demo && (
        <Button title="Sign in" onPress={() => nav.signIn()} />
      )}
      {workspace.demo && (
        <View style={quiet}>
          <EmptyState
            icon="notifications-outline"
            title="No alerts in the sample"
            detail="Notifications use your real account and native iPhone app. Sample work never sends alerts."
          />
        </View>
      )}
      {error && <Hint>{error}</Hint>}
      {value && (
        <>
          <Group>
            <Row
              title="Updates"
              detail="Replies and work needing your attention"
              onPress={() => nav.push('updates')}
            />
            <Row
              title="Phone notifications"
              value={enabled ? 'Enabled' : undefined}
              detail="Private previews keep task details off your lock screen."
              disabled={busy || !value.capabilities.push}
              onPress={() => void enable()}
            />
            {value.deviceId && (
              <Row
                title="Turn off phone notifications"
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void api!
                    .revoke(value.deviceId!)
                    .then(() => api!.settings())
                    .then(setValue)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              />
            )}
            <Row title="iPhone notification settings" onPress={() => void Linking.openSettings()} />
          </Group>
          <Label>Notify me about</Label>
          <Group>
            <SwitchRow
              title="Needs attention"
              value={p!.attention}
              disabled={busy}
              onChange={(attention) => void save({ attention })}
            />
            <SwitchRow
              title="Replies ready"
              value={p!.replies}
              disabled={busy}
              onChange={(replies) => void save({ replies })}
            />
            <SwitchRow
              title="Progress advisories"
              value={p!.advisories}
              disabled={busy || !p!.smart}
              onChange={(advisories) => void save({ advisories })}
            />
          </Group>
          <Label>Quiet hours</Label>
          <Group>
            <SwitchRow
              title="Quiet overnight"
              detail="10 pm–8 am in your device timezone. Updates remain in the app."
              value={p!.quietStart !== null}
              disabled={busy}
              onChange={(on) =>
                void save({
                  quietStart: on ? 1320 : null,
                  quietEnd: on ? 480 : null,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            />
          </Group>
          <Label>Smart task decisions</Label>
          <Group>
            <SwitchRow
              title="Use Jev for task decisions"
              value={p!.smart}
              disabled={busy || !value.capabilities.smart}
              onChange={(smart) => void save({ smart, ...(smart ? {} : { advisories: false }) })}
              detail="Allow OpenRouter and TypeSafe to classify submitted tasks and selected cloud activity for Auto and progress checks. This never approves actions or shares computer files."
            />
          </Group>
          {!value.capabilities.smart && (
            <Hint>
              Smart task decisions are being evaluated and are not enabled on this server.
            </Hint>
          )}
        </>
      )}
      {!value && api && (
        <Button
          title="Refresh"
          onPress={() =>
            void api
              .settings()
              .then(setValue)
              .catch((e) => setError(e.message))
          }
        />
      )}
    </ScrollView>
  );
}
