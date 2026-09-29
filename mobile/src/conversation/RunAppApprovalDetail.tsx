import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { RunAppRequest } from '../state/conversationTypes';

/** What the agent asks to run on the computer: the app, its folder and the
 *  script the command runs, above the command itself. */
export function RunAppApprovalDetail({ runApp }: { runApp: RunAppRequest }) {
  const { colors } = useTheme();
  return <View testID="run-app-detail" style={s.wrap}>
    <Text style={[s.title, { color: colors.text }]}>Run {runApp.name} on your computer?</Text>
    <Text style={[s.meta, { color: colors.muted }]}>In {runApp.cwd} · outside the agent sandbox</Text>
    {runApp.body ? <Text selectable numberOfLines={4} style={[s.body, { color: colors.muted }]}>{runApp.body}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 11, paddingTop: 6, gap: 3 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  meta: { fontSize: 12, lineHeight: 17 },
  body: { fontFamily: 'Menlo', fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});
