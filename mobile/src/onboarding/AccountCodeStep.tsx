import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from '../ui/primitives';
import { CodeInput } from '../ui/CodeInput';

/**
 * The second half of a login: the password was right, and this account asks for the
 * code as well. It is a step, not an error — so it says what to do rather than what
 * went wrong, and Back returns to the password with nothing lost.
 *
 * A complete code goes on its own. The recovery box is here too, one tap away,
 * because the person who needs it is the one who no longer has the app.
 */
export function AccountCodeStep({
  email,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (error) setCode('');
  }, [error]);
  const swap = () => {
    setRecovery((value) => !value);
    setCode('');
  };
  return (
    <View style={s.form}>
      <View style={s.head}>
        <View style={[s.badge, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Icon name="shield-checkmark-outline" size={24} color={colors.accent} />
        </View>
        <Text style={[s.title, { color: colors.text }]}>Enter your code</Text>
        <Text style={[s.line, { color: colors.muted }]}>
          {recovery
            ? `One of the recovery codes you saved for ${email}.`
            : `Open your authenticator app and enter the six-digit code for ${email}.`}
        </Text>
      </View>
      {recovery ? (
        <TextInput
          accessibilityLabel="Recovery code"
          value={code}
          onChangeText={setCode}
          placeholder="abcde-12345"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={() => onSubmit(code)}
          style={[
            s.recovery,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
      ) : (
        <CodeInput value={code} onChange={setCode} onComplete={onSubmit} busy={busy} autoFocus />
      )}
      <View style={s.status} accessibilityLiveRegion="polite">
        {busy ? (
          <ActivityIndicator
            size="small"
            color={colors.muted}
            accessibilityLabel="Checking your code"
          />
        ) : error ? (
          <Hint error>{error}</Hint>
        ) : null}
      </View>
      <Button
        title="Log in"
        busy={busy}
        disabled={busy || !code.trim()}
        onPress={() => onSubmit(code)}
      />
      <View style={s.links}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          accessibilityLabel={
            recovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'
          }
          onPress={swap}
          style={s.link}
        >
          <Text style={[s.linkText, { color: colors.accent }]}>
            {recovery ? 'Use your authenticator app' : 'Use a recovery code'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={busy}
          onPress={onBack}
          style={s.link}
        >
          <Text style={[s.linkText, { color: colors.muted }]}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  form: { gap: 16 },
  head: { alignItems: 'center', gap: 8 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4 },
  line: { fontSize: 14, lineHeight: 20, letterSpacing: -0.1, textAlign: 'center', maxWidth: 320 },
  recovery: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    textAlign: 'center',
    letterSpacing: 1,
  },
  status: { minHeight: 26, justifyContent: 'center', alignItems: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: -6 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
});
