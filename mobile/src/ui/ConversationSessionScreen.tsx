import { conversationViewMemory } from '../conversation/viewMemory';
import { LivePreviewCard } from '../preview/LivePreviewCard';
import { ConversationAttachButton } from '../conversation/ConversationAttachButton';
import type { ConversationAttachment } from '../conversation/attachmentUpload';
import { ConversationInspectorSheet } from '../conversation/ConversationInspectorSheet';
import { changedFiles, parseCommand, type CommandCatalogue, type InspectorMode } from '../conversation/inspection';
import type { AgentItem } from '../state/conversationTypes';
import { typableSession, typingRefusal } from './sessionState';
import { useAutoControl } from './useAutoControl';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConversationView } from '../conversation/ConversationView';
import { presentConversation } from '../state/presentConversation';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { VibesComposer } from '../vibes/VibesComposer';
import { asEffort } from './effort';
import { useConversationModels } from '../conversation/useConversationModels';
import { ConversationPicker } from '../conversation/ConversationPicker';
import { conversationProvider } from '../conversation/provider';
import { InlineCommands } from '../conversation/InlineCommands';
import { Hint, Icon } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { SessionDetails } from './SessionDetails';
import { Sheet } from './Sheet';
import { confirmAction } from './confirm';
import { useAction } from './useAction';
import { useDraft } from './useDraft';
import type { Session, WorkspaceModel } from './types';

export function ConversationSessionScreen({ session, workspace, options, onCloseOptions, onPreview, previewProjectId, onPhoneChat, onUpgrade }: {
  session: Session; workspace: WorkspaceModel; options: boolean; onCloseOptions(): void;
  onPreview?: () => void; previewProjectId?: string;
  onPhoneChat?(model: string): Promise<void>; onUpgrade?(): void;
}) {
  const { colors } = useTheme();
  const offset = useKeyboardOffset();
  const [review, setReview] = useState<'files' | 'changes' | null>(null);
  const [inspector, setInspector] = useState<{ mode: InspectorMode; item?: AgentItem } | null>(null);
  const memory = conversationViewMemory(`${workspace.host?.id}:${session.id}`);
  const [attachments, updateAttachments] = useState<ConversationAttachment[]>(memory.attachments);
  const setAttachments = (value: ConversationAttachment[]) => { memory.attachments = value; updateAttachments(value); };
  const [commandError, setCommandError] = useState('');
  const [commandPanel, setCommandPanel] = useState<InspectorMode | null>(null);
  const [modelPicker, setModelPicker] = useState(false);
  const modelSettings = useConversationModels(workspace);
  const [draftEffort, setDraftEffort] = useState(asEffort(workspace.conversation?.settings?.effort));
  useEffect(() => { setDraftEffort(asEffort(workspace.conversation?.settings?.effort)); }, [workspace.conversation?.settings?.revision, workspace.conversation?.settings?.effort]);
  const openInspector = (mode: InspectorMode, item?: AgentItem) => { Keyboard.dismiss(); setInspector({ mode, item }); };
  const [draft, setDraft, draftError] = useDraft(`${workspace.host?.id}:${session.projectId}:${session.id}`, true);
  const { busy, error, run } = useAction();
  const conversation = workspace.conversation?.sessionId === session.id ? workspace.conversation : null;
  const provider = conversation?.settings?.provider ?? session.kind;
  const agent = conversationProvider(provider);
  const items = useMemo(() => presentConversation(conversation?.items ?? []), [conversation?.items]);
  useAutoControl(session, workspace);
  const mayType = typableSession(session);
  const connected = workspace.status === 'connected';
  const ready = connected && mayType && workspace.control === 'ready' && conversation?.processState === 'running';
  const working = conversation?.turnState === 'running' || conversation?.turnState === 'waiting';
  const project = workspace.projects.find(item => item.id === session.projectId);
  const status = conversation?.turnState === 'failed' ? 'error' : conversation?.turnState === 'waiting'
    ? 'waiting' : working ? 'working' : 'idle';
  const stopSession = () => confirmAction('Stop this session?', 'The agent on your computer will stop. Saved files remain.',
    'Stop session', () => { void run(() => workspace.actions.stopSession(session.id)).then(stopped => {
      if (stopped) onCloseOptions();
    }); });
  const send = async (text: string, asText = false) => {
    if (!asText && text.trimStart().startsWith('/')) {
      if (!workspace.actions.conversationRequest) { setCommandError('Update your computer to use commands.'); return false; }
      const catalogue = await workspace.actions.conversationRequest<CommandCatalogue>('conversation.commands');
      const command = parseCommand(text, catalogue);
      if (!command?.supported) { setCommandError(command?.reason ?? 'Unknown command'); return false; }
      if (command.args && (command.name === 'model' || command.name === 'effort')) {
        const model = command.name === 'model' ? modelSettings.models.find(model => model.model === command.args) : modelSettings.model;
        if (!model) { setCommandError('Choose an available account model.'); return false; }
        return modelSettings.apply(model.model, command.name === 'effort' ? command.args : model.defaultReasoningEffort);
      }
      if (command.args) { setCommandError('This command does not accept arguments.'); return false; }
      if (command.name === 'stop') await workspace.actions.interruptTurn?.();
      else if (command.name === 'model') setModelPicker(true);
      else setCommandPanel(command.name as InspectorMode);
      setCommandError(''); return true;
    }
    if (working || !ready) return false;
    await workspace.actions.submitTurn!(text, asText, attachments.map(a => a.id)); setAttachments([]); setCommandError(''); return true;
  };
  // The app header names this chat, so nothing else sits above the conversation:
  // the project and the session's options are the composer's folder and agent.
  return <View style={s.body}><KeyboardAvoidingView accessibilityElementsHidden={Boolean(inspector)} importantForAccessibility={inspector ? 'no-hide-descendants' : 'auto'} style={s.body} behavior="padding" keyboardVerticalOffset={offset}>
    {!connected && <View style={s.control}><Text style={[s.quiet, { color: colors.muted }]}>Connection paused</Text>
      {workspace.actions.reconnect && <Pressable accessibilityRole="button" accessibilityLabel="Reconnect" disabled={busy}
        onPress={() => void run(workspace.actions.reconnect!)} style={s.inlineAction}>
        <Text style={[s.actionText, { color: colors.accent }]}>{busy ? 'Reconnecting…' : 'Reconnect'}</Text></Pressable>}</View>}
    {connected && !ready && conversation?.processState === 'running' && <View style={s.control}>
      <Text style={[s.quiet, { color: colors.muted }]}>{typingRefusal(session) ?? (workspace.control === 'claiming' ? 'Requesting control…' : 'Viewing live')}</Text>
      {mayType && workspace.actions.claimControl && <Pressable accessibilityRole="button" accessibilityLabel="Take control"
        disabled={busy || workspace.control === 'claiming'} onPress={() => void run(workspace.actions.claimControl!)} style={s.inlineAction}>
        <Text style={[s.actionText, { color: colors.accent }]}>Take control</Text><Icon name="arrow-forward" size={14} color={colors.accent} />
      </Pressable>}</View>}
    {conversation && conversation.processState !== 'running' && <View style={s.notice}>
      <Hint>{onPhoneChat ? 'This computer chat has ended. Choose a model below to start a phone AI chat.' : `The agent session has ended. Open a new ${agent.name} terminal on your computer to continue.`}</Hint></View>}
    {(error || workspace.error || draftError) && <View style={s.notice}><Hint error>{error || workspace.error || draftError}</Hint></View>}
    {!conversation ? <View style={s.loading}>{workspace.syncing && <ActivityIndicator color={colors.muted} />}
      <Hint>{workspace.syncing ? 'Loading your conversation…' : connected ? 'Waiting for the conversation…' : 'Reconnect to load this conversation.'}</Hint></View> :
      <ConversationView memoryKey={`${workspace.host?.id}:${session.id}`} key={`${session.id}:${conversation.generation}`} items={items} turnId={conversation.turnId} status={status} connected={connected} canRespond={Boolean(ready)}
        hasEarlier={conversation.hasMore} onLoadEarlier={workspace.actions.loadEarlierConversation}
        onDecision={(id, decision) => workspace.actions.resolveDecision!(id, decision)}
        onAnswer={(id, answers) => workspace.actions.answerQuestion!(id, answers)} onInspect={item => openInspector(item.category === 'fileChange' ? 'diff' : 'context', item)} onReview={connected && changedFiles(conversation.items, conversation.turnId).length ? () => openInspector('diff') : undefined} />}
    {commandError && <View style={s.notice}><Hint>{commandError}</Hint><Pressable accessibilityRole="button" style={s.inlineAction} disabled={!ready || working} onPress={() => void run(async () => { await send(draft, true); setDraft(''); })}><Text style={{ color: colors.accent }}>Send as text</Text></Pressable></View>}
    {onPreview && previewProjectId && <LivePreviewCard workspace={workspace} projectId={previewProjectId} onPress={onPreview} />}
    <VibesComposer
      input={{ text: draft, onChange: value => { setDraft(value); setCommandError(''); },
        label: 'Message computer agent', maxLength: 32000,
        placeholder: working ? 'Message…' : 'Ask anything, or / for commands…' }}
      model={{ label: modelSettings.model?.displayName ?? conversation?.settings?.model ?? agent.name,
        id: `${agent.vendor}/${conversation?.settings?.model ?? provider}`, onOpen: () => setModelPicker(true),
        picker: modelPicker ? <ConversationPicker onPhoneChat={onPhoneChat} onUpgrade={onUpgrade} computer={{ models: modelSettings.models, selected: conversation?.settings?.model,
          provider, unavailable: modelSettings.unavailable, error: modelSettings.error, saving: modelSettings.saving, onRetry: modelSettings.retry, onClose: () => setModelPicker(false),
          onSelect: model => modelSettings.apply(model.model, model.defaultReasoningEffort) }} /> : undefined,
        effort: { ladder: modelSettings.ladder, value: draftEffort, automatic: false, open: commandPanel === 'effort', onClose: () => setCommandPanel(null),
          onChange: setDraftEffort, onCommit: () => { if (modelSettings.model && draftEffort && draftEffort !== conversation?.settings?.effort) void modelSettings.apply(modelSettings.model.model, draftEffort); },
          onChooseModel: () => setModelPicker(true) } }}
      attachments={{ items: attachments.map(item => ({ key: item.id, id: item.id, name: item.name, uri: '', kind: 'text', status: 'ready' })),
        onRemove: id => setAttachments(attachments.filter(item => item.id !== id)), onAdd: () => {},
        control: <ConversationAttachButton compact workspace={workspace} attachments={attachments} onChange={setAttachments} disabled={!ready || busy} />,
        notice: modelSettings.error || (modelSettings.saving ? 'Applying settings…' : undefined) }}
      submission={{ busy: working, quietGeneration: true,
        disabled: busy || modelSettings.saving || !draft.trim() || (draft.trimStart().startsWith('/') ? !connected : !ready),
        onStop: () => { if (ready && !busy) void run(() => workspace.actions.interruptTurn!()); },
        onSend: () => { void run(async () => { if (await send(draft)) setDraft(''); }); } }}
      accessory={draft.trimStart().startsWith('/') ? <InlineCommands draft={draft} workspace={workspace} onChoose={command => {
        void run(async () => { if (await send(command)) setDraft(''); });
      }} /> : commandPanel && commandPanel !== 'effort' ? <ConversationInspectorSheet inline mode={commandPanel} workspace={workspace} onClose={() => setCommandPanel(null)} onMode={setCommandPanel} /> : undefined} />
    <ReviewSheet visible={review !== null} onClose={() => setReview(null)} project={project} workspace={workspace} initialMode={review ?? 'changes'} />
    <Sheet title="Conversation details" visible={options} onClose={onCloseOptions} scroll={false}>
      <SessionDetails session={session} project={project} workspace={workspace} busy={busy}
        onReview={() => { onCloseOptions(); setReview('changes'); }}
        onStop={stopSession} />
    </Sheet>
  </KeyboardAvoidingView><ConversationInspectorSheet mode={inspector?.mode ?? null} selected={inspector?.item} workspace={workspace} onClose={() => setInspector(null)} onMode={openInspector} /></View>;
}
const s = StyleSheet.create({ body: { flex: 1 },
  notice: { paddingHorizontal: 22, paddingVertical: 10, gap: 8 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  control: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  quiet: { fontSize: 12, lineHeight: 19 }, inlineAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionText: { fontSize: 12, fontWeight: '600' } });
