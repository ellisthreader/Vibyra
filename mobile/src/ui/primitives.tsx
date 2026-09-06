import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps, ReactNode } from 'react';
import { useTheme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.text} accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />;
}
export function IconButton({ icon, label, onPress, disabled, selected }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    aria-disabled={disabled} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.icon, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      backgroundColor: selected ? colors.elevated : 'transparent' }]}>
    <Icon name={icon} />
  </Pressable>;
}
export function Button({ title, onPress, icon, secondary, busy, disabled, danger }: {
  title: string; onPress: () => void; icon?: IconName; secondary?: boolean;
  busy?: boolean; disabled?: boolean; danger?: boolean;
}) {
  const { colors } = useTheme();
  const textColor = danger ? colors.error : secondary ? colors.text : colors.onAction;
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    aria-disabled={disabled || busy} aria-busy={busy} accessibilityState={{ disabled: disabled || busy, busy }} onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => [s.button, { backgroundColor: secondary || danger ? colors.elevated : colors.action,
      opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}>
    {busy ? <ActivityIndicator color={textColor} /> : icon && <Icon name={icon} size={20} color={textColor} />}
    <Text style={[s.buttonText, { color: textColor }]}>{title}</Text>
  </Pressable>;
}
export function Hint({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const { colors } = useTheme();
  return <Text accessibilityLiveRegion={error ? 'polite' : 'none'}
    style={[s.hint, { color: error ? colors.error : colors.muted }]}>{children}</Text>;
}
export function SectionLabel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text accessibilityRole="header" style={[s.section, { color: colors.muted }]}>{children}</Text>;
}
export function EmptyState({ icon, title, detail, children }: {
  icon: IconName; title: string; detail: string; children?: ReactNode;
}) {
  const { colors } = useTheme();
  return <View style={s.empty}>
    <View style={[s.emptyIcon, { backgroundColor: colors.elevated }]}><Icon name={icon} size={28} /></View>
    <Text accessibilityRole="header" style={[s.emptyTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[s.emptyDetail, { color: colors.muted }]}>{detail}</Text>
    {children && <View style={s.emptyAction}>{children}</View>}
  </View>;
}
export function BrandMark({ size = 32 }: { size?: number }) {
  return <Image accessibilityLabel="Vibyra" source={require('../../assets/vibyra-cobalt.png')}
    style={{ width: size, height: size }} resizeMode="contain" />;
}
const s = StyleSheet.create({
  icon: { width: 44, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 52, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  hint: { fontSize: 14, lineHeight: 21 },
  section: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginTop: 26, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 22, gap: 14 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 23, fontWeight: '600', textAlign: 'center', letterSpacing: -0.5 },
  emptyDetail: { fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 320 },
  emptyAction: { alignSelf: 'stretch', marginTop: 10 },
});
