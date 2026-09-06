import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';
import { IconButton } from './primitives';
import { useReducedMotion } from './useReducedMotion';

export function Sheet({ title, visible, onClose, children, scroll = true }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode; scroll?: boolean;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  return <Modal visible={visible} onRequestClose={onClose} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'}>
    <SafeAreaView accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
      aria-label={title} aria-modal style={[s.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
        <IconButton icon="close" label={`Close ${title}`} onPress={onClose} />
      </View>
      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView> : children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, body: { flex: 1 },
  header: { minHeight: 64, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', flex: 1 },
  content: { padding: 22, gap: 18, paddingBottom: 40 },
});
