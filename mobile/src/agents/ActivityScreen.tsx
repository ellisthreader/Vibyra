import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { font } from '../ui/font';
import { Chip } from './setup/RoutineBits';
import { ActivityRow } from './ActivityRow';
import { useActivity } from './useActivity';
import type { ActivityItem } from './v2/activityModel';
import { providerName } from './v2/providerLabels';
import type { AgentsApi, Teammate } from './types';

/** Every tool receipt across the person's teammates, newest first, filtered by service and teammate. */
export function ActivityScreen({ api, teammates, active, onOpen }: {
  api: AgentsApi; teammates: Teammate[]; active: boolean; onOpen(agentId: string): void;
}) {
  const { colors } = useTheme();
  const feed = useActivity(api.overview, api.connections, active);
  const people = teammates.filter(t => !t.archived);
  return (
    <View style={s.body} testID="agent-activity">
      <View style={s.filters}>
        <Strip label="Service filter">
          <Chip label="All services" selected={feed.choice.provider === null} onPress={() => feed.setProvider(null)} />
          {feed.services.map(p => <Chip key={p} label={providerName(p)} selected={feed.choice.provider === p} onPress={() => feed.setProvider(p)} />)}
        </Strip>
        <Strip label="Teammate filter">
          <Chip label="All teammates" selected={feed.choice.agentId === null} onPress={() => feed.setAgent(null)} />
          {people.map(t => <Chip key={t.id} label={t.name} selected={feed.choice.agentId === t.id} onPress={() => feed.setAgent(t.id)} />)}
        </Strip>
      </View>
      <FlatList<ActivityItem> data={feed.items} keyExtractor={i => i.id} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled"
        refreshing={feed.state === 'loading' && feed.items.length > 0} onRefresh={feed.refresh}
        renderItem={({ item }) => <ActivityRow item={item} onOpen={i => onOpen(i.agentId)} />}
        ListEmptyComponent={feed.state === 'loading' ? <ActivityIndicator style={s.wait} color={colors.muted} accessibilityLabel="Loading activity" />
          : feed.state === 'error' ? <View style={s.empty}><Hint error>{feed.error}</Hint><Button secondary title="Try again" onPress={feed.refresh} /></View>
          : <View style={s.empty}><Text style={[s.emptyTitle, { color: colors.text }]}>No activity yet</Text>
            <Text style={[s.emptyText, { color: colors.muted }]}>{feed.choice.provider || feed.choice.agentId ? 'Nothing matches these filters.' : 'When a teammate uses a connected service, each receipt shows up here.'}</Text></View>}
        ListFooterComponent={feed.items.length > 0 ? <View style={s.foot}>
          {feed.error && feed.state === 'ready' ? <Hint error>{feed.error}</Hint> : null}
          {feed.hasMore ? <Button secondary title="Load more" busy={feed.loadingMore} onPress={feed.loadMore} /> : null}
        </View> : null} />
    </View>
  );
}
const Strip = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={s.strip} keyboardShouldPersistTaps="handled">{children}</ScrollView>
);
const s = StyleSheet.create({
  body: { flex: 1 }, filters: { gap: 8, paddingTop: 10, paddingBottom: 4 }, strip: { gap: 8, paddingHorizontal: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 28 }, wait: { paddingTop: 60 },
  empty: { paddingTop: 56, gap: 10, alignItems: 'center', paddingHorizontal: 12 },
  emptyTitle: { ...font.headline }, emptyText: { ...font.subhead, textAlign: 'center' }, foot: { paddingTop: 16, gap: 10 },
});
