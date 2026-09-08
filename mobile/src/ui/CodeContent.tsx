import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function CodeContent({ content, diff }: { content: string; diff: boolean }) {
  const { colors } = useTheme();
  if (!diff) return <ScrollView horizontal contentContainerStyle={s.content}>
    <Text selectable style={[s.code, { color: colors.text }]}>{content}</Text>
  </ScrollView>;
  return <ScrollView horizontal contentContainerStyle={s.diffContent}><View>
    {content.split('\n').map((line, index) => {
      const header = line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++');
      const added = !header && line.startsWith('+');
      const removed = !header && line.startsWith('-');
      const chunk = line.startsWith('@@');
      return <View key={index} style={[s.line, { backgroundColor: added ? colors.successSoft : removed ? colors.errorSoft : chunk ? colors.elevated : 'transparent' }]}>
        <Text style={[s.number, s.code, { color: colors.muted }]}>{header || chunk ? ' ' : index + 1}</Text>
        <Text selectable style={[s.code, { color: added ? colors.success : removed ? colors.error : chunk ? colors.muted : colors.text }]}>{line || ' '}</Text>
      </View>;
    })}
  </View></ScrollView>;
}
const s = StyleSheet.create({
  content: { padding: 20 }, diffContent: { paddingVertical: 15, minWidth: '100%' },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 22 },
  line: { flexDirection: 'row', paddingRight: 22, minWidth: '100%' }, number: { width: 45, textAlign: 'right', paddingRight: 13, paddingLeft: 6 },
});
