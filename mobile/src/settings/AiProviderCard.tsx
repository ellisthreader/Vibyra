import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandLogo } from '../ui/BrandLogo';
import { confirmAction } from '../ui/confirm';
import type { AiAccount, AiAccountsMethod, AiProvider } from './aiAccountsTypes';

interface Props {
  provider: AiProvider;
  selected?: string;
  busy: string;
  canChange: boolean;
  onAction(method: AiAccountsMethod, account?: string, value?: string): void;
}

export function AiProviderCard({ provider, selected, busy, canChange, onAction }: Props) {
  const { colors } = useTheme();
  const connected = provider.accounts.filter(account => account.status === 'connected');
  const effective = connected.find(account => account.accountId === selected)?.accountId ?? connected[0]?.accountId;
  const name = { codex: 'openai', claude: 'anthropic', gemini: 'google' }[provider.id];
  return <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={s.head}>
      <BrandLogo vendor={name} size={34} />
      <View style={s.identity}>
        <Text style={[s.company, { color: colors.text }]}>{provider.company}</Text>
        <Text style={[s.subtitle, { color: colors.muted }]}>{provider.product} · {connected.length ?
          `${connected.length} signed in` : provider.installed ? 'Sign-in needed' : 'App needed on Mac'}</Text>
      </View>
      {provider.installed && connected.length > 0 && provider.canAddAccount && <SmallAction title="Add"
        disabled={!canChange || !!busy} onPress={() => onAction('add')} />}
      {!provider.installed && <SmallAction title="Install" disabled={!canChange || !!busy}
        onPress={() => onAction('install')} />}
    </View>
    {provider.accounts.map((account, index) => <AccountRow key={account.accountId}
      provider={provider} account={account} index={index} selected={account.accountId === effective}
      busy={!!busy} canChange={canChange} onAction={onAction} />)}
    {!canChange && <Text style={[s.gate, { color: colors.muted }]}>
      Turn on Typing from your phone in Mac Settings to change these accounts.
    </Text>}
  </View>;
}

function AccountRow({ provider, account, index, selected, busy, canChange, onAction }: {
  provider: AiProvider; account: AiAccount; index: number; selected: boolean; busy: boolean;
  canChange: boolean; onAction: Props['onAction'];
}) {
  const { colors } = useTheme();
  const [reply, setReply] = useState('');
  const connected = account.status === 'connected';
  const working = account.status === 'connecting' || account.status === 'installing';
  const label = connected && account.accountLabel ? account.accountLabel :
    index === 0 ? 'First account' : `Account ${index + 1}`;
  const perform = (method: AiAccountsMethod, value?: string) => onAction(method, account.accountId, value);
  const remove = () => confirmAction('Remove this account?',
    `This removes the ${provider.product} login held on this Mac.`, 'Remove', () => perform('remove'));
  const disconnect = () => confirmAction('Sign out of this account?',
    `${provider.product} terminals on this Mac will need another signed-in account.`, 'Sign out',
    () => perform('disconnect'));
  return <View style={[s.account, { borderTopColor: colors.border }]}>
    <Pressable disabled={!connected || !canChange || selected || busy}
      accessibilityRole={connected ? 'radio' : undefined} accessibilityState={{ selected, disabled: !connected || !canChange }}
      accessibilityLabel={`${label}, ${account.status}${selected ? ', default' : ''}`}
      onPress={() => perform('setDefault')} style={s.accountIdentity}>
      <Text style={[s.tick, { color: selected ? colors.accent : colors.muted }]}>{selected ? '✓' : '○'}</Text>
      <View style={s.identity}>
        <Text style={[s.accountName, { color: colors.text }]}>{label}</Text>
        <Text style={[s.detail, { color: colors.muted }]}>{account.detail}</Text>
      </View>
    </Pressable>
    <View style={s.actions}>
      {connected && <SmallAction title="Sign out" disabled={!canChange || busy} onPress={disconnect} />}
      {!connected && provider.installed && !working && <SmallAction title="Sign in"
        disabled={!canChange || busy} onPress={() => perform('connect')} />}
      {working && <SmallAction title="Cancel" disabled={!canChange || busy}
        onPress={() => perform('cancel')} />}
      {account.removable && !connected && !working && <SmallAction title="Remove"
        disabled={!canChange || busy} onPress={remove} />}
      {account.status === 'connecting' && provider.id === 'codex' && account.signInPageAvailable &&
        !!account.deviceCode && <SmallAction title="Open on iPhone"
        disabled={!canChange || busy} onPress={() => perform('signInUrl')} />}
      {account.status === 'connecting' && provider.id !== 'codex' && account.signInPageAvailable &&
        <SmallAction title="Continue on Mac" disabled={!canChange || busy}
          onPress={() => perform('openOnMac')} />}
    </View>
    {account.status === 'connecting' && provider.id === 'codex' && !!account.deviceCode &&
      <View style={s.deviceCode}>
        <Text style={[s.detail, { color: colors.muted }]}>Enter this code on the sign-in page:</Text>
        <Text selectable accessibilityLabel={`Sign-in code ${account.deviceCode}`}
          style={[s.code, { color: colors.text }]}>{account.deviceCode}</Text>
      </View>}
    {!!account.prompt && <View style={s.prompt}>
      <Text style={[s.detail, { color: colors.muted }]}>{account.prompt}</Text>
      <View style={s.replyRow}>
        <TextInput value={reply} onChangeText={setReply} placeholder="Provider answer"
          placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false}
          style={[s.reply, { color: colors.text, borderColor: colors.border }]} />
        <SmallAction title="Send" disabled={!canChange || busy || !reply.trim()}
          onPress={() => { perform('submit', reply.trim()); setReply(''); }} />
      </View>
    </View>}
  </View>;
}

function SmallAction({ title, disabled, onPress }: { title: string; disabled: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, { backgroundColor: colors.elevated,
      opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
    <Text style={[s.actionText, { color: colors.text }]}>{title}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  card: { marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  head: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  identity: { flex: 1, minWidth: 0 },
  company: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  account: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  accountIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 38 },
  tick: { width: 16, fontSize: 16, fontWeight: '700' },
  accountName: { fontSize: 14, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginLeft: 25, marginTop: 5 },
  action: { minHeight: 34, paddingHorizontal: 11, borderRadius: 8, justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '600' },
  gate: { marginHorizontal: 14, marginBottom: 12, fontSize: 12, lineHeight: 17 },
  prompt: { marginLeft: 25, marginTop: 9, gap: 7 },
  deviceCode: { marginLeft: 25, marginTop: 9, gap: 2 },
  code: { fontSize: 18, fontWeight: '700', letterSpacing: 1.2 },
  replyRow: { flexDirection: 'row', gap: 7 },
  reply: { flex: 1, borderWidth: 1, borderRadius: 8, minHeight: 36, paddingHorizontal: 8 },
});
