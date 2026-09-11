import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';
import { IconButton } from './primitives';
import { useReducedMotion } from './useReducedMotion';

/**
 * `footer` sits outside the scroll, so a message about what was just tapped is
 * still on screen when the list above it is long. Inside the scroll it would
 * render past the fold and go unread.
 */
export function Sheet({ title, visible, onClose, children, footer, scroll = true }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
  footer?: ReactNode; scroll?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return <Modal visible={visible} onRequestClose={onClose} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'}>
    <View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
      aria-label={title} aria-modal style={[s.safe, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
        <IconButton icon="close" label={`Close ${title}`} onPress={onClose} />
      </View>
      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView> : children}
        {footer !== undefined && footer !== null && <View style={[s.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>{footer}</View>}
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, body: { flex: 1 },
  footer: { paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  header: { minHeight: 64, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', flex: 1 },
  content: { padding: 22, gap: 18, paddingBottom: 40 },
});
