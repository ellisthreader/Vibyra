import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { statusSummary } from './statusSummary';
import { NativeInspectorData } from './NativeInspectorData';
export function ConversationStatus({ value }: { value: unknown }) {
  const { colors } = useTheme();
  const [advanced, setAdvanced] = useState(false);
  const status = statusSummary(value);
  return (
    <View style={s.body}>
      <Text style={[s.state, { color: colors.text }]}>{status.state}</Text>
      {status.rows.map(([label, value]) => (
        <View key={label} style={[s.row, { borderColor: colors.border }]}>
          <Text style={[s.label, { color: colors.muted }]}>{label}</Text>
          <Text selectable style={[s.value, { color: colors.text }]}>
            {value}
          </Text>
        </View>
      ))}
      {status.active && (
        <Text style={[s.label, { color: colors.muted }]}>
          Active turn: {status.active}. Your selection applies to the next turn.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced(!advanced)}
        style={s.details}
      >
        <Text style={[s.label, { color: colors.muted }]}>
          {advanced ? 'Hide technical details' : 'Technical details'}
        </Text>
      </Pressable>
      {advanced && <NativeInspectorData value={value} />}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 12 },
  state: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  row: { paddingBottom: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5 },
  label: { fontSize: 13, lineHeight: 21 },
  value: { fontSize: 15, lineHeight: 24 },
  details: { minHeight: 44, justifyContent: 'center' },
});
