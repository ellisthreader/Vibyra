import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode, RefObject } from 'react';
import { useTheme } from '../theme';
import { useMeasuredKeyboardOffset } from './keyboardOffset';
import { IconButton } from './primitives';
import { useReducedMotion } from './useReducedMotion';

/**
 * `footer` sits outside the scroll, so a message about what was just tapped is
 * still on screen when the list above it is long. Inside the scroll it would
 * render past the fold and go unread. `stick` is the same idea at the top: a
 * search that scrolls away is no use to a sheet with hundreds of rows.
 *
 * `centre` names the sheet the way iOS names one, over the middle of the title
 * bar rather than at its left edge. The title is then laid over the whole row so
 * the close button cannot push it off centre.
 *
 * `scrollRef` lets a form bring what sits under a focused field — its own
 * button — up above the keyboard, which iOS does for the field alone.
 */
export function Sheet({ title, visible, onClose, children, footer, stick, scroll = true, centre = false, scrollRef }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
  footer?: ReactNode; stick?: ReactNode; scroll?: boolean; centre?: boolean; scrollRef?: RefObject<ScrollView | null>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  // A page sheet starts below the top of the window; the avoiding view is told
  // by how much, or it lifts the sheet's content short by that distance.
  const top = useMeasuredKeyboardOffset();
  return <Modal visible={visible} onRequestClose={onClose} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'}>
    <View ref={top.frame} onLayout={top.onLayout} accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
      aria-label={title} aria-modal style={[s.safe, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[s.top, { borderBottomColor: colors.border }, !!stick && s.padded]}>
        <View style={[s.header, centre && s.centred]}>
          {centre && <Text accessibilityRole="header" pointerEvents="none" numberOfLines={1}
            style={[s.title, s.over, { color: colors.text }]}>{title}</Text>}
          {!centre && <Text accessibilityRole="header" style={[s.title, s.grow, { color: colors.text }]}>{title}</Text>}
          <IconButton icon="close" label={`Close ${title}`} onPress={onClose} />
        </View>
        {stick}
      </View>
      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={top.offset}>
        {scroll ? <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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
  top: { borderBottomWidth: StyleSheet.hairlineWidth }, padded: { paddingBottom: 14 },
  header: { minHeight: 64, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12 },
  centred: { justifyContent: 'flex-end', paddingLeft: 12 },
  title: { fontSize: 20, fontWeight: '600' }, grow: { flex: 1 },
  // Laid over the row, so the title is centred on the sheet and not on the space
  // the close button happens to leave. Tall enough to sit on the row's own baseline.
  over: { position: 'absolute', left: 56, right: 56, top: 0, bottom: 0, lineHeight: 64, textAlign: 'center', fontSize: 18 },
  content: { padding: 22, gap: 18, paddingBottom: 40 },
});
