import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';

/**
 * Emails a link for installing Vibyra on a computer, because the phone cannot put
 * software there itself.
 *
 * A phone that already knows its address never asks for it again: one tap sends.
 * A guest is asked once, in this same spot, rather than being sent away to sign up
 * — pairing has never required an account and this step should not either.
 */
export function HostLinkAction({ workspace }: { workspace: WorkspaceModel }) {
  const { colors, dark } = useTheme();
  const known = workspace.account?.email ?? null;
  const [state, setState] = useState<'idle' | 'typing' | 'sending' | 'sent' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const send = async (address?: string) => {
    if (!workspace.actions.sendHostLink) return;
    setState('sending');
    try { setMessage(await workspace.actions.sendHostLink(address)); setState('sent'); }
    catch (error) {
      setMessage(error instanceof Error ? error.message : 'The link could not be sent.');
      setState('error');
    }
  };
  const start = () => (known ? void send() : setState('typing'));
  const ready = /\S+@\S+\.\S+/.test(email.trim());
  if (state === 'sent') {
    return <View style={s.row}>
      <Icon name="checkmark-circle" size={17} color={colors.success} />
      <Text style={[s.note, { color: colors.muted }]}>Sent to {message}</Text>
    </View>;
  }
  if (state === 'typing' || (state === 'error' && !known)) {
    return <View style={s.stack}>
      <View style={[s.field, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
        <TextInput autoFocus value={email} onChangeText={setEmail} accessibilityLabel="Email address for the download link"
          placeholder="you@example.com" placeholderTextColor={colors.muted} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" returnKeyType="send"
          keyboardAppearance={dark ? 'dark' : 'light'} onSubmitEditing={() => ready && void send(email.trim())}
          style={[s.input, { color: colors.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send the link"
          accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => void send(email.trim())}
          style={[s.send, { backgroundColor: ready ? colors.action : colors.border }]}>
          <Icon name="arrow-forward" size={17} color={ready ? colors.onAction : colors.muted} />
        </Pressable>
      </View>
      {state === 'error' && <Text style={[s.note, { color: colors.error }]}>{message}</Text>}
    </View>;
  }
  return <View style={s.stack}>
    <Pressable accessibilityRole="button" accessibilityLabel="Send me an email link"
      accessibilityState={{ disabled: state === 'sending', busy: state === 'sending' }}
      disabled={state === 'sending'} onPress={start}
      style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
      {state === 'sending' && <ActivityIndicator size="small" color={colors.accent} />}
      <Text style={[s.link, { color: colors.accent }]}>{state === 'sending' ? 'Sending…' : 'Send me an email link'}</Text>
    </Pressable>
    {state === 'error' && <Text style={[s.note, { color: colors.error }]}>{message}</Text>}
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 6 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  link: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 20 },
  field: { minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 5, gap: 8 },
  input: { flex: 1, minHeight: 48, fontSize: 15, outlineWidth: 0 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
