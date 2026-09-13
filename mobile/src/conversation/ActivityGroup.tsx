import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { ConversationActivity } from './types';

export function ActivityGroup({ items, expanded, onToggle }: {
  items: ConversationActivity[]; expanded: boolean; onToggle: () => void;
}) {
  const { colors } = useTheme();
  const active = items.findLast(item => item.status === 'running');
  const failed = items.some(item => item.status === 'failed');
  const label = active?.title ?? (failed ? 'Activity needs attention' : `${items.length} ${items.length === 1 ? 'step' : 'steps'} completed`);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ expanded }} onPress={onToggle} style={s.summary}>
      <View style={[s.dot, { backgroundColor: active ? colors.accent : failed ? colors.error : colors.muted }]} />
      <Text numberOfLines={2} style={[s.label, { color: colors.muted }]}>{label}</Text>
      {active && items.length > 1 && <Text style={[s.count, { color: colors.muted }]}>{items.length}</Text>}
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
    </Pressable>
    {expanded && <View style={[s.steps, { borderLeftColor: colors.border }]}>
      {items.map(item => <ActivityDetail key={item.id} item={item} />)}
    </View>}
  </View>;
}
function ActivityDetail({ item }: { item: ConversationActivity }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return <View>
    <Pressable disabled={!item.detail} onPress={() => setOpen(!open)} accessibilityRole={item.detail ? 'button' : undefined}
      accessibilityState={item.detail ? { expanded: open } : undefined} style={s.step}>
      <Icon name={item.status === 'completed' ? 'checkmark' : item.status === 'failed' ? 'alert-circle-outline' : 'ellipse-outline'}
        size={15} color={item.status === 'failed' ? colors.error : colors.muted} />
      <Text style={[s.stepText, { color: colors.muted }]}>{item.title}</Text>
      {item.detail && <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.muted} />}
    </Pressable>
    {open && <Text selectable style={[s.detail, { backgroundColor: colors.elevated, color: colors.text }]}>
      {item.detail?.slice(-12000)}{(item.detail?.length ?? 0) > 12000 ? '\nEarlier output omitted from this view.' : ''}
    </Text>}
  </View>;
}
const s = StyleSheet.create({
  summary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 }, label: { fontSize: 14, lineHeight: 21, flex: 1 },
  count: { fontSize: 12 }, steps: { borderLeftWidth: 1, marginLeft: 3, paddingLeft: 15, paddingBottom: 6 },
  step: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: { fontSize: 13, lineHeight: 20, flex: 1 },
  detail: { padding: 13, borderRadius: 12, fontFamily: 'Menlo', fontSize: 12, lineHeight: 19, marginVertical: 5 },
});
