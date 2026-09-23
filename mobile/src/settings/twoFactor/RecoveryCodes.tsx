import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import { Footnote, Group, Label } from '../SettingsRows';
import { keepText } from './keepText';

/**
 * The ten codes that get somebody back in when the phone with the authenticator is
 * lost, broken or wiped. They are shown exactly once — the server keeps them for
 * checking, not for showing again — so this screen says so plainly and puts saving
 * them ahead of leaving.
 *
 * Each one works once. That is the whole idea: a list that could be used twice is a
 * list that is no safer than a password written on the same piece of paper.
 */
export function RecoveryCodes({
  codes,
  account,
  onDone,
  doneLabel = 'Done',
}: {
  codes: string[];
  account: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState(false);
  const save = async () =>
    setSaved(
      await keepText(
        'Vibyra recovery codes',
        `Vibyra recovery codes for ${account}\nEach code works once.\n\n${codes.join('\n')}`,
      ),
    );
  return (
    <View>
      <Label first>Save your recovery codes</Label>
      <Group>
        <View style={s.grid}>
          {codes.map((code) => (
            <Text key={code} selectable style={[s.code, { color: colors.text }]}>
              {code}
            </Text>
          ))}
        </View>
      </Group>
      <Footnote>
        Each code signs you in once, without your authenticator app. Keep them somewhere only you
        can reach — a password manager, or printed and put away.
      </Footnote>
      <View style={s.actions}>
        <Button
          title={saved ? 'Saved' : 'Save these codes'}
          icon={saved ? 'checkmark' : 'share-outline'}
          secondary
          onPress={() => void save()}
        />
        <Button title={doneLabel} onPress={onDone} />
      </View>
      <View style={s.warn}>
        <Icon name="eye-off-outline" size={17} color={colors.muted} />
        <View style={s.warnText}>
          <Hint>This is the only time these codes are shown.</Hint>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, rowGap: 10 },
  code: {
    width: '50%',
    fontSize: 16,
    letterSpacing: 0.6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  actions: { gap: 10, marginTop: 20 },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 16,
    marginHorizontal: 16,
  },
  warnText: { flex: 1 },
});
