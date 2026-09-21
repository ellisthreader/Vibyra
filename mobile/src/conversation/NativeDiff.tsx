import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { relativeChangePath } from './usageSummary';
import { useTheme } from '../theme';
export function NativeDiff({ content, root }: { content: string; root?: string | null }) {
  const { colors } = useTheme();
  let changes: { path: string; diff: string; kind?: { type: string; move_path?: string } }[] = [];
  try { const parsed: unknown = JSON.parse(content); if (Array.isArray(parsed)) changes = parsed; } catch { /* legacy */ }
  if (!changes.length) return <ScrollView horizontal><Text selectable style={[s.code, { color: colors.text }]}>{content}</Text></ScrollView>;
  return <View style={s.files}>{changes.map((change, index) => <View key={index} style={[s.file, { borderColor: colors.border }]}>
    <View style={[s.header, { backgroundColor: colors.elevated }]}><Text selectable style={[s.path, { color: colors.text }]}>{relativeChangePath(change.path, root)}</Text>
      <Text style={[s.kind, { color: colors.muted }]}>{change.kind?.move_path ? `Renamed to ${change.kind.move_path}` : change.kind?.type === 'add' ? 'Created' : change.kind?.type === 'delete' ? 'Deleted' : 'Modified'}</Text></View>
    <ScrollView horizontal><View style={s.lines}>{(change.diff || 'Binary file or patch unavailable.').split('\n').map((line, i) => {
      const added = line.startsWith('+') && !line.startsWith('+++'); const removed = line.startsWith('-') && !line.startsWith('---');
      return <Text selectable key={i} style={[s.code, { color: colors.text, backgroundColor: added ? `${colors.success}18` : removed ? `${colors.error}18` : 'transparent' }]}>{line || ' '}</Text>;
    })}</View></ScrollView>
  </View>)}</View>;
}
const s = StyleSheet.create({ files: { gap: 20 }, file: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  header: { padding: 13, gap: 5 }, path: { fontSize: 13, fontWeight: '600' }, kind: { fontSize: 12 },
  lines: { paddingVertical: 10, minWidth: '100%' }, code: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 22, paddingHorizontal: 12 } });
