import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Teammate } from '../agents/types';
import type { VibesTool, VibesTurn } from './types';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useKeyboardOffset } from '../ui/keyboardOffset';
import { AccountSheet } from '../ui/AccountSheet';
import { ComposerModelPicker } from './ComposerModelPicker';
import { AUTO, modelLabel } from '../ui/agents';
import { Button, Hint, Icon } from '../ui/primitives';
import { setDraftForScope, useDraft } from '../ui/useDraft';
import type { WorkspaceModel } from '../ui/types';
import { useIntegrations } from '../integrations/IntegrationsProvider';
import { chatReferences, missingQuotedReferences, referenceIds } from '../integrations/chatReferences';
import { useVibes } from './VibesProvider';
import { AttachMenu } from './AttachMenu';
import { appendWords } from './appendWords';
import { useAttachFlow } from './useAttachFlow';
import { useChatQuote } from './useChatQuote';
import { ProjectSheet } from './ProjectSheet';
import { ProjectTools } from './ProjectTools';
import { VibesComposer } from './VibesComposer';
import { VibesConversation } from './VibesConversation';
import { Spark } from './Spark';
import { useGlass } from './glass';
import { chatUnlocked, sendBlockReason, unverifiedNotice } from './composerGate';
import { activeTurn, type Effort } from './types';

// The phone's own chat. It mentions no computer: `computer` only lets the attach
// menu offer a connected one's folders as project tools. `onMemory` opens
// Settings > Memory, which every reply here reads and may add to.
export function VibesScreen({ workspace, computer = false, onWallet, onIntegrations, onMemory, teammate, renderTool, readOnly = false, active = true }: {
  teammate?: Teammate; renderTool?: (tool: VibesTool, turn: VibesTurn) => ReactNode; readOnly?: boolean; active?: boolean;
  workspace: WorkspaceModel; computer?: boolean; onWallet(): void; onIntegrations?: () => void; onMemory?: () => void;
}) {
  const { colors } = useTheme(); const glass = useGlass(); const { store, wallet, chats, turns, model, models, effort, selected, draftScope, pending, ready, error, revision, selectionVersion } = useVibes();
  const offset = useKeyboardOffset();
  // Only a ladder the catalogue actually reported can be steered; the composer
  // shows no effort control for a model without one.
  const chosen = models.find(entry => entry.id === model);
  const chat = chats.find(c => c.id === selected);
  const draftPrefix = 'vibes:' + (workspace.account?.email ?? 'guest') + ':';
  const [text, setText, draftError] = useDraft(draftPrefix + draftScope, true);
  useEffect(() => {
    if (selected && draftScope === 'new') {
      setDraftForScope(draftPrefix + selected, text); setDraftForScope(draftPrefix + 'new', '');
      store.update({ draftScope: selected });
    }
  }, [selected, draftScope, draftPrefix, text, store]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [compactEmpty, setCompactEmpty] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  useEffect(() => setModelOpen(false), [draftPrefix, selectionVersion]);
  const [accountOpen, setAccountOpen] = useState(false);
  // The integrations this message points at. They change the request and the price, so
  // they are part of the quote's identity below exactly as the effort is.
  const integrations = useIntegrations();
  const installed = useMemo(() => teammate ? integrations.installed.filter(app => teammate.integrations.includes(app.id)) : integrations.installed, [integrations.installed, teammate?.integrations]);
  const references = chatReferences(text, installed, workspace, chat, teammate?.integrations);
  const integrationKey = references.connectors.join(',');
  // Photos and files for this message: priced by the quote, so part of its identity too.
  const attach = useAttachFlow(store.api.upload, draftPrefix + selectionVersion);
  const attachmentKey = attach.files.ids.join(',');
  // A photo for a model that cannot see it is refused by the server; saying so here
  // saves the round trip and names the fix.
  const blind = attach.files.photos && model !== AUTO && chosen?.vision === false
    ? `${chosen.name} can’t see photos. Choose Auto or a model that can.` : null;
  const holding = attach.files.uploading || attach.files.failed || Boolean(blind);
  const busy = Boolean(pending || turns.some(activeTurn));
  // The server decides who may chat; an unverified address is a notice, not a lock, once it has opened the trial.
  const unlocked = chatUnlocked(wallet);
  const verifyNotice = unverifiedNotice(wallet);
  // Refresh re-reads both halves of the gate: the wallet, and the account the verification lives on.
  const refreshAll = () => Promise.all([store.refresh(), workspace.actions.refreshAccount?.()]).then(() => {});
  const estimate = useChatQuote({ store, chatId: selected, text, model, effort, integrations: integrationKey, attachments: attachmentKey,
    enabled: Boolean(active && !readOnly && ready && !busy && !holding && !references.issue && !references.project && wallet?.consented && unlocked), revision });
  const rejectedReferences = missingQuotedReferences(references.connectors, estimate.quote?.integrations);
  const currentQuote = rejectedReferences ? null : estimate.quote; const quoteError = estimate.error;
  const referenceError = references.issue ?? (rejectedReferences ? 'A referenced integration is no longer available. Refresh your connections before sending.' : null);
  const liveDraft = useRef({ text, selected, store }); liveDraft.current = { text, selected, store };
  // What Auto settled on for this draft. The quote has always carried it; showing
  // it is the difference between "Auto" meaning a choice and meaning a shrug.
  const auto = model === AUTO ? currentQuote?.auto ?? null : null;
  const canAfford = Boolean(currentQuote && wallet && wallet.available >= currentQuote.maxCredits);
  const send = async () => {
    if (!active || readOnly || !currentQuote || !canAfford) return;
    if (currentQuote.expiresAt * 1000 <= Date.now()) { estimate.invalidate(); return; }
    if (await store.send(currentQuote.quote)) {
      // Typing the next message or switching chats during the request must not erase it.
      const live = liveDraft.current;
      if (live.store === store && live.selected === selected && live.text === text) setText('');
      attach.sent();
    } else if (store.state.errorStatus === 402) onWallet();
    estimate.invalidate();
  };
  const consent = async () => {
    try { await store.api.consent(); await store.refresh(); } catch (e) { store.error(e); }
  };
  // Under Auto the router owns the level and ignores one sent beside it, so the
  // composer shows Auto's pick for this draft and offers the picker instead.
  const composerEffort = { ladder: chosen?.reasoning?.efforts ?? [], value: model === AUTO ? currentQuote?.effort ?? null : currentQuote?.effort ?? effort,
    onChange: (value: Effort) => store.setEffort(value), automatic: model === AUTO, onChooseModel: () => setModelOpen(true) };
  // A watch-only Mac serves no project tools, so it is not offered as one.
  const projects = wallet?.consented && computer && !workspace.viewOnly;
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    {/* The chat shows the chat. The balance lives in the rail and in Settings. */}
    {turns.length ? <VibesConversation teammate={Boolean(teammate)} renderTool={renderTool} turns={turns} previews={attach.previews} onMemory={onMemory} tools={teammate ? undefined : <ProjectTools workspace={workspace} />} /> : <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled" onLayout={e => setCompactEmpty(e.nativeEvent.layout.height < 240)}>
      {!compactEmpty && !teammate && <Spark size={104} />}
      <Text accessibilityRole="header" style={[s.title, teammate && {fontSize:23,lineHeight:30,fontFamily:'DM Sans'}, compactEmpty && { fontSize: 23, lineHeight: 30, letterSpacing: -0.6 }, { color: colors.text }]}>{teammate ? `Message ${teammate.name}` : compactEmpty ? 'Let’s build something.' : 'From a spark\nto something real.'}</Text>
      {!compactEmpty && <Text style={[s.subtitle, { color: colors.muted }]}>{teammate?.brief ?? 'Think it through. Write the code.\nFind your next good idea.'}</Text>}
      {!workspace.account && <Button title="Create a free account" onPress={() => setAccountOpen(true)} />}
    </ScrollView>}
    {wallet && wallet.chatEnabled !== false && !wallet.consented && <View style={[s.consent, glass.sheet]}>
      <Text style={[s.consentTitle, { color: colors.text }]}>Before your first chat</Text>
      <Text style={[s.consentText, { color: colors.muted }]}>Your messages are sent to Vibyra, OpenRouter and your chosen AI provider to answer you. Computer files are not shared in this chat.</Text>
      <Button title="Allow AI processing" onPress={() => void consent()} />
    </View>}
    {verifyNotice && <View style={s.notice}><Hint>{verifyNotice}</Hint><Button secondary title="Refresh account" onPress={() => void refreshAll()} /></View>}
    {wallet?.chatEnabled === false && <View style={s.notice}><Hint>AI chats are being prepared. Your balance and history are safe.</Hint></View>}
    {references.project && !referenceError && <View style={s.notice}><Hint>Allow this chat to use {references.project.name} on your computer before sending. Each read still needs your approval.</Hint>
      <Button title={`Use ${references.device === 'obsidian' ? 'Obsidian' : 'Railway'} in this chat`} disabled={busy || !wallet?.consented || !active || readOnly} onPress={() => setProjectOpen(true)} /></View>}
    {referenceError && <View style={s.notice}><Hint error>{referenceError}</Hint>
      {onIntegrations && <Button title="Open integrations" secondary onPress={onIntegrations} />}</View>}
    {(error || quoteError || draftError) && <View style={s.notice}><Hint error>{error ?? quoteError ?? draftError}</Hint>
      <Pressable accessibilityRole="button" onPress={() => void store.refresh()} style={s.link}><Text style={{ color: colors.accent }}>Refresh</Text></Pressable></View>}
    {currentQuote && !canAfford && <View style={s.notice}><Button title="Get more Vibes" onPress={onWallet} /></View>}
    {readOnly && <View style={s.notice}><Hint>{teammate?.archived ? 'Archived · restore this teammate to send another task.' : 'Teammate tasks are paused. Your history is available.'}</Hint></View>}
    <VibesComposer teammate={Boolean(teammate)} quietGeneration={Boolean(teammate)} placeholder={teammate ? `Message ${teammate.name}…` : undefined} inputLabel={teammate ? `Message ${teammate.name}` : undefined} text={text} onChange={setText} onModel={() => setModelOpen(true)} onAdd={attach.open}
      modelPicker={modelOpen ? <ComposerModelPicker onClose={() => setModelOpen(false)} selection={model} paid={Boolean(wallet?.paidAvailable)}
        onSelect={id => store.setModel(id)} models={models} onUpgrade={onWallet} /> : undefined}
      attachments={attach.files.items} onRemoveAttachment={attach.files.remove}
      notice={blind ?? (attach.files.failed ? attach.notice ?? 'Remove the attachment that did not upload.' : attach.notice)}
      model={auto ? auto.name : modelLabel(model, models)} modelId={model !== AUTO ? model : auto ? currentQuote?.model : null}
      chosenByAuto={Boolean(auto)} modelHint={auto?.reason}
      effort={composerEffort} mentions={references.available} knownMentions={referenceIds}
      trialRemaining={chat?.trial_slot && wallet?.trialChatCredits != null ? Math.max(0, wallet.trialChatCredits - chat.trial_used) : undefined} maximum={currentQuote?.maxCredits} busy={busy}
      disabled={!active || readOnly || !ready || holding || !currentQuote || !canAfford || !wallet?.consented || !unlocked} onSend={() => void send()}
      blocked={sendBlockReason({ active, readOnly, ready, wallet, text, uploading: attach.files.uploading, failed: attach.files.failed, blind,
        referenceIssue: referenceError, project: references.project?.name ?? null, quoted: Boolean(currentQuote), canAfford })}
      onStop={() => void store.stop().catch(e => store.error(e))} />
    <ProjectSheet visible={projectOpen} onClose={() => setProjectOpen(false)} workspace={workspace} requestedProject={references.project ?? undefined} />
    <AttachMenu anchor={attach.anchor} onClose={attach.close} full={attach.files.full}
      onCamera={attach.camera} onPhotos={attach.photos} onFiles={attach.documents} apps={references.available}
      onMention={mention => setText(appendWords(text, mention) + ' ')}
      onProject={projects ? () => setProjectOpen(true) : undefined} onConnectApps={onIntegrations} />
    <AccountSheet visible={accountOpen} workspace={workspace} onClose={() => setAccountOpen(false)} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 },
  link: { height: 30, borderRadius: 15, paddingHorizontal: 11, flexDirection: 'row', gap: 6, alignItems: 'center' },
  empty: { flexGrow: 1, paddingVertical: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 14 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -1.3, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 6 },
  consent: { padding: 18, gap: 10, borderRadius: 24, marginHorizontal: 14, marginTop: 8 }, consentTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  consentText: { fontSize: 14, lineHeight: 21 }, notice: { paddingHorizontal: 22, paddingTop: 8, gap: 5 },
});
