import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { useReducedMotion } from './useReducedMotion';

/** Measure insets inside the page sheet, not in the full-screen app behind it. */
export function ModelPickerSheet(props: {
  visible: boolean; onClose(): void; search: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  return <PickerSheet {...props} title="Choose your AI" />;
}

/** Shared native picker chrome; the content owns the choices, not the presentation. */
export function PickerSheet({ title, visible, onClose, search, footer, children }: {
  title: string; visible: boolean; onClose(): void; search?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return <Modal visible={visible} onRequestClose={onClose} presentationStyle="pageSheet"
    animationType={reduced ? 'none' : 'slide'}>
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.safe}>
        <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
            aria-label={title} aria-modal style={[s.panel, { backgroundColor: colors.background }]}>
            <View style={s.header}>
              <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose}
                style={({ pressed }) => [s.closeTarget, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={[s.close, { backgroundColor: colors.elevated }]}><Icon name="close" size={18} color={colors.muted} /></View>
              </Pressable>
            </View>
            {search}
            <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag" automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never">
              {children}
            </ScrollView>
            {!!footer && <View style={[s.footer, { borderTopColor: colors.border }]}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, body: { flex: 1, minHeight: 0 },
  panel: { flex: 1, minHeight: 0, width: '100%', maxWidth: 600, alignSelf: 'center' },
  header: { minHeight: 62, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '600', letterSpacing: -0.6 },
  closeTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  footer: { padding: 18, borderTopWidth: StyleSheet.hairlineWidth },
});
