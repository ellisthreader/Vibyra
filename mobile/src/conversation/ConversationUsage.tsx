import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { usageSummary } from './usageSummary';
export function ConversationUsage({ value }: { value: unknown }) {
  const { colors } = useTheme(); const usage = usageSummary(value);
  return <View style={s.body}><Text style={[s.intro, { color: colors.muted }]}>Your connected Codex account</Text>
    {usage.groups.map(group => <View style={s.group} key={group.name}><Text style={[s.title, { color: colors.text }]}>{group.name}</Text>
      {group.windows.map(window => <View key={window.label} style={s.window}><View style={s.row}><Text style={[s.label, { color: colors.text }]}>{window.label}</Text><Text style={[s.label, { color: colors.muted }]}>{window.used}% used</Text></View>
        <View accessible accessibilityLabel={`${window.label}: ${window.used} percent used`} style={[s.track, { backgroundColor: colors.elevated }]}><View style={[s.fill, { width: `${window.used}%`, backgroundColor: colors.accent }]} /></View>
        {window.resetsAt && <Text style={[s.caption, { color: colors.muted }]}>Resets {new Date(window.resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text>}
      </View>)}</View>)}
    {!usage.groups.length && <Text style={[s.label, { color: colors.muted }]}>{usage.note || 'Account limits are not available.'}</Text>}
    <View style={[s.tokenSection, { borderColor: colors.border }]}><Text style={[s.title, { color: colors.text }]}>This conversation</Text>
      {usage.tokens.length ? usage.tokens.map(token => <View style={s.row} key={token.label}><Text style={[s.label, { color: colors.muted }]}>{token.label}</Text><Text selectable style={[s.label, { color: colors.text }]}>{token.value}</Text></View>)
        : <Text style={[s.caption, { color: colors.muted }]}>Token counts have not been reported yet.</Text>}</View>
    <Text style={[s.caption, { color: colors.muted }]}>Account limits and conversation tokens are separate. Daily and lifetime token history is not exposed by this provider.</Text>
  </View>;
}
const s = StyleSheet.create({ body: { gap: 24 }, intro: { fontSize: 13 }, group: { gap: 20 }, title: { fontSize: 17, fontWeight: '600' },
  window: { gap: 10 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, label: { fontSize: 14, lineHeight: 22 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' }, fill: { height: 5, borderRadius: 3 }, caption: { fontSize: 12, lineHeight: 20 }, tokenSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 24, gap: 14 } });
