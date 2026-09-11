import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { useVibes } from '../vibes/VibesProvider';
import { AgentSheet } from './AgentSheet';
import { AUTO, autoAgent, defaultProjectId, modelLabel, sessionTitle } from './agents';
import { BrandMark, Hint, Icon } from './primitives';
import { NewChatComposer } from './NewChatComposer';
import { useAction } from './useAction';
import { setDraftForScope, useDraft } from './useDraft';
import type { SessionKind, WorkspaceModel } from './types';

// The computer home. Without a computer this is only the browser and Android
// fallback for the phone chat, so every terminal and project affordance goes.
export function WorkScreen({ workspace, connected, onConnect, onProjects, onAi, onWallet, cloud }: {
  workspace: WorkspaceModel; connected: boolean; onConnect: () => void; onProjects: () => void;
  onAi: () => void; onWallet?: () => void; cloud: boolean;
}) {
  const { colors } = useTheme();
  const { models, store } = useVibes();
  const offset = useKeyboardOffset();
  const [draft, setDraft] = useDraft(`${workspace.demo ? 'sample' : 'live'}:new-chat`);
  const [pick, setPick] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const { busy, error, run } = useAction();
  const projectId = defaultProjectId(workspace.projects, workspace.sessions);
  // Sending resolves everything itself: Auto picks the agent, the most recent
  // shared project is used, and the prompt becomes both the title and the draft.
  const launch = (kind: SessionKind | typeof AUTO) => {
    if (!connected) { onConnect(); return; }
    // A Vibyra Desktop connection watches; it cannot open a session. Saying so
    // beats dispatching a call whose rejection arrives as a server string.
    if (workspace.viewOnly) { setElsewhere(true); return; }
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
    if (id === AUTO) { setElsewhere(false); return; }
    store.setModel(id);
    // Where the chat cannot run, the choice is still kept and said out loud. It
    // is never silently dropped: the catalogue is readable on every runtime, so
    // tapping a row here has to mean something everywhere too.
    if (!cloud) { setElsewhere(true); return; }
    setDraftForScope(`vibes:${workspace.account?.email ?? 'guest'}:${store.state.draftScope}`, draft);
    setDraft(''); onAi();
  };
  const note = !connected ? 'Connect your computer to start coding.'
    : workspace.viewOnly ? 'Watching your Mac. Start work on the computer.'
    : !projectId ? 'Share a folder in Vibyra Host to start a chat.' : 'Your computer. Your workspace.';
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.hero}>
        <BrandMark size={48} />
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>What are we{'\n'}building?</Text>
        {connected && <View style={s.actions}>
          {!workspace.viewOnly && <Pressable accessibilityRole="button" accessibilityLabel="Open terminal" onPress={() => launch('shell')}
            style={[s.action, { borderColor: colors.border }]}>
            <Icon name="terminal-outline" size={17} color={colors.muted} /><Text style={[s.actionText, { color: colors.text }]}>Open terminal</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={workspace.viewOnly ? 'Watch Mac terminals' : 'Browse projects'} onPress={onProjects}
            style={[s.action, { borderColor: colors.border }]}>
            <Icon name={workspace.viewOnly ? 'eye-outline' : 'folder-outline'} size={17} color={colors.muted} />
            <Text style={[s.actionText, { color: colors.text }]}>{workspace.viewOnly ? 'Watch terminals' : 'Projects'}</Text>
          </Pressable>
        </View>}
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
      {elsewhere && <View style={s.error}><Hint>{workspace.viewOnly
        ? 'This connection watches your Mac. Start a chat or terminal on the computer, then follow it here.'
        : `${modelLabel(store.state.model, models)} is saved for your next AI chat. Those chats run on your iPhone.`}</Hint></View>}
      {(error || workspace.error) && <View style={s.error}><Hint error>{error || workspace.error}</Hint></View>}
    </ScrollView>
    <NewChatComposer value={draft} onChange={setDraft} onSend={() => launch(AUTO)} onPick={() => setPick(true)}
      agent={modelLabel(AUTO, models)} note={note} busy={busy} />
    {/* Never `cloud ? models : []`. Handing the picker an empty catalogue left
        every runtime without the phone chat - the sample workspace, the browser
        preview, Android - showing Auto and nothing else. The catalogue is a menu:
        it is readable everywhere, and only sending is gated. */}
    <AgentSheet visible={pick} onClose={() => setPick(false)} onSelect={select} models={models}
      selection={store.state.model === AUTO || !cloud ? AUTO : store.state.model}
      paid={Boolean(store.state.wallet?.paidAvailable)} onUpgrade={onWallet} />
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
