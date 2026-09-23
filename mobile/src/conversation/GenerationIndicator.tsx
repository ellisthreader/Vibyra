import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useBreath } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';

/** A single quiet pulse. VoiceOver announcements are owned by the transcript. */
export function GenerationIndicator({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const breath = useBreath(!reduced, 1800);
  return (
    <View testID="conversation-generation" accessible accessibilityLabel={label} style={s.row}>
      <Animated.View
        testID="generation-pulse"
        style={[
          s.dot,
          {
            backgroundColor: colors.accent,
            opacity: reduced
              ? 1
              : breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          },
        ]}
      />
      {!compact && <Text style={[s.label, { color: colors.muted }]}>{label}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  row: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: -0.15 },
});
