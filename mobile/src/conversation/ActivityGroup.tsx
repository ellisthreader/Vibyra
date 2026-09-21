import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { durationLabel } from './inspection';
import type { AgentItem } from '../state/conversationTypes';
import type { ConversationActivity } from './types';
import type { WorkItem } from './conversationRows';
import { GenerationIndicator } from './GenerationIndicator';
import { workHistoryLabel } from './generation';

export function ActivityGroup({ items, expanded, onToggle, onInspect, stepMemory, liveLabel }: {
  liveLabel?: string;
  stepMemory?: Record<string, boolean>; onInspect?: (item: AgentItem) => void;
  items: WorkItem[]; expanded: boolean; onToggle: () => void;
}) {
  const { colors } = useTheme();
  const label = liveLabel ?? workHistoryLabel(items);
  const operations = items.filter(item => item.kind === 'activity');
  const latestNote = items.findLast(item => item.kind === 'message');
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. ${expanded ? 'Hide' : 'Show'} work details`}
      accessibilityState={{ expanded }} onPress={onToggle} style={s.summary}>
      {liveLabel ? <View style={s.live}><GenerationIndicator label={label} /></View>
        : <Text style={[s.label, { color: colors.muted }]}>{label}</Text>}
      {!liveLabel && <Text style={[s.count, { color: colors.muted }]}>{operations.length}</Text>}
      <Icon name={expanded ? 'chevron-up' : 'chevron-forward'} size={13} color={colors.muted} />
    </Pressable>
    {liveLabel && !expanded && latestNote?.kind === 'message' && <Text numberOfLines={2}
      style={[s.preview, { color: colors.muted }]}>{latestNote.text}</Text>}
    {expanded && <View style={[s.steps, { borderLeftColor: colors.border }]}>
      {items.map(item => item.kind === 'message'
        ? <View key={item.id} style={s.note}><Text selectable style={[s.noteText, { color: colors.text }]}>{item.text}</Text>
          {item.source?.hasDetail && onInspect && <Pressable accessibilityRole="button" style={s.step} onPress={() => onInspect(item.source!)}>
            <Text style={{ color: colors.accent }}>Read full message</Text></Pressable>}</View>
        : <ActivityDetail key={item.id} item={item} onInspect={onInspect} stepMemory={stepMemory} />)}
    </View>}
  </View>;
}
function ActivityDetail({ item, onInspect, stepMemory }: { stepMemory?: Record<string, boolean>; item: ConversationActivity; onInspect?: (item: AgentItem) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(stepMemory?.[item.id] ?? false);
  const reasoning = item.source?.category === 'reasoning';
  const inspectable = Boolean(item.detail || (item.source?.hasDetail && onInspect));
  return <View>
    <Pressable disabled={!inspectable} onPress={() => { if (stepMemory) stepMemory[item.id] = !open; setOpen(!open); }} accessibilityRole={inspectable ? 'button' : undefined}
      accessibilityLabel={`${item.title}, ${item.status}`} accessibilityState={inspectable ? { expanded: open } : undefined} style={s.step}>
      <Icon name={item.status === 'completed' ? 'checkmark' : item.status === 'failed' ? 'alert-circle-outline' : item.status === 'declined' || item.status === 'interrupted' ? 'remove' : 'ellipse-outline'}
        size={15} color={item.status === 'failed' ? colors.error : colors.muted} />
      <Text style={[s.stepText, { color: colors.muted }]}>{item.title}</Text>
      {item.source?.durationMs != null && <Text style={{ color: colors.muted, fontSize: 11 }}>{durationLabel(item.source.durationMs)}</Text>}
      {inspectable && <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.muted} />}
    </Pressable>
    {open && <View><ScrollView horizontal={!reasoning}><Text selectable style={[s.detail, reasoning && s.reasoning, { backgroundColor: reasoning ? 'transparent' : colors.elevated, color: colors.text }]}>
      {item.detail?.slice(-12000)}{(item.detail?.length ?? 0) > 12000 ? '\nEarlier output omitted from this view.' : ''}
    </Text></ScrollView>{onInspect && item.source && <Pressable accessibilityRole="button" style={s.step} onPress={() => onInspect(item.source!)}><Text style={{ color: colors.accent }}>Inspect {item.source.category === 'fileChange' ? 'changes' : 'details'}</Text><Icon name="open-outline" size={14} color={colors.accent} /></Pressable>}</View>}
  </View>;
}
const s = StyleSheet.create({
  summary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 8 },
  live: { flexShrink: 1 }, label: { fontSize: 14, lineHeight: 22, flexShrink: 1 },
  count: { fontSize: 12 }, steps: { borderLeftWidth: 1, marginLeft: 4, paddingLeft: 17, paddingBottom: 6 },
  preview: { fontSize: 14, lineHeight: 22, paddingLeft: 18, marginBottom: 4 },
  note: { paddingVertical: 10 }, noteText: { fontSize: 15, lineHeight: 24 },
  step: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: { fontSize: 13, lineHeight: 20, flex: 1 },
  detail: { padding: 13, borderRadius: 12, fontFamily: 'Menlo', fontSize: 12, lineHeight: 19, marginVertical: 5 },
  reasoning: { fontFamily: undefined, fontSize: 15, lineHeight: 24, paddingHorizontal: 0, paddingVertical: 4 },
});
