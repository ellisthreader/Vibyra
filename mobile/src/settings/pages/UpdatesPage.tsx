import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NotificationItem } from '../../notifications/api';
import { openNotification } from '../../notifications/navigation';
import { Button, EmptyState, Hint } from '../../ui/primitives';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Group, Row } from '../SettingsRows';
import type { SettingsPageProps } from '../pages';
export function UpdatesPage({ workspace, nav }: SettingsPageProps) {
  const api = workspace.demo ? undefined : workspace.notifications;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottom = useSheetBottomInset();
  useEffect(() => {
    let alive = true;
    setItems([]);
    setError(null);
    if (api)
      void api
        .inbox()
        .then((v) => {
          if (alive) setItems(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [api, workspace.account?.email]);
  const open = async (id: string) => {
    if (!api) return;
    try {
      await openNotification(api, id);
      nav.close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // An empty inbox is a calm, centred state rather than one line pinned to the top.
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: bottom + 24,
        gap: 14,
      }}
    >
      {error && <Hint>{error}</Hint>}
      {!items.length && (
        <View style={quiet}>
          <EmptyState
            icon="file-tray-outline"
            title="No updates yet"
            detail="Your work updates will appear here."
          />
        </View>
      )}
      <Group>
        {items.map((item) => (
          <Row
            key={item.id}
            title={item.title}
            value={item.read ? undefined : 'New'}
            detail={`${new Date(item.createdAt).toLocaleString()}${item.actionable ? '' : ' · History'}`}
            onPress={() => void open(item.id)}
          />
        ))}
      </Group>
      {api && (
        <Button
          title="Refresh"
          onPress={() =>
            void api
              .inbox()
              .then(setItems)
              .catch((e) => setError(e.message))
          }
        />
      )}
    </ScrollView>
  );
}
/** Sits a little above the middle of the sheet, the optical centre. */
export const quiet = { flex: 1, justifyContent: 'center' as const, paddingBottom: 72 };
