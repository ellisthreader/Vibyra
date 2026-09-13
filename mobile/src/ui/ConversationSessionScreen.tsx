import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConversationView } from '../conversation/ConversationView';
import { presentConversation } from '../state/presentConversation';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { Composer } from './Composer';
import { Hint, Icon, IconButton } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { SessionDetails } from './SessionDetails';
import { Sheet } from './Sheet';
import { confirmAction } from './confirm';
import { useAction } from './useAction';
import { useDraft } from './useDraft';
import type { Session, WorkspaceModel } from './types';

export function ConversationSessionScreen({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const offset = useKeyboardOffset();
  const compact = width > height && height < 500;
  const [review, setReview] = useState<'files' | 'changes' | null>(null);
  const [details, setDetails] = useState(false);
  const [draft, setDraft, draftError] = useDraft(`${workspace.host?.id}:${session.projectId}:${session.id}`, true);
  const { busy, error, run } = useAction();
  const conversation = workspace.conversation?.sessionId === session.id ? workspace.conversation : null;
  const items = useMemo(() => presentConversation(conversation?.items ?? []), [conversation?.items]);
  const connected = workspace.status === 'connected';
  const ready = connected && workspace.control === 'ready' && conversation?.processState === 'running';
  const working = conversation?.turnState === 'running' || conversation?.turnState === 'waiting';
  const project = workspace.projects.find(item => item.id === session.projectId);
  const status = conversation?.turnState === 'failed' ? 'error' : conversation?.turnState === 'waiting'
    ? 'waiting' : working ? 'working' : 'idle';
  const stopSession = () => confirmAction('Stop this session?', 'The agent on your computer will stop. Saved files remain.',
    'Stop session', () => { void run(() => workspace.actions.stopSession(session.id)).then(stopped => {
      if (stopped) setDetails(false);
    }); });
  return <KeyboardAvoidingView style={s.body} behavior="padding" keyboardVerticalOffset={offset}>
    <View style={s.context}><Pressable accessibilityRole="button" accessibilityLabel="Browse conversation project"
      disabled={!connected} onPress={() => setReview('files')} style={s.projectButton}>
      <Icon name="folder-outline" size={13} color={colors.muted} />
      <Text numberOfLines={1} style={[s.project, { color: colors.muted }]}>{project?.name ?? 'Project'}</Text>
      {!compact && project?.branch && <Text numberOfLines={1} style={[s.branch, { color: colors.muted }]}>/ {project.branch}</Text>}
    </Pressable>
      <IconButton icon="ellipsis-horizontal" label="Conversation options" onPress={() => setDetails(true)} /></View>
    {!connected && <View style={s.control}><Text style={[s.quiet, { color: colors.muted }]}>Connection paused</Text>
      {workspace.actions.reconnect && <Pressable accessibilityRole="button" accessibilityLabel="Reconnect" disabled={busy}
        onPress={() => void run(workspace.actions.reconnect!)} style={s.inlineAction}>
        <Text style={[s.actionText, { color: colors.accent }]}>{busy ? 'Reconnecting…' : 'Reconnect'}</Text></Pressable>}</View>}
    {connected && !ready && conversation?.processState === 'running' && <View style={s.control}>
      <Text style={[s.quiet, { color: colors.muted }]}>{workspace.control === 'claiming' ? 'Requesting control…' : 'Viewing live'}</Text>
      {workspace.actions.claimControl && <Pressable accessibilityRole="button" accessibilityLabel="Take control"
        disabled={busy || workspace.control === 'claiming'} onPress={() => void run(workspace.actions.claimControl!)} style={s.inlineAction}>
        <Text style={[s.actionText, { color: colors.accent }]}>Take control</Text><Icon name="arrow-forward" size={14} color={colors.accent} />
      </Pressable>}</View>}
    {conversation && conversation.processState !== 'running' && <View style={s.notice}>
      <Hint>The agent session has ended. Start a new chat to continue.</Hint></View>}
    {(error || workspace.error || draftError) && <View style={s.notice}><Hint error>{error || workspace.error || draftError}</Hint></View>}
    {!conversation ? <View style={s.loading}>{workspace.syncing && <ActivityIndicator color={colors.muted} />}
      <Hint>{workspace.syncing ? 'Loading your conversation…' : connected ? 'Waiting for the conversation…' : 'Reconnect to load this conversation.'}</Hint></View> :
      <ConversationView key={`${session.id}:${conversation.generation}`} items={items} status={status} connected={connected} canRespond={Boolean(ready)}
        hasEarlier={conversation.hasMore} onLoadEarlier={workspace.actions.loadEarlierConversation}
        onDecision={(id, decision) => workspace.actions.resolveDecision!(id, decision)}
        onAnswer={(id, answers) => workspace.actions.answerQuestion!(id, answers)} onReview={connected ? () => setReview('changes') : undefined} />}
    <Composer compact={compact} value={draft} onChange={setDraft} disabled={!ready || working} shell={false} contextLabel="Codex"
      working={working} onStop={ready && !busy ? () => { void run(() => workspace.actions.interruptTurn!()); } : undefined}
      onContext={() => setDetails(true)} onReview={connected ? () => setReview('files') : undefined}
      onSend={value => run(() => workspace.actions.submitTurn!(value))} />
    <ReviewSheet visible={review !== null} onClose={() => setReview(null)} project={project} workspace={workspace} initialMode={review ?? 'changes'} />
    <Sheet title="Conversation details" visible={details} onClose={() => setDetails(false)} scroll={false}>
      <SessionDetails session={session} project={project} workspace={workspace} busy={busy}
        onReview={() => { setDetails(false); setReview('changes'); }} onStop={stopSession} />
    </Sheet>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, context: { paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center' },
  projectButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  project: { flexShrink: 1, fontSize: 12 }, branch: { flexShrink: 2, fontSize: 11 },
  notice: { paddingHorizontal: 22, paddingVertical: 10, gap: 8 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  control: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  quiet: { fontSize: 12, lineHeight: 19 }, inlineAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionText: { fontSize: 12, fontWeight: '600' } });
