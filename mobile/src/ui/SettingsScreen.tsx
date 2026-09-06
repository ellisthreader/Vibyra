import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon, SectionLabel, type IconName } from './primitives';
import { clearDrafts } from './useDraft';
import { useAction } from './useAction';
import type { ThemePreference, WorkspaceModel } from './types';

const appearances: { id: ThemePreference; title: string; icon: IconName }[] = [
  { id: 'system', title: 'System', icon: 'phone-portrait-outline' },
  { id: 'light', title: 'Light', icon: 'sunny-outline' },
  { id: 'dark', title: 'Dark', icon: 'moon-outline' },
];
export function SettingsScreen({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const forget = () => Alert.alert('Forget this connection?',
    'Remove the saved pairing and unsent drafts from this phone. Work already running on the computer continues. To revoke access permanently, remove this phone on the computer.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Forget connection', style: 'destructive',
        onPress: () => void run(async () => { await workspace.actions.forgetDevice!(); clearDrafts(); }) },
    ]);
  return <ScrollView contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Settings</Text>
    <SectionLabel>Appearance</SectionLabel>
    <View style={[s.appearances, { backgroundColor: colors.surface }]}>{appearances.map(item =>
      <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: workspace.themePreference === item.id }}
        onPress={() => workspace.actions.setTheme(item.id)} style={[s.appearance,
          { backgroundColor: workspace.themePreference === item.id ? colors.elevated : 'transparent' }]}>
        <Icon name={item.icon} size={24} /><Text style={[s.appearanceText, { color: colors.text }]}>{item.title}</Text>
        <Icon name={workspace.themePreference === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={19}
          color={workspace.themePreference === item.id ? colors.accent : colors.border} />
      </Pressable>)}</View>
    <Hint>System follows your iPhone’s appearance. Text size and motion follow your accessibility settings.</Hint>
    <SectionLabel>Privacy & connection</SectionLabel>
    <View style={[s.info, { backgroundColor: colors.surface }]}>
      <View style={s.infoHeader}><Icon name="shield-checkmark-outline" size={22} />
        <Text style={[s.infoTitle, { color: colors.text }]}>Your computer stays in control</Text></View>
      <Hint>Terminals, coding tools, files, and builds run on your selected computer. Your phone displays the workspace and sends your instructions.</Hint>
      <Hint>Coding agents may send project content to their configured AI provider. Provider settings and credentials stay on your computer.</Hint>
    </View>
    {workspace.actions.forgetDevice && <Button title="Forget saved connection" danger busy={busy} icon="unlink-outline" onPress={forget} />}
    {error && <Hint error>{error}</Hint>}
    <SectionLabel>Working remotely</SectionLabel>
    <View style={[s.info, { backgroundColor: colors.surface }]}>
      <Text style={[s.infoTitle, { color: colors.text }]}>Keep your computer available</Text>
      <Hint>Closing the phone app disconnects the live view. The next time you open it, reconnect to retrieve the current session state.</Hint>
      <Hint>Your computer needs power and a network connection. When it sleeps or restarts, work may pause or be interrupted.</Hint>
    </View>
    <Text style={[s.footer, { color: colors.muted }]}>Vibyra · Made for what you’ll build next.</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 29, fontWeight: '600', letterSpacing: -0.8 }, appearances: { flexDirection: 'row', padding: 7, borderRadius: 20, gap: 6 },
  appearance: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 19, borderRadius: 15 },
  appearanceText: { fontSize: 14, fontWeight: '500', textAlign: 'center', maxWidth: '100%', flexShrink: 1 },
  info: { padding: 20, borderRadius: 20, gap: 15 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, infoTitle: { flexShrink: 1, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  footer: { textAlign: 'center', fontSize: 12, paddingTop: 24 },
});
