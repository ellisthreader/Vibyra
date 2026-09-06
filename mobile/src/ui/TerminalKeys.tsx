import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const keys = [
  { label: 'esc', name: 'Send Escape', data: '\u001b' },
  { label: 'tab', name: 'Send Tab', data: '\t' },
  { label: '↑', name: 'Previous terminal command', data: '\u001b[A' },
  { label: '↓', name: 'Next terminal command', data: '\u001b[B' },
  { label: 'ctrl C', name: 'Interrupt terminal command', data: '\u0003' },
];
export function TerminalKeys({ disabled, onInput }: { disabled: boolean; onInput: (data: string) => void }) {
  const { colors } = useTheme();
  return <View style={[s.bar, { borderTopColor: colors.border, backgroundColor: colors.workspace }]}>
    {keys.map(key => <Pressable key={key.name} accessibilityRole="button" accessibilityLabel={key.name}
      disabled={disabled} accessibilityState={{ disabled }} onPress={() => onInput(key.data)}
      style={({ pressed }) => [s.key, { backgroundColor: pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
      <Text style={[s.label, { color: colors.muted }]}>{key.label}</Text>
    </Pressable>)}
  </View>;
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 4 },
  key: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  label: { fontSize: 12, fontWeight: '500' },
});
