import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { TerminalSurface } from '../terminal/TerminalSurface';
import { composerInput } from '../terminal/composerInput';
import { DemoPreviewSheet } from '../demo/DemoPreviewSheet';
import { DemoConversation } from '../demo/DemoConversation';
import { isDemoWorkspace } from '../demo/data';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { Composer } from './Composer';
import { ConversationSessionScreen } from './ConversationSessionScreen';
import { confirmAction } from './confirm';
import { Button, EmptyState, Hint, Icon, IconButton } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { SessionDetails } from './SessionDetails';
import { Sheet } from './Sheet';
import { TerminalKeys } from './TerminalKeys';
import { ViewOnlyBar } from './ViewOnlyBar';
import { useAction } from './useAction';
import { useDraft } from './useDraft';
import type { Session, WorkspaceModel } from './types';

export function SessionScreen({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  if (session.runner === 'conversation') return Platform.OS === 'ios'
    ? <ConversationSessionScreen session={session} workspace={workspace} />
    : <PhoneConversationNotice session={session} workspace={workspace} />;
  return <TerminalSessionScreen session={session} workspace={workspace} />;
}
function PhoneConversationNotice({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  const [review, setReview] = useState(false);
  const project = workspace.projects.find(item => item.id === session.projectId);
  return <View style={s.body}>
    <EmptyState icon="phone-portrait-outline" title="Continue on your iPhone"
      detail="Open this conversation in Vibyra on your iPhone to read updates and respond to the agent.">
      <Button title="Review project files" secondary icon="folder-outline" disabled={workspace.status !== 'connected'}
        onPress={() => setReview(true)} />
    </EmptyState>
    <ReviewSheet visible={review} onClose={() => setReview(false)} project={project} workspace={workspace} initialMode="files" />
  </View>;
}
function TerminalSessionScreen({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const offset = useKeyboardOffset();
  const compact = width > height && height < 500;
  const sample = isDemoWorkspace(workspace);
  const [tab, setTab] = useState<'chat' | 'terminal'>(sample && session.kind !== 'shell' ? 'chat' : 'terminal');
  const [review, setReview] = useState<'files' | 'changes' | null>(null);
  const [details, setDetails] = useState(false);
  const [preview, setPreview] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [bracketedPaste, setBracketedPaste] = useState(false);
  const [draft, setDraft] = useDraft(`${workspace.host?.id}:${session.projectId}:${session.id}`);
  const { busy, error, run } = useAction();
  const project = workspace.projects.find(item => item.id === session.projectId);
  const provider = session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude Code' : 'Codex';
  // A live session is one thing: the terminal its agent is actually running in.
  // Only the sample workspace has a second view, so only it needs a switch.
  const tabbed = sample && session.kind !== 'shell';
  const connected = workspace.status === 'connected';
  const controlReady = workspace.demo || workspace.control === 'ready';
  // `readOnly` still means what it meant — no file browsing, no stopping, no
  // starting — so it is not reused here. Typing is its own permission.
  const typable = session.canInput === true || !session.readOnly;
  const canInput = typable && connected && (workspace.demo ? session.status !== 'interrupted' : session.status === 'running' && controlReady);
  const showTerminal = tab === 'terminal' || !sample;
  const stop = () => confirmAction('Stop this session?', workspace.demo
    ? 'Stop this sample session. No computer process is affected.'
    : 'The process running on your computer will be stopped. Saved files will remain.',
    'Stop session', () => { void run(() => workspace.actions.stopSession(session.id)).then(stopped => {
      if (stopped) setDetails(false);
    }); });
  const input = (data: string) => {
    if (!canInput) return;
    setInputError(null);
    void workspace.actions.sendInput(data).catch(cause => setInputError(cause instanceof Error ? cause.message : 'Input could not be sent.'));
  };
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    {/* One context row: where you are, and the actions for it on the right. */}
    {!compact && <View style={[s.context, { borderBottomColor: colors.border }, tabbed && s.contextTabbed]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open session project" disabled={!connected || session.readOnly}
        onPress={() => setReview('files')} style={s.project}>
        <Icon name="folder-outline" size={13} color={colors.muted} />
        <Text numberOfLines={1} style={[s.contextText, { color: colors.muted }]}>{project?.name ?? 'Project'}</Text>
        {project?.branch && <><Text style={{ color: colors.border }}> / </Text>
          <Text numberOfLines={1} style={[s.branch, { color: colors.muted }]}>{project.branch}</Text></>}
      </Pressable>
      {!session.readOnly && <IconButton icon="git-compare-outline" label="Review project files and changes" disabled={!connected} onPress={() => setReview('changes')} />}
      <IconButton icon="ellipsis-horizontal" label="Session options" onPress={() => setDetails(true)} />
    </View>}
    {(tabbed || compact) && <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
      {tabbed && <View style={[s.tabs, { backgroundColor: colors.elevated }]}>
        {(['chat', 'terminal'] as const).map(item =>
          <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item === 'chat' ? 'Chat' : 'Terminal'}
            aria-selected={tab === item} accessibilityState={{ selected: tab === item }}
            onPress={() => setTab(item)} style={[s.tab, { backgroundColor: tab === item ? colors.surface : 'transparent' }]}>
            <Icon name={item === 'chat' ? 'chatbubble-outline' : 'terminal-outline'} size={14}
              color={tab === item ? colors.text : colors.muted} />
            <Text style={[s.tabText, { color: tab === item ? colors.text : colors.muted }]}>{item === 'chat' ? 'Chat' : 'Terminal'}</Text>
          </Pressable>)}
      </View>}
      <View style={s.spacer} />
      {compact && !session.readOnly && <IconButton icon="git-compare-outline" label="Review project files and changes" disabled={!connected} onPress={() => setReview('changes')} />}
      {compact && <IconButton icon="ellipsis-horizontal" label="Session options" onPress={() => setDetails(true)} />}
    </View>}
    {!connected && <View style={[s.status, { backgroundColor: colors.elevated }]}>
      <Hint>Connection paused</Hint>
      {workspace.actions.reconnect && <Button title="Reconnect" secondary busy={busy} onPress={() => void run(workspace.actions.reconnect!)} />}
    </View>}
    {!workspace.demo && session.status !== 'running' && <View style={s.status}><Hint>{session.status === 'interrupted'
      ? 'Session interrupted. Start a new chat to continue.' : `Session ended${session.exitCode === undefined ? '.' : ` · exit ${session.exitCode}`}`}</Hint></View>}
    {connected && typable && !controlReady && session.status === 'running' && <View style={[s.observe, { backgroundColor: colors.surface }]}>
      <View style={s.observing}><View style={[s.dot, { backgroundColor: colors.muted }]} />
        <Text style={[s.statusText, { color: colors.muted }]}>{workspace.control === 'claiming' ? 'Requesting control…' : 'Viewing live'}</Text></View>
      {workspace.actions.claimControl && workspace.control !== 'claiming' && <Pressable accessibilityRole="button"
        accessibilityLabel="Take control of this terminal" disabled={busy} onPress={() => void run(workspace.actions.claimControl!)}
        style={({ pressed }) => [s.claim, { backgroundColor: colors.action, opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="create-outline" size={13} color={colors.onAction} />
        <Text style={[s.claimText, { color: colors.onAction }]}>Take control</Text>
      </Pressable>}
    </View>}
    {(error || inputError) && <View style={s.status}><Hint error>{error || inputError}</Hint></View>}
    {!showTerminal && sample ?
      <DemoConversation workspace={workspace} onReview={() => setReview('changes')} onPreview={() => setPreview(true)} /> :
      <View style={[s.terminal, { backgroundColor: colors.workspace }]}>
        <TerminalSurface output={workspace.output} onPasteMode={setBracketedPaste} onInput={input}
          fontSize={workspace.terminalFontSize} onFontSize={workspace.actions.setTerminalFontSize}
          onResize={(cols, rows) => { void Promise.resolve(workspace.actions.resize(cols, rows)).catch(cause =>
            setInputError(cause instanceof Error ? cause.message : 'Terminal size could not be updated.')); }} disabled={!canInput} />
        {typable && !compact && <TerminalKeys disabled={!canInput} onInput={input} />}
      </View>}
    {/* One line to type into, right under the output it goes to. The project and
        session actions already have a home above, so the box stays a box. A
        view-only session says so here rather than leaving the space empty. */}
    {!typable ? <ViewOnlyBar typingOff={session.canInput === false} /> : <Composer compact={compact} dense={showTerminal} value={draft} onChange={setDraft} disabled={!canInput}
      shell={session.kind === 'shell' || tab === 'terminal'} contextLabel={provider} onContext={() => setDetails(true)}
      onReview={connected && !showTerminal ? () => setReview('files') : undefined}
      onSend={value => run(() => workspace.actions.sendInput(workspace.demo ? `${value}\r` : composerInput(value, bracketedPaste)))} />}
    {workspace.demo && <DemoPreviewSheet visible={preview} onClose={() => setPreview(false)}
      onFeedback={value => { setDraft(value); setTab('chat'); setPreview(false); }} />}
    <ReviewSheet visible={review !== null} onClose={() => setReview(null)} project={project} workspace={workspace} initialMode={review ?? 'changes'} />
    <Sheet title="Session details" visible={details} onClose={() => setDetails(false)} scroll={false}>
      <SessionDetails session={session} project={project} workspace={workspace} busy={busy}
        onReview={() => { setDetails(false); setReview('changes'); }} onStop={stop} />
    </Sheet>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  body: { flex: 1 }, context: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth }, contextTabbed: { borderBottomWidth: 0 },
  project: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  contextText: { fontSize: 12, flexShrink: 1 }, branch: { fontSize: 11, flexShrink: 2 },
  tabBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 16 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabText: { fontSize: 13, fontWeight: '600' }, spacer: { flex: 1 }, terminal: { flex: 1, minHeight: 60 },
  status: { paddingHorizontal: 22, paddingVertical: 10, gap: 10 },
  observe: { paddingHorizontal: 22, minHeight: 45, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  observing: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }, dot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 12, flexShrink: 1 },
  claim: { minHeight: 44, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  claimText: { fontSize: 12.5, fontWeight: '600' },
});
