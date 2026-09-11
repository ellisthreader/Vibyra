import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useKeyboardOffset } from '../ui/keyboardOffset';
import { AccountSheet } from '../ui/AccountSheet';
import { AgentSheet } from '../ui/AgentSheet';
import { EffortSheet } from '../ui/EffortSheet';
import { effortLabel } from '../ui/effort';
import { AUTO, modelLabel } from '../ui/agents';
import { Button, Hint, Icon } from '../ui/primitives';
import { setDraftForScope, useDraft } from '../ui/useDraft';
import type { WorkspaceModel } from '../ui/types';
import { useIntegrations } from '../integrations/IntegrationsProvider';
import { mentionedIds } from '../integrations/mentions';
import { useVibes } from './VibesProvider';
import { ProjectSheet } from './ProjectSheet';
import { ProjectTools } from './ProjectTools';
import { VibesComposer } from './VibesComposer';
import { VibesConversation } from './VibesConversation';
import { vibeWord, vibes } from './count';
import { activeTurn, type VibesQuote } from './types';

// The phone's own chat. `onComputer` is supplied only while a computer is
// connected, and it is the one thing here that mentions one.
export function VibesScreen({ workspace, onComputer, onWallet }: {
  workspace: WorkspaceModel; onComputer?: () => void; onWallet(): void;
}) {
  const { colors } = useTheme(); const { store, wallet, chats, turns, model, models, effort, selected, draftScope, pending, ready, error } = useVibes();
  const offset = useKeyboardOffset();
  // Only a model whose ladder the catalogue actually reported can be steered, so
  // Auto and unsteerable models simply show no effort control.
  const chosen = models.find(entry => entry.id === model);
  const steerable = (chosen?.reasoning?.efforts.length ?? 0) > 1;
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
  const [modelOpen, setModelOpen] = useState(false); const [effortOpen, setEffortOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // The integrations this message points at. They change the request and the price, so
  // they are part of the quote's identity below exactly as the effort is.
  const { installed } = useIntegrations();
  const mentioned = useMemo(() => mentionedIds(text, installed.map(integration => integration.id)), [text, installed]);
  const integrationKey = mentioned.join(',');
  const [quote, setQuote] = useState<{ text: string; model: string; effort: string | null; integrations: string; value: VibesQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null); const quoting = useRef(0);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const busy = Boolean(pending || turns.some(activeTurn));
  useEffect(() => {
    const version = ++quoting.current; setQuote(null); setQuoteError(null);
    if (!text.trim() || !ready || busy || !wallet?.consented || !wallet.verified || wallet.chatEnabled === false) return;
    const timer = setTimeout(() => {
      void store.chat(text).then(id => store.api.quote(id, text.trim(), model, effort, mentioned)).then(value => {
        if (version === quoting.current) setQuote({ text, model, effort, integrations: integrationKey, value });
      }).catch(e => { if (version === quoting.current) setQuoteError(e.message); });
    }, 650);
    return () => { clearTimeout(timer); ++quoting.current; };
  }, [text, model, effort, integrationKey, selected, ready, busy, wallet?.consented, wallet?.verified, wallet?.chatEnabled, store, quoteRevision]);
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteRevision(r => r + 1), Math.max(0, quote.value.expiresAt * 1000 - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [quote]);
  // Effort belongs in this comparison: it changes both the request and the price,
  // so a quote taken at one level must never be spent at another.
  // Integrations are in it for the same reason: a quote taken without one must never be
  // spent with it, and connecting one mid-draft changes what the reply may read.
  const currentQuote = quote?.text === text && quote.model === model && quote.effort === effort
    && quote.integrations === integrationKey ? quote.value : null;
  // What Auto settled on for this draft. The quote has always carried it; showing
  // it is the difference between "Auto" meaning a choice and meaning a shrug.
  const auto = model === AUTO ? currentQuote?.auto ?? null : null;
  const canAfford = Boolean(currentQuote && wallet && wallet.available >= currentQuote.maxCredits);
  const send = async () => {
    if (!currentQuote || !canAfford) return;
    if (currentQuote.expiresAt * 1000 <= Date.now()) { setQuote(null); setQuoteRevision(r => r + 1); return; }
    if (await store.send(currentQuote.quote)) { setText(''); setQuote(null); }
    else if (store.state.error?.toLowerCase().includes('vibes') || store.state.error?.includes('Upgrade')) onWallet();
  };
  const consent = async () => {
    try { await store.api.consent(); await store.refresh(); } catch (e) { store.error(e); }
  };
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <View style={[s.top, !onComputer && s.topEnd]}>{onComputer && <Pressable accessibilityRole="button" accessibilityLabel="Use computer agents" onPress={onComputer} style={s.link}>
      <Icon name="desktop-outline" size={16} color={colors.muted} /><Text style={[s.small, { color: colors.muted }]}>Computer agents</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open Vibes balance" onPress={() => workspace.account ? onWallet() : setAccountOpen(true)} style={[s.balance, { backgroundColor: colors.elevated }]}>
        <Icon name="sparkles-outline" size={14} color={colors.accent} /><Text style={[s.small, { color: colors.text }]}>{wallet ? vibes(wallet.available) : 'Free Vibes'}</Text></Pressable></View>
    {turns.length ? <VibesConversation turns={turns} tools={<ProjectTools workspace={workspace} />} /> : <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled" onLayout={e => setCompactEmpty(e.nativeEvent.layout.height < 240)}>
      {!compactEmpty && <View style={[s.spark, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles-outline" size={26} color={colors.accent} /></View>}
      <Text accessibilityRole="header" style={[s.title, compactEmpty && { fontSize: 23, lineHeight: 30 }, { color: colors.text }]}>{compactEmpty ? 'Let’s build something.' : 'From a spark\nto something real.'}</Text>
      {!compactEmpty && <Text style={[s.subtitle, { color: colors.muted }]}>Think it through. Write the code.{'\n'}Find your next good idea.</Text>}
      {!workspace.account && <Button title="Create a free account" onPress={() => setAccountOpen(true)} />}
      {/* The trial is described from the wallet, never from copy: the grant, the
          number of chats it spreads across and the per-chat cap are all enforced in
          `config/vibes.php`, and a sentence here that repeats them is a sentence
          that goes stale the moment they are retuned. */}
      {wallet?.plan === 'free' && !compactEmpty && wallet.trialCredits !== null && wallet.trialChats !== null
        && <Text style={[s.trial, { color: colors.muted }]}>{wallet.trialCredits} free {vibeWord(wallet.trialCredits)} across {wallet.trialChats} {wallet.trialChats === 1 ? 'chat' : 'chats'}</Text>}
    </ScrollView>}
    {wallet && wallet.chatEnabled !== false && !wallet.consented && <View style={[s.consent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.consentTitle, { color: colors.text }]}>Before your first chat</Text>
      <Text style={[s.consentText, { color: colors.muted }]}>Your messages are sent to Vibyra, OpenRouter and your chosen AI provider to answer you. Computer files are not shared in this chat.</Text>
      <Button title="Allow AI processing" onPress={() => void consent()} />
    </View>}
    {wallet && !wallet.verified && <View style={s.notice}><Hint>Verify your email, then refresh to unlock your trial.</Hint><Button secondary title="Refresh account" onPress={() => void store.refresh()} /></View>}
    {wallet?.chatEnabled === false && <View style={s.notice}><Hint>AI chats are being prepared. Your balance and history are safe{onComputer ? ', and computer agents are available' : ''}.</Hint></View>}
    {(error || quoteError || draftError) && <View style={s.notice}><Hint error>{error ?? quoteError ?? draftError}</Hint>
      <Pressable accessibilityRole="button" onPress={() => void store.refresh()} style={s.link}><Text style={{ color: colors.accent }}>Refresh</Text></Pressable></View>}
    {currentQuote && !canAfford && <View style={s.notice}><Button title="Get more Vibes" onPress={onWallet} /></View>}
    {wallet?.consented && onComputer && <Pressable accessibilityRole="button" accessibilityLabel="Attach a project" onPress={() => setProjectOpen(true)} style={[s.link, { paddingHorizontal: 22 }]}><Icon name="folder-outline" size={16} color={colors.muted} /><Text style={[s.small, { color: colors.muted }]}>Use a project</Text></Pressable>}
    <VibesComposer text={text} onChange={setText} onModel={() => setModelOpen(true)}
      model={auto ? 'Auto · ' + auto.name : modelLabel(model, models)} modelHint={auto?.reason}
      effort={steerable ? effortLabel(effort) : auto && currentQuote?.effort ? effortLabel(currentQuote.effort) : null}
      onEffort={steerable ? () => setEffortOpen(true) : undefined} mentions={installed}
      trialRemaining={chat?.trial_slot && wallet?.trialChatCredits != null ? Math.max(0, wallet.trialChatCredits - chat.trial_used) : undefined} maximum={currentQuote?.maxCredits} busy={busy}
      disabled={!ready || !currentQuote || !canAfford || !wallet?.consented} onSend={() => void send()}
      onStop={() => void store.stop().catch(e => store.error(e))} />
    <ProjectSheet visible={projectOpen} onClose={() => setProjectOpen(false)} workspace={workspace} />
    <AgentSheet visible={modelOpen} onClose={() => setModelOpen(false)} selection={model} paid={Boolean(wallet?.paidAvailable)}
      onSelect={id => store.setModel(id)} models={models} onUpgrade={onWallet} />
    <EffortSheet visible={effortOpen} onClose={() => setEffortOpen(false)} model={chosen}
      selection={effort} onSelect={value => store.setEffort(value)} />
    <AccountSheet visible={accountOpen} workspace={workspace} onClose={() => setAccountOpen(false)} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, gap: 8 }, topEnd: { justifyContent: 'flex-end' },
  link: { minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center' }, small: { fontSize: 12 }, balance: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 22 },
  empty: { flexGrow: 1, paddingVertical: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 19 }, spark: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, lineHeight: 41, letterSpacing: -1.2, fontWeight: '500', textAlign: 'center' }, subtitle: { fontSize: 15, lineHeight: 23, textAlign: 'center' }, trial: { fontSize: 12 },
  consent: { padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, marginHorizontal: 18, marginTop: 8 }, consentTitle: { fontSize: 15, fontWeight: '600' },
  consentText: { fontSize: 13, lineHeight: 20 }, notice: { paddingHorizontal: 22, paddingTop: 8, gap: 5 },
});
