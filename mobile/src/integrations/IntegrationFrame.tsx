import { useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { usePresence } from '../ui/presence';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * The card: it rises over a dimmed screen, grows with its content up to most of the
 * screen, lifts with the keyboard, and closes from the scrim, the system back
 * gesture, or its own buttons. `footer` - the consent line and the buttons - stays
 * pinned to the bottom, so on a small phone the disclosure scrolls above it rather
 * than pushing the button you are deciding about off the screen; a hairline marks
 * the edge only while something is scrolled under it.
 */
export function IntegrationFrame({
  visible,
  onClose,
  label,
  footer,
  children,
}: {
  visible: boolean;
  onClose(): void;
  label: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { mounted, value } = usePresence(visible, reduced);
  const [box, setBox] = useState(0);
  const [inner, setInner] = useState(0);
  if (!mounted) return null;
  const overflows = inner > box + 4;
  const rise = value.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height, 760), 0] });
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.fill}>
        <Animated.View style={[s.fill, { backgroundColor: colors.scrim, opacity: value }]} />
        {/* The dimmed app closes the card on a tap. It is not announced: Cancel and Done are the accessible ways out. */}
        <Pressable
          style={s.fill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          aria-hidden
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.dock}
        >
          <Animated.View
            accessibilityViewIsModal
            role={Platform.OS === 'web' ? 'dialog' : undefined}
            aria-label={label}
            aria-modal
            style={[
              s.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxHeight: height * 0.92,
                transform: [{ translateY: rise }],
              },
            ]}
          >
            <View style={[s.grabber, { backgroundColor: colors.muted }]} />
            <ScrollView
              style={s.scroll}
              bounces={overflows}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={overflows}
              onLayout={(event) => setBox(event.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => setInner(h)}
              contentContainerStyle={s.content}
            >
              {children}
            </ScrollView>
            <View
              style={[
                s.footer,
                {
                  paddingBottom: Math.max(insets.bottom, 14) + 6,
                  borderTopColor: overflows ? colors.border : 'transparent',
                },
              ]}
            >
              {footer}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dock: { flex: 1, justifyContent: 'flex-end' },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    opacity: 0.35,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, gap: 18 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
