import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';

/** Download handoff to the computer. Guests can enter an address without signing up. */
export function HostLinkAction({ workspace }: { workspace: WorkspaceModel }) {
  const { colors, dark } = useTheme();
  const known = workspace.account?.email ?? null;
  const [state, setState] = useState<'idle' | 'typing' | 'sending' | 'sent' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const send = async (address?: string) => {
    if (!workspace.actions.sendHostLink) return;
    setState('sending');
    try {
      setMessage(await workspace.actions.sendHostLink(address));
      setState('sent');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The link could not be sent.');
      setState('error');
    }
  };
  const start = () => (known ? void send() : setState('typing'));
  const ready = /\S+@\S+\.\S+/.test(email.trim());
  if (state === 'sent') {
    return (
      <View accessibilityLiveRegion="polite" style={s.stack}>
        <View style={s.linkRow}>
          <Icon name="checkmark" size={16} color={colors.success} />
          <Text style={[s.link, { color: colors.muted }]}>Check your inbox</Text>
        </View>
        <Text style={[s.detail, { color: colors.muted }]}>Sent to {message}</Text>
      </View>
    );
  }
  if (state === 'typing' || (state === 'error' && !known)) {
    return (
      <View style={s.form}>
        <View style={[s.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            autoFocus
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Email address for the download link"
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="send"
            keyboardAppearance={dark ? 'dark' : 'light'}
            onSubmitEditing={() => ready && void send(email.trim())}
            style={[s.input, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send the link"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => void send(email.trim())}
            style={({ pressed }) => [
              s.send,
              {
                backgroundColor: ready ? colors.action : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon name="arrow-forward" size={19} color={ready ? colors.onAction : colors.muted} />
          </Pressable>
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[s.detail, { color: state === 'error' ? colors.error : colors.muted }]}
        >
          {state === 'error' ? message : 'Open the email on your computer to install.'}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.stack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Email me the download link"
        accessibilityHint={
          known
            ? `Send the Vibyra Desktop download link to ${known}`
            : 'Enter your email to get Vibyra Desktop on your computer'
        }
        accessibilityState={{ disabled: state === 'sending', busy: state === 'sending' }}
        disabled={state === 'sending'}
        onPress={start}
        style={({ pressed }) => [s.linkRow, { opacity: pressed ? 0.6 : 1 }]}
      >
        {state === 'sending' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Icon name="mail-outline" size={16} color={colors.accent} />
        )}
        <Text style={[s.link, { color: colors.accent }]}>
          {state === 'sending' ? 'Sending…' : 'Email me the download link'}
        </Text>
      </Pressable>
      {state === 'error' && (
        <Text accessibilityLiveRegion="polite" style={[s.detail, { color: colors.error }]}>
          {message}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 8 },
  linkRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  link: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.1,
    flexShrink: 1,
    textAlign: 'center',
  },
  detail: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  form: { paddingTop: 8, gap: 8 },
  field: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 5,
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 16,
    letterSpacing: -0.2,
    outlineWidth: 0,
    outlineStyle: 'none',
  } as object,
  send: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
