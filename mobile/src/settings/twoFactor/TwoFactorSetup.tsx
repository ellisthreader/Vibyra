import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint } from '../../ui/primitives';
import { QrCode } from '../../ui/QrCode';
import type { TwoFactorSetup as Setup } from '../../ui/types';
import { Footnote, Group, Label } from '../SettingsRows';
import { installedAuthenticators, openSetupLink, type Authenticator } from './authenticators';
import { CodeInput } from '../../ui/CodeInput';

/**
 * Setting the second factor up, in the order the phone makes possible.
 *
 * The fast way is first: one tap hands the setup link to the authenticator already on
 * this phone, which fills in the account itself — no typing, no reading a secret off
 * one screen and into another. The QR code below it is for an authenticator that is
 * somewhere else, and the key below that is for one that can do neither. All three
 * carry the same secret, so any of them finishes the job.
 *
 * The code box is the point of all of it: nothing is switched on until the app and
 * the server agree on a code, which is the only proof the setup actually took.
 */
export function TwoFactorSetup({
  setup,
  busy,
  error,
  onConfirm,
}: {
  setup: Setup;
  busy: boolean;
  error: string | null;
  onConfirm: (code: string) => void;
}) {
  const { colors } = useTheme();
  const [apps, setApps] = useState<Authenticator[] | null>(null);
  const [opened, setOpened] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    void installedAuthenticators().then(setApps);
  }, []);
  // A code the server refused is cleared, so the boxes are ready for the next one
  // rather than asking somebody to delete six digits before they can try again.
  useEffect(() => {
    if (error) setCode('');
  }, [error]);
  const open = useCallback(async () => {
    setOpened(await openSetupLink(setup.uri));
  }, [setup.uri]);
  const first = apps?.[0];
  const named = first && first.id !== 'any' ? first.name : 'Your authenticator';
  return (
    <View style={s.page}>
      {apps === null ? (
        <View style={s.checking}>
          <ActivityIndicator
            color={colors.muted}
            accessibilityLabel="Looking for your authenticator app"
          />
        </View>
      ) : first ? (
        <View style={s.launch}>
          <Button
            title={first.id === 'any' ? 'Open my authenticator app' : `Set up in ${first.name}`}
            icon="open-outline"
            onPress={() => void open()}
          />
          <Footnote>
            {opened === true
              ? `${named} has this account ready to add. Come back here for the code it shows.`
              : opened === false
                ? 'That app didn’t open. Scan the code below instead, or type the key in by hand.'
                : 'Opens the app with this account filled in. Nothing to type.'}
          </Footnote>
        </View>
      ) : null}
      <Label first={!first && apps !== null}>
        {first ? 'Or scan on another device' : 'Scan with your authenticator'}
      </Label>
      <View style={s.code}>
        <QrCode value={setup.uri} label={`Setup code for ${setup.account}`} />
      </View>
      <Label>Setup key</Label>
      <Group>
        <View style={s.key}>
          <Text
            selectable
            accessibilityLabel={`Setup key ${grouped(setup.secret).split('').join(' ')}`}
            style={[s.keyText, { color: colors.text }]}
          >
            {grouped(setup.secret)}
          </Text>
        </View>
      </Group>
      <Footnote>Type this in by hand if an app can’t scan. Treat it like a password.</Footnote>
      <Label>Enter the code from your app</Label>
      <CodeInput value={code} onChange={setCode} onComplete={onConfirm} busy={busy} />
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
          <Text style={[s.waiting, { color: colors.muted }]}>
            Two-factor turns on as soon as the code matches.
          </Text>
        )}
      </View>
    </View>
  );
}
/** The key in fours, which is how anybody copying it by hand keeps their place. */
const grouped = (secret: string) => (secret.match(/.{1,4}/g) ?? [secret]).join(' ');
const s = StyleSheet.create({
  page: { gap: 0 },
  checking: { paddingVertical: 24, alignItems: 'center' },
  launch: { paddingTop: 4 },
  code: { alignItems: 'center', paddingVertical: 4 },
  key: { paddingHorizontal: 16, paddingVertical: 14 },
  keyText: { fontSize: 17, letterSpacing: 1.5, textAlign: 'center', fontVariant: ['tabular-nums'] },
  status: { minHeight: 40, justifyContent: 'center', alignItems: 'center', paddingTop: 12 },
  waiting: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
