import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';
import { IconButton } from '../ui/primitives';

const steps = 3;
export function OnboardingScaffold({ step, onBack, children, footer, backdrop, header, headerRight }: {
  step: number; onBack?: () => void; children: ReactNode; footer?: ReactNode; backdrop?: ReactNode;
  header?: ReactNode; headerRight?: ReactNode;
}) {
  const { colors } = useTheme();
  return <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
    {backdrop && <View pointerEvents="none" aria-hidden style={s.backdrop}>{backdrop}</View>}
    <View style={s.frame}>
      <View style={s.header}>
        {onBack ? <IconButton icon="chevron-back" label="Back" onPress={onBack} /> : <View style={s.spacer} />}
        {header ? <View style={s.headerTitle}>{header}</View> : <View accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${steps}`}
          accessibilityValue={{ min: 1, max: steps, now: step }} style={s.dots}>
          {Array.from({ length: steps }, (_, index) => <View key={index} style={[s.dot,
            { backgroundColor: index + 1 === step ? colors.accent : colors.border, width: index + 1 === step ? 18 : 6 }]} />)}
        </View>}
        {headerRight ?? <View style={s.spacer} />}
      </View>
      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        {footer && <View style={s.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </View>
  </SafeAreaView>;
}
export function TextLink({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} aria-disabled={disabled}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.link, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
    <Text style={[s.linkText, { color: colors.accent }]}>{title}</Text>
  </Pressable>;
}
export function StepTitle({ title, detail }: { title: string; detail: string }) {
  const { colors } = useTheme();
  return <View style={s.titles}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
    <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
  </View>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', alignItems: 'center' },
  frame: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }, body: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, spacer: { width: 44 },
  headerTitle: { flex: 1, alignItems: 'center' },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 18 },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 4 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  titles: { gap: 8 }, title: { fontSize: 29, lineHeight: 34, fontWeight: '600', letterSpacing: -0.9 },
  detail: { fontSize: 15, lineHeight: 22 },
});
