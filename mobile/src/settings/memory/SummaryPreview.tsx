import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/primitives';
import { PROFILE_MAX } from '../../vibes/preferencesApi';

/**
 * The summary's first lines, standing in for it on the Memory page. It can run to a
 * few pages, so it is written on a page of its own; this says how far it has got and
 * opens that page. Empty, it says what the summary is for instead.
 */
export function SummaryPreview({ summary, onOpen }: { summary: string; onOpen: () => void }) {
  const { colors } = useTheme();
  const empty = !summary.trim();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={empty ? 'Write your memory summary' : 'Edit memory summary'}
      accessibilityHint={empty ? undefined : `${summary.length.toLocaleString('en-GB')} characters`}
      onPress={onOpen}
      style={({ pressed }) => [s.body, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text numberOfLines={4} style={[s.text, { color: empty ? colors.muted : colors.text }]}>
        {empty ? 'Everything Vibyra should know about you, in your own words.' : summary.trim()}
      </Text>
      <View style={s.foot}>
        <Text style={[s.meta, { color: empty ? colors.accent : colors.muted }]}>
          {empty
            ? 'Write your summary'
            : `${summary.length.toLocaleString('en-GB')} / ${PROFILE_MAX.summary.toLocaleString('en-GB')}`}
        </Text>
        <Icon name="chevron-forward" size={15} color={colors.muted} />
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  body: { gap: 8, paddingTop: 2 },
  text: { fontSize: 15.5, lineHeight: 22 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  meta: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
