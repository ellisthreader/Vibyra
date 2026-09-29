import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { Hint } from '../../ui/primitives';
import type { SettingsPageProps } from '../pages';
import type { AiAccountsMethod, AiAccountsSnapshot } from '../aiAccountsTypes';
import { AiProviderCard } from '../AiProviderCard';
import { Group, Label, Row } from '../SettingsRows';

const moving = (snapshot: AiAccountsSnapshot | null) => snapshot?.providers.some(provider =>
  provider.accounts.some(account => account.status === 'connecting' || account.status === 'installing'));

export function AccountsPage({ workspace, nav, routes }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const [snapshot, setSnapshot] = useState<AiAccountsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const epoch = useRef(0);
  const loading = useRef<number | null>(null);
  const host = workspace.host?.id;
  const available = workspace.status === 'connected' && workspace.aiAccountsAvailable === true;
  const call = workspace.actions.aiAccounts;
  const currentCall = useRef(call); currentCall.current = call;
  const load = useCallback(async () => {
    if (!available || !currentCall.current) return;
    const current = epoch.current;
    if (loading.current === current) return;
    loading.current = current;
    try {
      const next = await currentCall.current('list') as AiAccountsSnapshot;
      if (epoch.current === current) { setSnapshot(next); setError(''); }
    } catch (cause) {
      if (epoch.current === current) setError(String(cause));
    } finally {
      if (loading.current === current) loading.current = null;
    }
  }, [available]);
  useEffect(() => {
    epoch.current++;
    setSnapshot(null);
    setError('');
    setBusy('');
    void load();
    const generation = epoch;
    return () => { generation.current++; };
  }, [host, workspace.account?.email, available, load]);
  useEffect(() => {
    if (!available || busy) return;
    const timer = setInterval(() => { if (AppState.currentState !== 'background') void load(); }, moving(snapshot) ? 1800 : 10000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [snapshot, available, busy, load]);
  const act = async (method: AiAccountsMethod, provider: string, account?: string, value?: string) => {
    if (!call || !available || busy) return;
    const current = ++epoch.current;
    setBusy(`${provider}:${account ?? method}`);
    setError('');
    try {
      const result = await call(method, { provider, account, value });
      if (current !== epoch.current) return;
      if (method === 'signInUrl') {
        const url = (result as { url?: string }).url;
        if (!url?.startsWith('https://')) throw new Error('No secure sign-in page is available yet.');
        await Linking.openURL(url);
      } else if (method !== 'openOnMac') setSnapshot(result as AiAccountsSnapshot);
      if (method === 'openOnMac') await load();
    } catch (cause) {
      if (current === epoch.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === epoch.current) setBusy('');
    }
  };
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
    <Label first>Terminal accounts</Label>
    <Text style={[s.note, { color: colors.muted }]}>
      {host ? `Accounts on ${workspace.host?.name ?? 'this Mac'}. Sign-in and installation run on that computer.` :
        'Connect a Mac to see the AI accounts its terminals use.'}
    </Text>
    {!available && <View style={s.message}><Hint>{workspace.status === 'connected' ?
      'Update Vibyra on this Mac to manage its AI accounts.' : 'Connect your Mac to view its AI accounts.'}</Hint></View>}
    {available && !snapshot && !error && <View style={s.message}><Hint>Checking connected accounts…</Hint></View>}
    {snapshot?.providers.map(provider => <AiProviderCard key={provider.id} provider={provider}
      selected={snapshot.defaults[provider.runtimeId]} busy={busy} canChange={workspace.canManage === true}
      onAction={(method, account, value) => void act(method, provider.id, account, value)} />)}
    {!!error && <View style={s.message}><Hint error>{error}</Hint><Row title="Try again" onPress={() => void load()} /></View>}
    {!available && workspace.status !== 'connected' && <Row title="Connect computer" onPress={() => nav.close(routes.connect)} />}
    <Label>Integrations</Label>
    <Group><Row title="Connected services" detail="GitHub, Google, and other services your chats can use"
      onPress={() => nav.close(routes.plugins)} /></Group>
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6 },
  note: { fontSize: 13, lineHeight: 19, marginHorizontal: 2, marginTop: 3 },
  message: { marginTop: 12 },
});
