import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from '../ui/font';

const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
/** Display every proposed argument without hiding long content or interpreting it as markup. */
export function ActionDetails({ args }: { args: Record<string, unknown> }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.fields} nestedScrollEnabled>
      {Object.entries(args).map(([key, value]) => (
        <View key={key} style={s.field}>
          <Text style={[s.label, { color: colors.muted }]}>{label(key)}</Text>
          <Text selectable style={[s.value, { color: colors.text }]}>
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  scroll: { maxHeight: 220 },
  fields: { gap: 10 },
  field: { gap: 2 },
  label: { ...font.caption, textTransform: 'capitalize' },
  value: { fontSize: 14.5, lineHeight: 20, letterSpacing: -0.15 },
});
