import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { BrandLogo } from '../ui/BrandLogo';

export function ComposerPickerRow({
  name,
  label = name,
  vendor,
  selected,
  locked,
  company,
  disabled,
  onPress,
  roomy = false,
  detail,
}: {
  name: string;
  label?: string;
  vendor?: string;
  selected?: boolean;
  locked?: boolean;
  company?: boolean;
  disabled?: boolean;
  onPress(): void;
  roomy?: boolean;
  detail?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={company ? 'button' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ ...(company ? {} : { checked: selected }), disabled }}
      aria-checked={company ? undefined : selected}
      disabled={disabled}
      accessibilityHint={
        locked
          ? 'Shows membership options'
          : company
            ? 'Choose a model from this company'
            : undefined
      }
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        roomy && s.roomy,
        { backgroundColor: pressed ? colors.elevated : 'transparent' },
      ]}
    >
      {vendor ? (
        <BrandLogo vendor={vendor} size={roomy ? 34 : 26} bare />
      ) : (
        <View style={s.auto}>
          <Icon name="sparkles" size={19} color={colors.accent} />
        </View>
      )}
      <View style={s.copy}><Text
        style={[
          s.name,
          roomy && s.roomyName,
          { color: selected ? colors.accent : locked ? colors.muted : colors.text },
          selected && s.chosen,
        ]}
      >
        {name}
      </Text>{detail && <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>}</View>
      <Icon
        name={
          company
            ? 'chevron-forward'
            : locked
              ? 'lock-closed-outline'
              : selected
                ? 'checkmark'
                : 'ellipse-outline'
        }
        size={company || locked ? 15 : 17}
        color={selected ? colors.accent : colors.muted}
      />
    </Pressable>
  );
}

export function PickerControl({
  label,
  onPress,
  children,
  disabled = false,
  active = false,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled, ...(active ? { expanded: true } : {}) }}
      style={({ pressed }) => [
        s.control,
        {
          opacity: disabled ? 0.3 : 1,
          backgroundColor: active ? colors.accentSoft : pressed ? colors.elevated : 'transparent',
        },
      ]}
    >
      {children}
    </Pressable>
  );
}
const s = StyleSheet.create({
  copy: { flex: 1, gap: 4 }, detail: { fontSize: 13, lineHeight: 18 },
  roomy: { minHeight: 76, paddingHorizontal: 4, paddingVertical: 16, gap: 16 },
  roomyName: { fontSize: 17, lineHeight: 23 },
  row: {
    minHeight: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  auto: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.25 },
  chosen: { fontWeight: '600' },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
