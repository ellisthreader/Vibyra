import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { Icon } from '../ui/primitives';
import { font } from '../ui/font';
import { integrationBrand } from '../integrations/integrationBrands';
import { StatusPill } from '../integrations/hub/StatusPill';
import { activityLabel, activityService, activityTitle, outcomePill, safeLink, timeWords, type ActivityItem } from './v2/activityModel';
import { markId } from './v2/providerLabels';

/**
 * One receipt. Every string came from a service, so each is drawn as plain text; the one link is the
 * receipt's own address, and only when it passes `safeLink` for that provider. Tapping the row opens
 * the teammate's conversation.
 */
export function ActivityRow({ item, onOpen }: { item: ActivityItem; onOpen(item: ActivityItem): void }) {
  const { colors } = useTheme();
  const pill = outcomePill(item);
  const link = safeLink(item.url, item.provider);
  return (
    <View style={[s.row, { borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={activityLabel(item)} accessibilityHint="Opens the conversation"
        onPress={() => onOpen(item)} style={({ pressed }) => [s.main, { opacity: pressed ? 0.6 : 1 }]}>
        <Mark brand={integrationBrand(markId(item.provider))} size={30} />
        <View style={s.body}>
          <View style={s.head}>
            <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{`${activityService(item)} · ${activityTitle(item)}`}</Text>
            <StatusPill label={pill.label} tone={pill.tone} />
          </View>
          <Text numberOfLines={1} style={[s.meta, { color: colors.muted }]}>
            {[item.accountLabel, item.agentName, timeWords(item.createdAt)].filter(Boolean).join(' · ')}
          </Text>
          {item.summary ? <Text numberOfLines={2} style={[s.summary, { color: colors.text }]}>{item.summary}</Text> : null}
        </View>
      </Pressable>
      {link && (
        <Pressable accessibilityRole="link" accessibilityLabel={`Open in ${activityService(item)}`} hitSlop={6}
          onPress={() => { const again = safeLink(item.url, item.provider); if (again) void Linking.openURL(again).catch(() => {}); }}
          style={({ pressed }) => [s.link, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[s.linkText, { color: colors.accent }]}>{`Open in ${activityService(item)}`}</Text>
          <Icon name="open-outline" size={13} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: { paddingVertical: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...font.row, flex: 1, fontWeight: '600' },
  meta: { ...font.footnote },
  summary: { ...font.subhead },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginLeft: 42, minHeight: 28 },
  linkText: { ...font.footnote, fontWeight: '500' },
});
