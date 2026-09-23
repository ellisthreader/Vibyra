import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { ConversationText } from './ConversationText';
import type { ConversationResult as Result } from './types';

export function ConversationResult({
  item,
  onReview,
  summary,
}: {
  item: Result;
  summary?: string;
  onReview?: () => void;
}) {
  const { colors } = useTheme();
  const label =
    item.status === 'completed'
      ? 'Finished'
      : item.status === 'interrupted'
        ? 'Stopped'
        : 'Needs attention';
  const normalized = item.text
    .trim()
    .replace(/[.!]+$/, '')
    .toLowerCase();
  const repeated =
    normalized === label.toLowerCase() ||
    (item.status === 'completed' &&
      ['task finished', 'completed', 'task completed'].includes(normalized));
  return (
    <View style={s.root}>
      <View style={s.status}>
        <Icon
          size={16}
          color={item.status === 'failed' ? colors.error : colors.muted}
          name={
            item.status === 'completed'
              ? 'checkmark-circle-outline'
              : item.status === 'interrupted'
                ? 'stop-circle-outline'
                : 'alert-circle-outline'
          }
        />
        <Text style={[s.label, { color: colors.muted }]}>
          {label}
          {summary ? ` · ${summary}` : ''}
        </Text>
      </View>
      {Boolean(item.text) && !repeated && <ConversationText text={item.text} />}
      {item.checks?.map((check, index) => (
        <Text key={index} style={[s.check, { color: colors.muted }]}>
          {check}
        </Text>
      ))}
      {onReview && (
        <Pressable
          onPress={onReview}
          accessibilityRole="button"
          accessibilityLabel="Review conversation changes"
          style={({ pressed }) => [
            s.review,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={[s.icon, { backgroundColor: colors.elevated }]}>
            <Icon name="git-compare-outline" size={18} color={colors.text} />
          </View>
          <View style={s.copy}>
            <Text style={[s.title, { color: colors.text }]}>Review conversation changes</Text>
            <Text style={[s.detail, { color: colors.muted }]}>
              Recorded changes from this conversation
            </Text>
          </View>
          <Icon name="chevron-forward" size={15} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '500', letterSpacing: -0.05 },
  check: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 66,
  },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 20, letterSpacing: -0.25 },
  detail: { fontSize: 13, lineHeight: 18 },
});
