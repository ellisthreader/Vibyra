import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { Tone } from '../../agents/v2/routinesModel';

/** A status word on a soft tint of its semantic colour; neutral when nothing is wrong or right. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const { colors } = useTheme();
  const color = tone === 'ok' ? colors.success : tone === 'error' ? colors.error : tone === 'warn' ? colors.warning : colors.muted;
  const background = tone === 'ok' ? colors.successSoft : tone === 'error' ? colors.errorSoft : colors.elevated;
  return (
    <View style={[s.pill, { backgroundColor: background }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.text, { color: tone === 'muted' ? colors.muted : color }]}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
