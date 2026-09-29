import { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { Session, WorkspaceModel } from '../ui/types';
import { Button, EmptyState, Hint } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';
import { useDraft } from '../ui/useDraft';
import { useKeyboardOffset } from '../ui/keyboardOffset';
import { useVibes } from './VibesProvider';
import { VibesComposer } from './VibesComposer';
import { VibesConversation } from './VibesConversation';
import { useChatQuote } from './useChatQuote';
import { ProjectTools } from './ProjectTools';
import { activeTurn } from './types';

/** A fixed-source terminal backed by the versioned token ledger and project approvals. */
export function FundedTerminalScreen({ session, workspace, options, onCloseOptions, onWallet, active = true }: {
  session: Session; workspace: WorkspaceModel; options: boolean; onCloseOptions(): void; onWallet?(): void; active?: boolean;
}) {
  const { colors } = useTheme();
  const offset = useKeyboardOffset();
  const { store, chats, selected, turns, wallet, pending, ready, revision, error } = useVibes();
  const chat = chats.find(c => c.id === session.fundedChatId);
  const model = chat?.terminal_model ?? '';
  const scope = `funded:${wallet?.accountToken}:${session.fundedChatId}`;
  const [draft, setDraft] = useDraft(scope);
  const liveDraft = useRef(draft); liveDraft.current = draft;
  const busy = Boolean(pending || turns.some(activeTurn));
  const matching = selected === session.fundedChatId;
  const connected = workspace.status === 'connected' && workspace.host?.id === chat?.host_id;
  const allowed = matching && ready && active && !chat?.terminal_closed_at && !!wallet?.entitlements.fundedTerminals && connected;
  const estimate = useChatQuote({ store, chatId: chat?.id ?? null, text: draft, model, effort: chat?.terminal_effort ?? null,
    integrations: '', attachments: '', enabled: allowed && !busy, revision });
  const quote = estimate.quote;
  const affordable = !!quote && !!wallet && wallet.available >= quote.maxCredits;
  const send = async () => {
    if (!allowed || busy || !quote || !affordable) return;
    if (quote.expiresAt * 1000 <= Date.now()) { estimate.invalidate(); return; }
    const sentDraft = draft;
    if (await store.send(quote.quote)) { if (liveDraft.current === sentDraft) setDraft(''); }
    else if (store.state.errorStatus === 402) onWallet?.();
    estimate.invalidate();
  };
  const charged = (chat?.terminal_charged_micro ?? 0) / 10000;
  const limit = (chat?.terminal_budget_micro ?? 0) / 10000;
  if (!matching || !chat) return <EmptyState icon="hourglass-outline" title="Opening terminal" detail="Loading this terminal’s messages…" />;
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset} testID="funded-terminal">
    <View style={[s.funding, { borderColor: colors.border }]}>
      <Text style={[s.label, { color: colors.text }]}>Vibyra tokens{chat.terminal_tools ? '' : ' · Chat only'}</Text>
      <Text style={[s.detail, { color: colors.muted }]}>{charged.toLocaleString(undefined, { maximumFractionDigits: 2 })} used · {limit} token limit</Text>
    </View>
    {turns.length ? <VibesConversation turns={turns} memoryKey={scope} tools={chat.terminal_tools ? <ProjectTools workspace={workspace} /> : undefined} />
      : <ScrollView style={s.body} contentContainerStyle={s.empty}><EmptyState icon="chatbubble-outline" title="Ready when you are" detail={chat.terminal_tools
        ? 'Tell your AI what to build. You approve each file read and edit.' : 'Ask a question or work through some code. This model cannot use computer tools.'} /></ScrollView>}
    {!connected && <View style={s.notice}><Hint>Reconnect to this terminal’s computer to continue.</Hint></View>}
    {!wallet?.entitlements.fundedTerminals && <View style={s.notice}><Hint>Renew Pro to continue this token terminal. Your AI accounts still work.</Hint></View>}
    {(error || estimate.error) && <View style={s.notice}><Hint error>{error ?? estimate.error}</Hint><Button secondary title="Try again" onPress={() => { estimate.invalidate(); void store.refresh(); }} /></View>}
    {quote && !affordable && onWallet && <View style={s.notice}><Button title="Get Vibyra tokens" onPress={onWallet} /></View>}
    <VibesComposer input={{ text: draft, onChange: setDraft, placeholder: 'Message your AI…' }}
      model={{ label: model, id: model, onOpen: () => {}, control: <Text numberOfLines={1} style={[s.model, { color: colors.muted }]}>{chat.terminal_model_name?.replace(/^[^:]+: /, '') ?? model}{chat.terminal_effort ? ` · ${chat.terminal_effort}` : ''}</Text> }}
      attachments={{ items: [], onRemove: () => {}, onAdd: () => {}, control: <></> }}
      submission={{ busy, disabled: !allowed || busy || !affordable, maximum: quote?.maxCredits,
        blocked: chat.terminal_closed_at ? 'This terminal is closed.' : !connected ? 'Reconnect your computer to send.' : undefined,
        onSend: () => void send(), onStop: () => void store.stop().catch(e => store.error(e)) }} />
    <Sheet title="Terminal details" visible={options} onClose={onCloseOptions}>
      <View style={s.details}><Text selectable style={{ color: colors.text }}>{model}</Text>
        <Hint>Vibyra tokens · up to {limit} tokens for this session. Your model and funding source stay fixed.</Hint>
        {!chat.terminal_closed_at && <Button title="Close terminal" secondary onPress={() => void workspace.actions.stopSession(session.id).then(onCloseOptions).catch(e => store.error(e))} />}
      </View>
    </Sheet>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, empty: { flexGrow: 1, justifyContent: 'center' }, funding: { paddingHorizontal: 20, paddingVertical: 10, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 13, fontWeight: '600' }, detail: { fontSize: 12 }, model: { fontSize: 12, maxWidth: 210 }, notice: { paddingHorizontal: 20, gap: 6 }, details: { gap: 16 } });
