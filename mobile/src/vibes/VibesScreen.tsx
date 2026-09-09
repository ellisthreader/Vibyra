import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { AccountSheet } from '../ui/AccountSheet';
import { AgentSheet } from '../ui/AgentSheet';
import { modelLabel } from '../ui/agents';
import { Button, Hint, Icon } from '../ui/primitives';
import { setDraftForScope, useDraft } from '../ui/useDraft';
import type { WorkspaceModel } from '../ui/types';
import { useVibes } from './VibesProvider';
import { ProjectSheet } from './ProjectSheet';
import { ProjectTools } from './ProjectTools';
import { WalletSheet } from './WalletSheet';
import { VibesComposer } from './VibesComposer';
import { VibesConversation } from './VibesConversation';
import { activeTurn, type VibesQuote } from './types';

export function VibesScreen({ workspace, onComputer }: { workspace: WorkspaceModel; onComputer(): void }) {
  const { colors } = useTheme(); const { store, wallet, chats, turns, model, models, selected, draftScope, pending, ready, error } = useVibes();
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
  const [modelOpen, setModelOpen] = useState(false); const [walletOpen, setWalletOpen] = useState(false); const [accountOpen, setAccountOpen] = useState(false);
  const [quote, setQuote] = useState<{ text: string; model: string; value: VibesQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null); const quoting = useRef(0);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const busy = Boolean(pending || turns.some(activeTurn));
  useEffect(() => {
    const version = ++quoting.current; setQuote(null); setQuoteError(null);
    if (!text.trim() || !ready || busy || !wallet?.consented || !wallet.verified || wallet.chatEnabled === false) return;
    const timer = setTimeout(() => {
      void store.chat(text).then(id => store.api.quote(id, text.trim(), model)).then(value => {
        if (version === quoting.current) setQuote({ text, model, value });
      }).catch(e => { if (version === quoting.current) setQuoteError(e.message); });
    }, 650);
    return () => { clearTimeout(timer); ++quoting.current; };
  }, [text, model, selected, ready, busy, wallet?.consented, wallet?.verified, wallet?.chatEnabled, store, quoteRevision]);
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteRevision(r => r + 1), Math.max(0, quote.value.expiresAt * 1000 - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [quote]);
  const currentQuote = quote?.text === text && quote.model === model ? quote.value : null;
  const canAfford = Boolean(currentQuote && wallet && wallet.available >= currentQuote.maxCredits);
  const send = async () => {
    if (!currentQuote || !canAfford) return;
    if (currentQuote.expiresAt * 1000 <= Date.now()) { setQuote(null); setQuoteRevision(r => r + 1); return; }
    if (await store.send(currentQuote.quote)) { setText(''); setQuote(null); }
    else if (store.state.error?.toLowerCase().includes('vibes') || store.state.error?.includes('Upgrade')) setWalletOpen(true);
  };
  const consent = async () => {
    try { await store.api.consent(); await store.refresh(); } catch (e) { store.error(e); }
  };
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.top}><Pressable accessibilityRole="button" accessibilityLabel="Use computer agents" onPress={onComputer} style={s.link}>
      <Icon name="desktop-outline" size={16} color={colors.muted} /><Text style={[s.small, { color: colors.muted }]}>Computer agents</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open Vibes balance" onPress={() => wallet ? setWalletOpen(true) : setAccountOpen(true)} style={[s.balance, { backgroundColor: colors.elevated }]}>
        <Icon name="sparkles-outline" size={14} color={colors.accent} /><Text style={[s.small, { color: colors.text }]}>{wallet ? wallet.available + ' Vibes' : '100 free Vibes'}</Text></Pressable></View>
    {turns.length ? <VibesConversation turns={turns} tools={<ProjectTools workspace={workspace} />} /> : <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled" onLayout={e => setCompactEmpty(e.nativeEvent.layout.height < 240)}>
      {!compactEmpty && <View style={[s.spark, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles-outline" size={26} color={colors.accent} /></View>}
      <Text accessibilityRole="header" style={[s.title, compactEmpty && { fontSize: 23, lineHeight: 30 }, { color: colors.text }]}>{compactEmpty ? 'Let’s build something.' : 'From a spark\nto something real.'}</Text>
      {!compactEmpty && <Text style={[s.subtitle, { color: colors.muted }]}>Think it through. Write the code.{'\n'}Find your next good idea.</Text>}
      {!workspace.account && <Button title="Get your 100 free Vibes" onPress={() => setAccountOpen(true)} />}
      {wallet?.plan === 'free' && !compactEmpty && <Text style={[s.trial, { color: colors.muted }]}>2 trial chats · up to 50 Vibes each</Text>}
    </ScrollView>}
    {wallet && wallet.chatEnabled !== false && !wallet.consented && <View style={[s.consent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.consentTitle, { color: colors.text }]}>Before your first chat</Text>
      <Text style={[s.consentText, { color: colors.muted }]}>Your messages are sent to Vibyra, OpenRouter and your chosen AI provider to answer you. Computer files are not shared in this chat.</Text>
      <Button title="Allow AI processing" onPress={() => void consent()} />
    </View>}
    {wallet && !wallet.verified && <View style={s.notice}><Hint>Verify your email, then refresh to unlock your trial.</Hint><Button secondary title="Refresh account" onPress={() => void store.refresh()} /></View>}
    {wallet?.chatEnabled === false && <View style={s.notice}><Hint>AI chats are being prepared. Your balance and history are safe, and computer agents are available.</Hint></View>}
    {(error || quoteError || draftError) && <View style={s.notice}><Hint error>{error ?? quoteError ?? draftError}</Hint>
      <Pressable accessibilityRole="button" onPress={() => void store.refresh()} style={s.link}><Text style={{ color: colors.accent }}>Refresh</Text></Pressable></View>}
    {currentQuote && !canAfford && <View style={s.notice}><Button title="Get more Vibes" onPress={() => setWalletOpen(true)} /></View>}
    {wallet?.consented && <Pressable accessibilityRole="button" accessibilityLabel="Attach a project" onPress={() => setProjectOpen(true)} style={[s.link, { paddingHorizontal: 22 }]}><Icon name="folder-outline" size={16} color={colors.muted} /><Text style={[s.small, { color: colors.muted }]}>Use a project</Text></Pressable>}
    <VibesComposer text={text} onChange={setText} model={modelLabel(model, models)} onModel={() => setModelOpen(true)}
      trialRemaining={chat?.trial_slot ? Math.max(0, 50 - chat.trial_used) : undefined} maximum={currentQuote?.maxCredits} busy={busy}
      disabled={!ready || !currentQuote || !canAfford || !wallet?.consented} onSend={() => void send()}
      onStop={() => void store.stop().catch(e => store.error(e))} />
    <ProjectSheet visible={projectOpen} onClose={() => setProjectOpen(false)} workspace={workspace} />
    <AgentSheet visible={modelOpen} onClose={() => setModelOpen(false)} selection={model} paid={Boolean(wallet?.paidAvailable)}
      onSelect={id => store.update({ model: id })} models={models} />
    <WalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    <AccountSheet visible={accountOpen} workspace={workspace} onClose={() => setAccountOpen(false)} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, gap: 8 },
  link: { minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center' }, small: { fontSize: 12 }, balance: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 22 },
  empty: { flexGrow: 1, paddingVertical: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 19 }, spark: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, lineHeight: 41, letterSpacing: -1.2, fontWeight: '500', textAlign: 'center' }, subtitle: { fontSize: 15, lineHeight: 23, textAlign: 'center' }, trial: { fontSize: 12 },
  consent: { padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, marginHorizontal: 18, marginTop: 8 }, consentTitle: { fontSize: 15, fontWeight: '600' },
  consentText: { fontSize: 13, lineHeight: 20 }, notice: { paddingHorizontal: 22, paddingTop: 8, gap: 5 },
});
