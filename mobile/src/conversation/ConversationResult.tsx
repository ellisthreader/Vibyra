import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { Icon } from '../ui/primitives';
import { ConversationText } from './ConversationText';
import { durationLabel } from './inspection';
import type { TurnStats } from './turnSummary';
import type { ConversationResult as Result } from './types';

/**
 * How a turn ended, in one quiet line ("Worked for 48s"), and what it changed
 * in one row that opens the review: "Edited 2 files +12 −3".
 */
export function ConversationResult({ item, stats, onReview }: {
  item: Result;
  stats?: TurnStats;
  onReview?: () => void;
}) {
  const { colors } = useTheme();
  const time = stats?.duration != null ? durationLabel(stats.duration) : null;
  const label = item.status === 'completed' ? (time ? `Worked for ${time}` : 'Done')
    : item.status === 'interrupted' ? (time ? `Stopped after ${time}` : 'Stopped')
    : 'Something went wrong';
  const normalized = item.text.trim().replace(/[.!]+$/, '').toLowerCase();
  // The engine's own "Finished" says nothing the status line does not.
  const repeated = ['finished', 'stopped', 'something went wrong', 'task finished', 'completed', 'task completed', 'done'].includes(normalized);
  const failed = item.status === 'failed';
  return (
    <View style={s.root}>
      <View style={s.status}>
        <Icon size={15} color={failed ? colors.error : colors.muted}
          name={item.status === 'completed' ? 'checkmark-circle-outline' : item.status === 'interrupted' ? 'stop-circle-outline' : 'alert-circle-outline'} />
        <Text style={[s.label, { color: failed ? colors.error : colors.muted }]}>{label}</Text>
      </View>
      {Boolean(item.text) && !repeated && (failed
        ? <Text selectable style={[s.error, { color: colors.text }]}>{item.text}</Text>
        : <ConversationText text={item.text} />)}
      {item.checks?.map((check, index) => (
        <Text key={index} style={[s.check, { color: colors.muted }]}>{check}</Text>
      ))}
      {Boolean(stats?.files) && (
        <Pressable disabled={!onReview} onPress={onReview} accessibilityRole="button"
          accessibilityLabel={`Edited ${stats!.files} ${stats!.files === 1 ? 'file' : 'files'}, ${stats!.added} lines added, ${stats!.removed} removed. Review changes`}
          style={({ pressed }) => [s.changes, { borderColor: colors.border, backgroundColor: pressed ? colors.elevated : colors.surface }]}>
          <Icon name="git-compare-outline" size={16} color={colors.muted} />
          <Text style={[s.changesText, { color: colors.text }]}>
            Edited {stats!.files} {stats!.files === 1 ? 'file' : 'files'}
          </Text>
          <Text style={s.counts}>
            <Text style={{ color: colors.success }}>+{stats!.added}</Text>
            <Text style={{ color: colors.error }}> −{stats!.removed}</Text>
          </Text>
          {onReview && <Text style={[s.review, { color: colors.accent }]}>Review</Text>}
          {onReview && <Icon name="chevron-forward" size={14} color={colors.accent} />}
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { ...font.footnote, fontWeight: '500' },
  error: { ...font.subhead },
  check: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },
  changes: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  changesText: { ...font.subhead, fontWeight: '500', flex: 1 },
  counts: { ...font.footnote, fontVariant: ['tabular-nums'] },
  review: { ...font.footnote, fontWeight: '600', marginLeft: 4 },
});
