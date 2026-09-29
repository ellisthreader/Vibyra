import { SavedTerminalScreen } from './SavedTerminalScreen';
import { AutoSelectionNotice } from './AutoSelectionNotice';
import { AutoTerminalScreen } from './AutoTerminalScreen';
import { FundedTerminalScreen } from '../vibes/FundedTerminalScreen';
import { agentName } from './agents';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TerminalSurface } from '../terminal/TerminalSurface';
import { LivePreviewCard } from '../preview/LivePreviewCard';
import type { TerminalSurfaceHandle } from '../terminal/TerminalSurface.types';
import type { TerminalPrompt } from '../terminal/promptChoices';
import { DemoPreviewSheet } from '../demo/DemoPreviewSheet';
import { DemoConversation } from '../demo/DemoConversation';
import { isDemoWorkspace } from '../demo/data';
import { useTheme } from '../theme';
import { useKeyboardOffset } from './keyboardOffset';
import { Composer } from './Composer';
import { ConversationSessionScreen } from './ConversationSessionScreen';
import { confirmAction } from './confirm';
import { Button, EmptyState, Hint } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { SessionDetails } from './SessionDetails';
import { LatestPill, SessionStatus } from './SessionStatus';
import { describeSession, typableSession, typingRefusal } from './sessionState';
import { TerminalPromptBar } from './TerminalPromptBar';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import { useAutoControl } from './useAutoControl';
import { useDraft } from './useDraft';
import type { Session, WorkspaceModel } from './types';

interface Props {
  onWallet?(): void; active?: boolean;
  session: Session; workspace: WorkspaceModel;
  /** The session sheet, opened from the ⋯ in the app header; the screen owns the sheet, the header the button. */
  options?: boolean; onCloseOptions?: () => void;
  onPreview?: () => void;
  previewProjectId?: string;
}
export function SessionScreen({ session, workspace, options = false, onCloseOptions = () => {}, onPreview, previewProjectId, onWallet, active }: Props) {
  if (!workspace.projects.some(project => project.id === session.projectId)) return <EmptyState
    icon="folder-outline" title="Choose an available project" detail="This terminal’s project is no longer available. Open a project from the sidebar to continue." />;
  if (session.saved) return <SavedTerminalScreen session={session} workspace={workspace} />;
  if (session.automatic) return <AutoTerminalScreen session={session} workspace={workspace} options={options} onCloseOptions={onCloseOptions} />;
  return <View style={s.body}><AutoSelectionNotice selection={session.autoSelection} /><ResolvedSessionScreen session={session} workspace={workspace} options={options}
    onCloseOptions={onCloseOptions} onPreview={onPreview} previewProjectId={previewProjectId} onWallet={onWallet} active={active} /></View>;
}
function ResolvedSessionScreen({ session, workspace, options = false, onCloseOptions = () => {}, onPreview, previewProjectId, onWallet, active }: Props) {
  if (session.fundedChatId) return <FundedTerminalScreen session={session} workspace={workspace} options={options} onCloseOptions={onCloseOptions} onWallet={onWallet} active={active} />;
  if (session.runner === 'conversation') return Platform.OS === 'ios'
    ? <ConversationSessionScreen session={session} workspace={workspace} options={options}
        onCloseOptions={onCloseOptions} onPreview={onPreview} previewProjectId={previewProjectId} />
    : <PhoneConversationNotice session={session} workspace={workspace} />;
  return <TerminalSessionScreen session={session} workspace={workspace} options={options} onCloseOptions={onCloseOptions} onPreview={onPreview} previewProjectId={previewProjectId} />;
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
/** Legacy PTYs retain their truthful terminal stream in an output card above a
 * draft composer. The raw surface remains available for full-screen CLI prompts;
 * both input paths use the same Mac-controlled lease. Structured sessions use
 * ConversationSessionScreen and never infer approvals or message roles from ANSI. */
function TerminalSessionScreen({ session, workspace, options, onCloseOptions, onPreview, previewProjectId }: Required<Omit<Props, 'onPreview' | 'previewProjectId' | 'onWallet' | 'active'>> & Pick<Props, 'onPreview' | 'previewProjectId'>) {
  const outputStore = workspace.terminalOutput;
  const output = useSyncExternalStore(outputStore?.subscribe ?? noOutputSubscription,
    outputStore?.snapshot ?? (() => workspace.output), outputStore?.snapshot ?? (() => workspace.output));
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const offset = useKeyboardOffset();
  const compact = width > height && height < 500;
  const chat = isDemoWorkspace(workspace) && session.kind !== 'shell';
  const [review, setReview] = useState<'files' | 'changes' | null>(null);
  const [preview, setPreview] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [prompt, setPrompt] = useState<TerminalPrompt | null>(null);
  useEffect(() => setPrompt(null), [session.id]);
  const surface = useRef<TerminalSurfaceHandle>(null);
  const [draft, setDraft] = useDraft(`${workspace.host?.id}:${session.projectId}:${session.id}`);
  const { busy, error, run } = useAction();
  const project = workspace.projects.find(item => item.id === session.projectId);
  const provider = agentName(session.kind);
  const connected = workspace.status === 'connected';
  const controlReady = workspace.demo || workspace.control === 'ready';
  // `readOnly` still means what it meant — no file browsing, no stopping, no
  // starting — so it is not reused here. Typing is its own permission.
  const typable = typableSession(session);
  const canInput = typable && connected && workspace.selectedSessionId === session.id && (workspace.demo ? session.status !== 'interrupted' : session.status === 'running' && controlReady);
  useAutoControl(session, workspace);
  const status = describeSession(session, workspace);
  const stop = () => confirmAction('Stop this session?', workspace.demo
    ? 'Stop this sample session. No computer process is affected.'
    : 'The process running on your computer will be stopped. Saved files will remain.',
    'Stop session', () => { void run(() => workspace.actions.stopSession(session.id)).then(stopped => {
      if (stopped) onCloseOptions();
    }); });
  const input = (data: string) => {
    if (!canInput) return;
    setInputError(null);
    void workspace.actions.sendInput(data).catch(cause => setInputError(cause instanceof Error ? cause.message : 'Input could not be sent.'));
  };
  const choose = async (keys: string) => {
    if (!canInput) throw new Error('Take control before answering this request.');
    await workspace.actions.sendInput(keys);
  };
  // A tap on the output is a request to type. When the terminal is already
  // this phone's, the surface raises the keyboard itself; otherwise the tap
  // takes the terminal — from another phone too — or shows why it cannot.
  const claim = workspace.actions.claimControl;
  const tap = () => {
    if (canInput || !claim || !connected || workspace.demo || session.status !== 'running' || busy) return;
    setInputError(null);
    void run(claim);
  };
  // A waiting choice names the one thing stopping this phone from answering it.
  const promptBlock = canInput ? undefined
    : !connected ? { reason: 'Reconnect to your Mac to answer.', action: workspace.actions.reconnect ? { label: 'Reconnect', onPress: () => void run(workspace.actions.reconnect!) } : undefined }
    : typingRefusal(session) ? { reason: typingRefusal(session)! }
    : session.status !== 'running' ? { reason: 'This session has ended.' }
    : { reason: 'Your Mac is in control of this terminal.', action: claim ? { label: 'Take control to answer', onPress: () => void run(claim) } : undefined };
  const sheets = <>
    {workspace.demo && <DemoPreviewSheet visible={preview} onClose={() => setPreview(false)}
      onFeedback={value => { setDraft(value); setPreview(false); }} />}
    <ReviewSheet visible={review !== null} onClose={() => setReview(null)} project={project} workspace={workspace} initialMode={review ?? 'changes'} />
    <Sheet title="Session details" visible={options} onClose={onCloseOptions} scroll={false}>
      <SessionDetails session={session} project={project} workspace={workspace} busy={busy}
        onReview={() => { onCloseOptions(); setReview('changes'); }}
        onStop={stop} />
    </Sheet>
  </>;
  if (chat) return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    {error && <View style={s.notice}><Hint error>{error}</Hint></View>}
    <DemoConversation workspace={workspace} onReview={() => setReview('changes')} onPreview={() => setPreview(true)} />
    <Composer compact={compact} value={draft} onChange={setDraft} disabled={!canInput} shell={false} contextLabel={provider}
      onReview={() => setReview('files')}
      onSend={value => run(() => workspace.actions.sendInput(`${value}\r`))} />
    {sheets}
  </KeyboardAvoidingView>;
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <SessionStatus model={status} busy={busy}
      onReconnect={workspace.actions.reconnect && (() => void run(workspace.actions.reconnect!))}
      onTakeControl={workspace.actions.claimControl && (() => void run(workspace.actions.claimControl!))} />
    {(error || inputError) && <View style={s.notice}><Hint error>{error || inputError}</Hint></View>}
    <View style={[s.terminal, { backgroundColor: colors.workspace, borderColor: colors.border }]}>
      <TerminalSurface key={`${workspace.host?.id}:${session.id}`} ref={surface} output={output} grid={workspace.hostGrid} mirror={session.readOnly === true}
        onFollow={setAtBottom} onInput={input} onTap={tap} onPrompt={setPrompt}
        fontSize={workspace.terminalFontSize} onFontSize={workspace.actions.setTerminalFontSize}
        onResize={(cols, rows) => { void Promise.resolve(workspace.actions.resize(cols, rows)).catch(cause =>
          setInputError(cause instanceof Error ? cause.message : 'Terminal size could not be updated.')); }} disabled={!canInput} />
      {!atBottom && <LatestPill onPress={() => surface.current?.scrollToBottom()} />}
    </View>
    {prompt && !workspace.demo && <TerminalPromptBar prompt={prompt} blocked={promptBlock} onChoose={choose} />}
    {onPreview && previewProjectId && <LivePreviewCard workspace={workspace} projectId={previewProjectId} onPress={onPreview} />}
    <Composer compact={compact} value={draft} onChange={setDraft} disabled={!canInput} shell={session.kind === 'shell'} contextLabel={provider}
      onReview={() => setReview('files')} onSend={value => run(() => workspace.actions.sendInput(`${value}\r`))} />
    {sheets}
  </KeyboardAvoidingView>;
}
const noOutputSubscription = () => () => {};
const s = StyleSheet.create({
  body: { flex: 1 },
  terminal: { flex: 1, minHeight: 60, marginHorizontal: 12, marginTop: 4, marginBottom: 8, borderRadius: 16, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  notice: { paddingHorizontal: 22, paddingVertical: 8 },
});
