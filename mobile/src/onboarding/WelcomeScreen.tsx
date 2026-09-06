import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Button, Hint, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { useAction } from '../ui/useAction';
import { SetupHelp } from './SetupHelp';

export function WelcomeScreen({ workspace, onConnect, onContinue }: {
  workspace: WorkspaceModel; onConnect: () => void; onContinue: () => void;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const [help, setHelp] = useState(false);
  const connected = workspace.status === 'connected';
  return <ScrollView contentContainerStyle={s.content}>
    <View style={s.top}><BrandMark size={38} /><Text style={[s.brand, { color: colors.text }]}>Vibyra</Text>
      <Text style={[s.badge, { color: colors.muted, backgroundColor: colors.elevated }]}>WIP · Phone companion</Text></View>
    <View style={s.hero}>
      <View style={[s.symbol, { backgroundColor: colors.elevated }]}>
        <Icon name={connected ? 'checkmark-circle-outline' : 'desktop-outline'} size={34} color={connected ? colors.success : colors.accent} />
      </View>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
        {connected ? 'Your computer is ready.' : 'Your projects.\nWithin reach.'}</Text>
      <Text style={[s.intro, { color: colors.muted }]}>{connected
        ? `${workspace.host?.name ?? 'Your computer'} is connected. Choose a project and open a terminal or coding agent.`
        : 'Connect your computer to work with your projects, terminals and coding agents from your phone.'}</Text>
    </View>
    <View style={[s.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.noticeTitle, { color: colors.text }]}>Work in progress</Text>
      <Hint>This is an early preview. It uses Vibyra Host on your computer. Existing Desktop chats do not sync here yet.</Hint>
    </View>
    <View style={s.actions}>
      <Button title={connected ? 'Open workspace' : 'Connect computer'} icon={connected ? 'arrow-forward' : 'link-outline'}
        onPress={connected ? onContinue : onConnect} />
      {!connected && workspace.host && workspace.actions.reconnect && <Button secondary
        title={`Reconnect to ${workspace.host.name}`} busy={busy} onPress={() => void run(workspace.actions.reconnect!)} />}
      {!connected && workspace.actions.enterDemo && <Button secondary title="Explore sample workspace" icon="layers-outline" onPress={workspace.actions.enterDemo} />}
      {!connected && <Hint>Pairing needs your approval on the computer. No account is required for this preview.</Hint>}
      <Pressable accessibilityRole="button" accessibilityLabel="Computer setup instructions" aria-expanded={help}
        accessibilityState={{ expanded: help }} onPress={() => setHelp(!help)} style={s.link}>
        <Text style={[s.linkText, { color: colors.accent }]}>{help ? 'Hide setup instructions' : 'How do I set up my computer?'}</Text>
      </Pressable>
      {!connected && <Pressable accessibilityRole="button" accessibilityLabel="Set up later" onPress={onContinue} style={s.link}>
        <Text style={[s.linkText, { color: colors.muted }]}>Set up later</Text>
      </Pressable>}
    </View>
    {help && <SetupHelp />}
    {(error || workspace.error) && <Hint error>{error || workspace.error}</Hint>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, gap: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' }, brand: { fontSize: 19, fontWeight: '600' },
  badge: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 'auto' },
  hero: { paddingTop: 20, gap: 17 }, symbol: { width: 68, height: 68, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 39, lineHeight: 44, fontWeight: '600', letterSpacing: -1.4 }, intro: { fontSize: 17, lineHeight: 26 },
  notice: { gap: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 18 }, noticeTitle: { fontSize: 14, fontWeight: '600' },
  actions: { gap: 12 }, link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, linkText: { fontSize: 14, textAlign: 'center' },
});
