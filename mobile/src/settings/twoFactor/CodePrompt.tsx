import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint } from '../../ui/primitives';
import { Field } from '../Field';
import { Group, Label } from '../SettingsRows';
import { CodeInput } from '../../ui/CodeInput';

/**
 * The proof asked for before the second factor is changed or removed: a code from the
 * app, or one recovery code. Not the password — the password is exactly what this
 * exists to survive, so accepting it here would hand the lock back to whoever took it.
 *
 * The recovery box is one tap away rather than hidden, because somebody reaching for
 * it has already lost their phone and is having a bad enough day.
 */
export function CodePrompt({
  title,
  detail,
  action,
  danger,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  detail: string;
  action: string;
  danger?: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
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
    <View>
      <Label first>{title}</Label>
      {recovery ? (
        <Group>
          <Field
            label="Recovery code"
            value={code}
            onChangeText={setCode}
            placeholder="abcde-12345"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!busy}
            onSubmitEditing={() => onSubmit(code)}
            returnKeyType="done"
          />
        </Group>
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
        ) : (
          <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          recovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'
        }
        onPress={swap}
        disabled={busy}
        style={s.swap}
      >
        <Text style={[s.swapText, { color: colors.accent }]}>
          {recovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
        </Text>
      </Pressable>
      <View style={s.actions}>
        <Button
          title={action}
          danger={danger}
          busy={busy}
          disabled={busy || !code.trim()}
          onPress={() => onSubmit(code)}
        />
        <Button title="Cancel" secondary disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  status: { minHeight: 38, justifyContent: 'center', alignItems: 'center', paddingTop: 12 },
  detail: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  swap: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  swapText: { fontSize: 14, fontWeight: '600' },
  actions: { gap: 10, marginTop: 8 },
});
