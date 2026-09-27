import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { planNames, planSizes } from './plans';
import type { VibesProduct } from './types';

/** The two sizes of one Pro membership, kept neutral inside the offer card. */
export function PlanTabs({
  sizes,
  selected,
  disabled,
  onSelect,
}: {
  sizes: VibesProduct[];
  selected: string | null;
  disabled?: boolean;
  onSelect(plan: string | null): void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[s.track, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      {sizes.map((size) => {
        const active = size.plan === selected;
        return (
          <Pressable
            key={size.id}
            accessibilityRole="tab"
            aria-selected={active}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            accessibilityLabel={`${planNames[size.plan ?? ''] ?? size.plan}, ${size.credits.toLocaleString()} Vibes a month`}
            onPress={() => { if (!active) onSelect(size.plan); }}
            style={[s.segment, active && { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[s.label, { color: active ? colors.text : colors.muted }]}>
              {planSizes[size.plan ?? '']}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: 228,
    maxWidth: '100%',
    padding: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  label: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
