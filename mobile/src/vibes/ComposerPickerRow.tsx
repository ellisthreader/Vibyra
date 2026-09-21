import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { BrandLogo } from '../ui/BrandLogo';

export function ComposerPickerRow({ name, label = name, vendor, selected, locked, company, disabled, onPress }: {
  name: string; label?: string; vendor?: string; selected?: boolean; locked?: boolean;
  company?: boolean; disabled?: boolean; onPress(): void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole={company ? 'button' : 'radio'} accessibilityLabel={label}
    accessibilityState={{ ...(company ? {} : { checked: selected }), disabled }} aria-checked={company ? undefined : selected} disabled={disabled}
    accessibilityHint={locked ? 'Shows membership options' : company ? 'Choose a model from this company' : undefined}
    onPress={onPress} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.accentSoft : 'transparent' }]}>
    {vendor ? <BrandLogo vendor={vendor} size={30} bare /> : <View style={s.auto}><Icon name="sparkles" size={20} color={colors.accent} /></View>}
    <Text style={[s.name, { color: selected ? colors.accent : locked ? colors.muted : colors.text }]}>{name}</Text>
    <Icon name={company ? 'chevron-forward' : locked ? 'lock-closed-outline' : selected ? 'checkmark' : 'ellipse-outline'}
      size={company || locked ? 16 : 18} color={selected ? colors.accent : colors.muted} />
  </Pressable>;
}

export function PickerControl({ label, onPress, children, disabled = false, active = false }: {
  label: string; onPress(): void; children: ReactNode; disabled?: boolean; active?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled, ...(active ? { expanded: true } : {}) }}
    style={({ pressed }) => [s.control, { opacity: disabled ? 0.3 : 1,
      backgroundColor: pressed || active ? colors.accentSoft : 'transparent' }]}>{children}</Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 8, paddingVertical: 6 },
  auto: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '500', letterSpacing: -0.2 },
  control: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
