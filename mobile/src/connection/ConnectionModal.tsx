import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';

export function ConnectionModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const wide = Platform.OS === 'web' && width >= 600;
  return <Modal visible onRequestClose={onClose} presentationStyle="pageSheet"
    transparent={wide} animationType={reducedMotion ? 'none' : 'slide'}>
    <View style={[s.overlay, { backgroundColor: wide ? colors.scrim : colors.background }]}>
      <SafeAreaView accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
        aria-label="Connect your computer" aria-modal edges={['top', 'bottom']}
        style={[s.frame, { backgroundColor: colors.background }, wide ? [s.wide, { height: Math.min(height - 48, 800) }] : { flex: 1 }]}>
        <View style={s.navigation}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
            style={[s.handle, { backgroundColor: colors.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close Connect your computer" onPress={onClose}
            style={({ pressed }) => [s.closeTarget, { opacity: pressed ? 0.55 : 1 }]}>
            <View style={[s.close, { backgroundColor: colors.elevated }]}><Icon name="close" size={19} color={colors.muted} /></View>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '100%' }, wide: { maxWidth: 480, borderRadius: 32, overflow: 'hidden' },
  navigation: { height: 52, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center' },
  closeTarget: { position: 'absolute', right: 16, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
