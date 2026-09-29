import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { useFundedModels } from '../vibes/useFundedModels';
import { TerminalFunding, type TerminalFundingSource } from './TerminalFunding';
import { FundedTerminalModels } from './FundedTerminalModels';
import { FundedTerminalOptions } from './FundedTerminalOptions';
import { useTheme } from '../theme';
import { font } from './font';
import { useKeyboardOffset } from './keyboardOffset';
import { canStartWork } from './mode';
import { Hint, Icon } from './primitives';
import { ProjectTerminalModels, type TerminalChoice } from './ProjectTerminalModels';
import { ProjectTerminalOptions } from './ProjectTerminalOptions';
import type { Project, TerminalPermission, WorkspaceModel } from './types';
import { useAction } from './useAction';
import { useTerminalModels } from './useTerminalModels';
import { planLimitFrom } from '../vibes/planLimit';
import { usePlanEntitlements } from '../vibes/usePlanEntitlements';

export interface ProjectTerminalLauncherProps {
  onIntegrations?(): void;
  /** Show the real picker during the walkthrough without starting work or saving a source preference. */
  tourPreview?: boolean;
  tourInitialSource?: TerminalFundingSource;
  onWallet?(): void; workspace: WorkspaceModel; project: Project; onConnect(): void; onOpenSession(id: string): void;
}

/** Empty computer folder: choosing an AI never creates a chat or starts work. */
export function ProjectTerminalLauncher({ workspace, project, onConnect, onOpenSession, onWallet, onIntegrations,
  tourPreview = false, tourInitialSource = 'accounts' }: ProjectTerminalLauncherProps) {
  const { colors } = useTheme();
  const keyboardOffset = useKeyboardOffset();
  const [source, setSource] = useState<TerminalFundingSource>(tourInitialSource);
  const funded = useFundedModels(source === 'vibyra');
  const [fundedId, setFundedId] = useState<string | null>(null);
  const [budget, setBudget] = useState('10');
  const touched = useRef(false);
  const sourcesAvailable = !!workspace.fundedTerminalsAvailable && funded.eligible;
  const preferenceKey = `terminal-source:${workspace.account?.email}:${workspace.host?.id}:${project.id}`;
  useEffect(() => {
    if (tourPreview) return;
    let active = true;
    void readFlag(preferenceKey).then(value => {
      if (active && !touched.current && value === 'vibyra') { setSource('vibyra'); setPicking(true); }
    });
    return () => { active = false; };
  }, [preferenceKey, tourPreview]);
  const tokenSource = source === 'vibyra';
  const tokenModel = funded.models.find(m => m.id === fundedId);
  const validBudget = /^\d+$/.test(budget) && Number(budget) >= 1 && Number(budget) <= 1000;
  const catalogue = useTerminalModels(true, workspace);
  const [choice, setChoice] = useState<TerminalChoice | null>(null);
  const [title, setTitle] = useState('');
  const automatic = tokenSource ? fundedId === null : choice === null;
  const [safeMode, setSafeMode] = useState(false);
  const [permission, setPermission] = useState<TerminalPermission>('standard');
  const [picking, setPicking] = useState(tourPreview && tourInitialSource === 'vibyra');
  const scroll = useRef<ScrollView>(null);
  const { busy, error, run, clearError } = useAction();
  const plan = usePlanEntitlements();
  const safeIncluded = plan?.safeWorktrees !== false;
  const limit = planLimitFrom(error);
  const connected = workspace.status === 'connected';
  const permitted = canStartWork(workspace);
  const selected = choice?.model
    ? catalogue.models.some(model => model.id === choice.id) ? choice : undefined
    : choice ?? undefined;
  const disabled = tourPreview || busy || picking || !connected || !permitted || (tokenSource
    ? !sourcesAvailable || !funded.priced || !(automatic ? funded.models.some(m => m.available) : tokenModel?.available) || !validBudget || !funded.wallet?.consented || funded.wallet.available <= 0 || funded.loading
    : (automatic ? !catalogue.models.length || !catalogue.efforts : !selected) || (selected?.kind !== 'shell' && permission === 'full' && !catalogue.permissions));
  const launch = () => {
    if (disabled) return;
    Keyboard.dismiss();
    void run(async () => {
      const session = automatic
        ? await workspace.actions.createSession(project.id, 'vibyra', title.trim() || 'Vibyra Auto', {
          automatic: true, source, budget: Number(budget), safeMode: safeIncluded && safeMode,
          ...(catalogue.permissions ? { permissionMode: permission } : {}),
        }) : tokenSource && tokenModel
        ? await workspace.actions.createSession(project.id, 'vibyra', title.trim() || tokenModel.name, {
          source: 'vibyra', model: tokenModel.id, tools: tokenModel.tools, budget: Number(budget),
        }) : selected ? await workspace.actions.createSession(project.id, selected.kind, title.trim() || selected.name, {
          safeMode: safeIncluded && safeMode, ...(selected.model ? { model: selected.id } : {}),
          ...(selected.kind !== 'shell' && catalogue.permissions ? { permissionMode: permission } : {}),
        }) : null;
      if (session) onOpenSession(session.id);
    });
  };
  return <KeyboardAvoidingView style={s.page} testID="project-terminal-launcher"
    behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
    <TerminalFunding value={source} balance={funded.wallet?.available} disabled={busy}
      onChange={value => { if (source === value) return; touched.current = true; setSource(value); setPicking(value === 'vibyra'); clearError();
        if (!tourPreview) void writeFlag(preferenceKey, value); }} />
    <ScrollView ref={scroll} scrollEnabled={!picking} contentContainerStyle={[s.content, picking && s.pickerPage]} keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}>
      {tokenSource && funded.loading && <ActivityIndicator accessibilityLabel="Loading token models" color={colors.accent} />}
      {tokenSource && funded.error && <View><Hint error>{funded.error}</Hint>
        <Pressable accessibilityRole="button" onPress={funded.refresh} style={s.retry}><Text style={[font.row, { color: colors.accent }]}>Try again</Text></Pressable></View>}
      {!picking && !tokenSource && catalogue.loading && <ActivityIndicator accessibilityLabel="Loading computer models" color={colors.accent} />}
      {!picking && !tokenSource && catalogue.error && <View><Hint error>{catalogue.error}</Hint>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading models" onPress={catalogue.refresh} style={s.retry}>
          <Text style={[font.row, { color: colors.accent }]}>Try again</Text>
        </Pressable></View>}
      {tokenSource ? <FundedTerminalModels models={funded.models} selected={tokenModel} automatic={automatic} chooseAuto={() => { setFundedId(null); clearError(); }} disabled={busy} picking={picking} browseOnly={!funded.priced} loading={funded.loading}
        choose={model => { setFundedId(model.id); clearError(); }}
        onPickingChange={open => { setPicking(open); scroll.current?.scrollTo({ y: 0, animated: false }); }} /> : <ProjectTerminalModels models={catalogue.models} supported={catalogue.supported} selected={selected} automatic={automatic} chooseAuto={() => { setChoice(null); clearError(); }} disabled={busy}
        loading={catalogue.loading} error={catalogue.error} onIntegrations={onIntegrations} onPickingChange={open => { setPicking(open); scroll.current?.scrollTo({ y: 0, animated: false }); }}
        refresh={catalogue.refresh} choose={next => { setChoice(next); clearError();
          if (!['codex', 'claude', 'gemini'].includes(next.kind)) setPermission('standard'); }} />}
      {!picking && automatic && !tokenSource && !catalogue.efforts && !catalogue.loading && <Hint>Update Vibyra on your computer to use Vibyra Auto.</Hint>}
      <View style={[s.options, { borderColor: colors.border, display: picking ? 'none' : 'flex' }]}>
        {tokenSource ? <FundedTerminalOptions title={title} setTitle={setTitle} budget={budget} setBudget={setBudget} disabled={busy} /> : <ProjectTerminalOptions title={title} setTitle={setTitle} safeMode={safeMode} setSafeMode={setSafeMode} disabled={busy} safeIncluded={safeIncluded}
          permission={permission} setPermission={setPermission} permissionsAvailable={catalogue.permissions}
          fullAvailable={automatic || !!selected && ['codex', 'claude', 'gemini'].includes(selected.kind)} shell={selected?.kind === 'shell'} />}
      </View>
      {!picking && tokenSource && !validBudget && <Hint>Choose a session limit from 1 to 1,000 tokens.</Hint>}
      {!picking && tokenSource && funded.wallet && !funded.wallet.consented && <View style={s.hero}>
        <Hint>Your messages and approved project files are sent to Vibyra, OpenRouter and your chosen AI provider.</Hint>
        <Pressable accessibilityRole="button" disabled={busy || tourPreview}
          onPress={() => void run(async () => { await funded.store!.api.consent(); await funded.store!.refresh(); })} style={s.retry}>
          <Text style={[font.row, { color: colors.accent }]}>Allow AI processing</Text></Pressable></View>}
      {!picking && tokenSource && funded.wallet && funded.wallet.available <= 0 && onWallet && <Pressable accessibilityRole="button" onPress={onWallet} style={s.retry}>
        <Text style={[font.row, { color: colors.accent }]}>Get Vibyra tokens</Text></Pressable>}
      {!picking && tokenSource && (!sourcesAvailable || !funded.priced) && <Hint>{!funded.eligible
        ? ['pro', 'pro_v2'].includes(funded.wallet?.plan ?? '')
          ? 'Token launching is unavailable.'
          : 'Vibyra tokens require Pro.'
        : !workspace.fundedTerminalsAvailable ? 'Update Vibyra on your computer.'
        : 'Token launching is unavailable. Try again.'}</Hint>}
      {!picking && error && (limit ? <View style={s.hero} testID="terminal-plan-limit">
        <Hint>{limit.message}</Hint>
        {onWallet && <Pressable accessibilityRole="button" onPress={onWallet} style={s.retry}>
          <Text style={[font.row, { color: colors.accent }]}>See Vibyra Pro</Text></Pressable>}
      </View> : <Hint error>{error}</Hint>)}
      {!picking && !connected && <Hint>Connect your computer to continue.</Hint>}
      {!picking && connected && !permitted && <Hint>Turn on Typing from your phone in Vibyra on your computer to start a terminal.</Hint>}
    </ScrollView>
    {!picking && <View style={[s.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={connected ? 'Launch terminal' : 'Connect computer'}
        accessibilityState={{ disabled: connected ? disabled : busy, busy }} disabled={connected ? disabled : busy}
        onPress={connected ? launch : onConnect}
        style={({ pressed }) => [s.launch, { backgroundColor: colors.action, opacity: (connected && disabled) || pressed ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Icon name={connected ? 'arrow-up-outline' : 'laptop-outline'} size={20} color="#fff" />}
        <Text style={[font.headline, { color: '#fff' }]}>{busy ? 'Starting…' : connected ? 'Launch terminal' : 'Connect computer'}</Text>
      </Pressable>
    </View>}
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  page: { flex: 1, minHeight: 0 }, content: { padding: 20, paddingTop: 8, gap: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { gap: 6 },
  pickerPage: { flex: 1, gap: 0, paddingTop: 0 },
  options: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  retry: { minHeight: 44, justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  launch: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
