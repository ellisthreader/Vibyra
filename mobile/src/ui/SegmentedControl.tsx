import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * The app's one segmented control: a quiet track with a raised thumb under the
 * chosen side. Code/Agents and a project's Files/Changes both use it, so a switch
 * between two views reads the same wherever it appears.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
  center = false,
}: {
  options: readonly T[];
  value: T;
  onChange(value: T): void;
  /** What each side says; also what assistive tech hears for it. */
  labels: Record<T, string>;
  center?: boolean;
}) {
  const { colors, dark } = useTheme();
  return (
    <View
      style={[
        s.track,
        center && s.center,
        { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(23,26,33,0.06)' },
      ]}
    >
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityLabel={labels[option]}
          accessibilityState={{ selected: option === value }}
          aria-selected={option === value}
          onPress={() => onChange(option)}
          hitSlop={{ top: 6, bottom: 6 }}
          style={[
            s.tab,
            option === value && [
              s.thumb,
              { backgroundColor: dark ? colors.elevated : colors.surface },
            ],
          ]}
        >
          <Text style={[s.label, { color: option === value ? colors.text : colors.muted }]}>
            {labels[option]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 11, gap: 2 },
  center: { alignSelf: 'center' },
  tab: {
    minHeight: 32,
    minWidth: 84,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 14, fontWeight: '600', letterSpacing: -0.15 },
});
