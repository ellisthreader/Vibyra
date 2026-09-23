import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { useReducedMotion } from './useReducedMotion';

/** Measure insets inside the page sheet, not in the full-screen app behind it. */
export function ModelPickerSheet(props: {
  visible: boolean;
  onClose(): void;
  search: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return <PickerSheet {...props} title="Choose your AI" />;
}

/** Shared native picker chrome; the content owns the choices, not the presentation. */
export function PickerSheet({
  title,
  visible,
  onClose,
  search,
  footer,
  children,
}: {
  title: string;
  visible: boolean;
  onClose(): void;
  search?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType={reduced ? 'none' : 'slide'}
    >
      <SafeAreaProvider style={{ backgroundColor: colors.background }}>
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.safe}>
          <KeyboardAvoidingView
            style={s.body}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              accessibilityViewIsModal
              role={Platform.OS === 'web' ? 'dialog' : undefined}
              aria-label={title}
              aria-modal
              style={[s.panel, { backgroundColor: colors.background }]}
            >
              {/* Named like every other sheet: centred over the bar, a round close on the right. */}
              <View style={s.header}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  pointerEvents="none"
                  style={[s.title, { color: colors.text }]}
                >
                  {title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${title}`}
                  onPress={onClose}
                  style={({ pressed }) => [s.closeTarget, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={[s.close, { backgroundColor: colors.elevated }]}>
                    <Icon name="close" size={18} color={colors.muted} />
                  </View>
                </Pressable>
              </View>
              {search}
              <ScrollView
                style={s.body}
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustContentInsets={false}
                contentInsetAdjustmentBehavior="never"
              >
                {children}
              </ScrollView>
              {!!footer && (
                <View style={[s.footer, { borderTopColor: colors.border }]}>{footer}</View>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, minHeight: 0 },
  panel: { flex: 1, minHeight: 0, width: '100%', maxWidth: 600, alignSelf: 'center' },
  header: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  title: {
    position: 'absolute',
    left: 56,
    right: 56,
    top: 0,
    bottom: 0,
    lineHeight: 56,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  closeTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28 },
  footer: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
