import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useVibes } from '../vibes/VibesProvider';
import { AgentSheet } from './AgentSheet';
import { AUTO, autoAgent, defaultProjectId, modelLabel, sessionTitle } from './agents';
import { BrandMark, Hint, Icon } from './primitives';
import { NewChatComposer } from './NewChatComposer';
import { useAction } from './useAction';
import { setDraftForScope, useDraft } from './useDraft';
import type { SessionKind, WorkspaceModel } from './types';

export function WorkScreen({ workspace, onConnect, onProjects, onAi, cloud }: {
  workspace: WorkspaceModel; onConnect: () => void; onProjects: () => void; onAi: () => void; cloud: boolean;
}) {
  const { colors } = useTheme();
  const { models, store } = useVibes();
  const [draft, setDraft] = useDraft(`${workspace.demo ? 'sample' : 'live'}:new-chat`);
  const [pick, setPick] = useState(false);
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const projectId = defaultProjectId(workspace.projects, workspace.sessions);
  // Sending resolves everything itself: Auto picks the agent, the most recent
  // shared project is used, and the prompt becomes both the title and the draft.
  const launch = (kind: SessionKind | typeof AUTO) => {
    if (!connected) { onConnect(); return; }
    if (!projectId) return;
    const resolved = kind === AUTO ? autoAgent(Platform.OS === 'ios' && workspace.conversationAvailable) : kind;
    const prompt = draft.trim();
    void run(async () => {
      const session = await workspace.actions.createSession(projectId, resolved, sessionTitle(prompt, resolved));
      if (session && prompt) setDraftForScope(`${workspace.host?.id}:${session.projectId}:${session.id}`, prompt);
      setDraft('');
    });
  };
  // Every row in the picker is an OpenRouter model, so choosing one is choosing
  // the AI chat and the draft moves with it. Auto stays here and resolves itself.
  const select = (id: string) => {
    if (id === AUTO) return;
    store.update({ model: id });
    setDraftForScope(`vibes:${workspace.account?.email ?? 'guest'}:${store.state.draftScope}`, draft);
    setDraft(''); onAi();
  };
  const note = !connected ? 'Connect your computer to start coding.'
    : !projectId ? 'Share a folder in Vibyra Host to start a chat.' : 'Your computer. Your workspace.';
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.hero}>
        <BrandMark size={48} />
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>What are we{'\n'}building?</Text>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open terminal" onPress={() => launch('shell')}
            style={[s.action, { borderColor: colors.border }]}>
            <Icon name="terminal-outline" size={17} color={colors.muted} /><Text style={[s.actionText, { color: colors.text }]}>Open terminal</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Browse projects" onPress={onProjects}
            style={[s.action, { borderColor: colors.border }]}>
            <Icon name="folder-outline" size={17} color={colors.muted} /><Text style={[s.actionText, { color: colors.text }]}>Projects</Text>
          </Pressable>
        </View>
      </View>
      {!connected && <Pressable accessibilityRole="button" accessibilityLabel="Connect computer" onPress={onConnect}
        style={[s.connect, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.device, { backgroundColor: colors.elevated }]}><Icon name="desktop-outline" size={21} /></View>
        <View style={s.connectionText}><Text style={[s.connectionTitle, { color: colors.text }]}>Connect your computer</Text>
          <Text style={[s.connectionDetail, { color: colors.muted }]}>Your code and agents, right here.</Text></View>
        <Icon name="arrow-forward" size={19} color={colors.muted} />
      </Pressable>}
      {connected && workspace.sessions.length > 0 && <View style={s.recent}>
        <Text style={[s.section, { color: colors.muted }]}>Jump back in</Text>
        {workspace.sessions.slice(0, 2).map(session => <Pressable key={session.id} accessibilityRole="button"
          accessibilityLabel={`Continue ${session.title}`} onPress={() => workspace.actions.selectSession(session.id)}
          style={s.recentRow}>
          <Icon name={session.kind === 'shell' ? 'terminal-outline' : 'chatbubble-outline'} size={18} color={colors.muted} />
          <Text numberOfLines={1} style={[s.recentTitle, { color: colors.text }]}>{session.title}</Text>
          <Icon name="arrow-up-outline" size={17} color={colors.muted} />
        </Pressable>)}
      </View>}
      {(error || workspace.error) && <View style={s.error}><Hint error>{error || workspace.error}</Hint></View>}
    </ScrollView>
    <NewChatComposer value={draft} onChange={setDraft} onSend={() => launch(AUTO)} onPick={() => setPick(true)}
      agent={modelLabel(AUTO, models)} note={note} busy={busy} />
    <AgentSheet visible={pick} onClose={() => setPick(false)} onSelect={select} models={cloud ? models : []}
      selection={AUTO} paid={Boolean(store.state.wallet?.paidAvailable)} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  body: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 12 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 28, paddingBottom: 30, gap: 22, minHeight: 270 },
  title: { fontSize: 35, lineHeight: 42, fontWeight: '500', letterSpacing: -1.2, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', justifyContent: 'center', marginTop: 3 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 23, paddingHorizontal: 15 },
  actionText: { fontSize: 13, fontWeight: '500' },
  connect: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  device: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  connectionText: { flex: 1, gap: 5 }, connectionTitle: { fontSize: 14, fontWeight: '600' }, connectionDetail: { fontSize: 12 },
  recent: { paddingBottom: 2 }, section: { fontSize: 12, fontWeight: '500', paddingBottom: 5 },
  recentRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 11 }, recentTitle: { flex: 1, fontSize: 14 },
  error: { paddingTop: 12 },
});
