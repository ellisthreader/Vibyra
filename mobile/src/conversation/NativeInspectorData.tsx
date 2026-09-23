import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
export function NativeInspectorData({ value }: { value: unknown }) {
  const { colors } = useTheme();
  if (value == null || typeof value !== 'object')
    return (
      <Text selectable style={[s.value, { color: value == null ? colors.muted : colors.text }]}>
        {value == null ? 'Not reported' : String(value)}
      </Text>
    );
  return (
    <View style={s.group}>
      {Object.entries(value).map(([key, entry]) => (
        <View key={key} style={[s.row, { borderColor: colors.border }]}>
          <Text style={[s.label, { color: colors.muted }]}>
            {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
          </Text>
          <NativeInspectorData value={entry} />
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  group: { gap: 8 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, gap: 5 },
  label: { fontSize: 12 },
  value: { fontSize: 14, lineHeight: 22 },
});
