import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { useVibes } from '../vibes/VibesProvider';
import { AgentSheet } from './AgentSheet';
import { sessionIcon, sessionsInProject } from './DrawerProjects';
import { AUTO, autoAgent, defaultProjectId, modelLabel, sessionTitle } from './agents';
import { canStartWork } from './mode';
import { BrandMark, Hint, Icon } from './primitives';
import { NewChatComposer } from './NewChatComposer';
import { useAction } from './useAction';
import { setDraftForScope, useDraft } from './useDraft';
import { vibesDraftKey } from '../vibes/draftScope';
import type { Project, SessionKind, WorkspaceModel } from './types';

// A computer project's home: the composer starts a terminal there, and the
// terminals offered back are its own. It is also the browser and Android stand-in
// for the phone chat, where that chat does not run; then it mentions no computer
// — nothing under a text box may demand hardware — and says where the chat is.
export function WorkScreen({ workspace, project, connected, onProjects, onPhoneChat, onWallet, cloud }: {
  workspace: WorkspaceModel; project?: Project; connected: boolean; onProjects: () => void;
  /** Shows the phone chat the store has selected — Ideas, or the project the chat is bound to. */
  onPhoneChat: () => void; onWallet?: () => void; cloud: boolean;
}) {
  const { colors } = useTheme();
  const { models, store } = useVibes();
  const offset = useKeyboardOffset();
  const [draft, setDraft] = useDraft(`${workspace.demo ? 'sample' : 'live'}:new-chat`);
  const [pick, setPick] = useState(false);
  // Why the last thing pressed did not happen here: a send with no computer, a
  // send a watching Mac cannot take, or a model kept for the phone chat.
  const [elsewhere, setElsewhere] = useState<'send' | 'model' | null>(null);
  const { busy, error, run } = useAction();
  // A Vibyra Desktop whose typing switch is on starts terminals in its own grid
  // when asked from here; one that only watches cannot open anything.
  const watching = !canStartWork(workspace);
  const projectId = project?.id ?? defaultProjectId(workspace.projects, workspace.sessions);
  const recent = project ? sessionsInProject(workspace.sessions, project.id) : workspace.sessions;
  // Hands the draft to the phone's own chat and opens it there.
  const toPhoneChat = (scope: string) => {
    setDraftForScope(vibesDraftKey(workspace.account?.email, scope), draft);
    setDraft(''); onPhoneChat();
  };
  // Sending resolves everything itself: Auto picks the agent, the most recent
  // shared project is used, and the prompt becomes both the title and the draft.
  const launch = (kind: SessionKind | typeof AUTO) => {
    if (!connected) { setElsewhere('send'); return; }
    // A watching Vibyra Desktop cannot open a session. On the iPhone the prompt
    // starts a new chat on the phone instead. Elsewhere, saying so beats
    // dispatching a call whose rejection arrives as a server string.
    if (watching) {
      if (!cloud) { setElsewhere('send'); return; }
      void store.select(null).catch(cause => store.error(cause));
      toPhoneChat('new'); return;
    }
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
    if (id === AUTO) { setElsewhere(null); return; }
    store.setModel(id);
    // Where the chat cannot run, the choice is still kept and said out loud. It
    // is never silently dropped: the catalogue is readable on every runtime, so
    // tapping a row here has to mean something everywhere too.
    if (!cloud) { setElsewhere('model'); return; }
    toPhoneChat(store.state.draftScope);
  };
  const note = !connected ? 'Chats run in the Vibyra iPhone app.'
    : watching ? (cloud ? 'New chats run here on your iPhone.' : 'Watching your Mac. Start work on the computer.')
    : !projectId ? 'Share a folder in Vibyra Host to start a chat.' : project ? `Working in ${project.name}.` : 'Your computer. Your workspace.';
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.hero}>
        <BrandMark size={48} />
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>What are we{'\n'}building?</Text>
        {connected && <View style={s.actions}>
          {!watching && <Pressable accessibilityRole="button" accessibilityLabel="Open terminal" onPress={() => launch('shell')}
            style={({ pressed }) => [s.action, { borderColor: colors.border, backgroundColor: pressed ? colors.elevated : colors.surface }]}>
            <Icon name="terminal-outline" size={16} color={colors.muted} /><Text style={[s.actionText, { color: colors.text }]}>Open terminal</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={workspace.viewOnly ? 'Watch Mac terminals' : 'Browse projects'} onPress={onProjects}
            style={({ pressed }) => [s.action, { borderColor: colors.border, backgroundColor: pressed ? colors.elevated : colors.surface }]}>
            <Icon name={workspace.viewOnly ? 'eye-outline' : 'folder-outline'} size={16} color={colors.muted} />
            <Text style={[s.actionText, { color: colors.text }]}>{workspace.viewOnly ? 'Watch terminals' : 'Projects'}</Text>
          </Pressable>
        </View>}
      </View>
      {connected && recent.length > 0 && <View style={s.recent}>
        <Text style={[s.section, { color: colors.muted }]}>Jump back in</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {recent.slice(0, 2).map((session, index) => <Pressable key={session.id} accessibilityRole="button"
          accessibilityLabel={`Continue ${session.title}`} onPress={() => workspace.actions.selectSession(session.id)}
          style={({ pressed }) => [s.recentRow, index > 0 && [s.ruled, { borderTopColor: colors.border }], pressed && { backgroundColor: colors.elevated }]}>
          <Icon name={sessionIcon(session)} size={17} color={colors.muted} />
          <Text numberOfLines={1} style={[s.recentTitle, { color: colors.text }]}>{session.title}</Text>
          <Icon name="chevron-forward" size={15} color={colors.muted} />
        </Pressable>)}
        </View>
      </View>}
      {elsewhere && <View style={s.error}><Hint>{elsewhere === 'model'
        ? `${modelLabel(store.state.model, models)} is saved for your next AI chat. Those chats run on your iPhone.`
        : !connected ? 'Chats run in the Vibyra iPhone app.'
          : 'This connection watches your Mac. Start a chat or terminal on the computer, then follow it here.'}</Hint></View>}
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
  body: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 12 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 28, paddingBottom: 30, gap: 18, minHeight: 270 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -1, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14 },
  actionText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.15 },
  recent: { paddingBottom: 2 }, section: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: -0.05, paddingBottom: 7, marginLeft: 16 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  recentRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }, ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  recentTitle: { flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  error: { paddingTop: 12 },
});
