import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, Icon } from '../../ui/primitives';
import type { TwoFactorState } from '../../ui/types';
import { Footnote, Group, Label, Row } from '../SettingsRows';

const since = (when: string | null) => {
  const date = when ? new Date(when) : null;
  return date && !Number.isNaN(date.getTime())
    ? `Since ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined;
};

/**
 * Where the page rests: off with the case for turning it on, or on with what that
 * now means. The case is made in one sentence about what actually happens — a
 * stolen password stops being enough — rather than in the language of security
 * settings, which nobody enables anything because of.
 */
export function TwoFactorOff({ busy, error, onStart }: { busy: boolean; error: string | null; onStart: () => void }) {
  const { colors } = useTheme();
  return <View>
    <View style={[s.hero, { backgroundColor: colors.accentSoft }]}>
      <Icon name="shield-checkmark-outline" size={30} color={colors.accent} />
      <Text style={[s.heroTitle, { color: colors.text }]}>A second step to sign in</Text>
      <Text style={[s.heroLine, { color: colors.muted }]}>
        With this on, your password alone can’t open your account. Signing in on a new
        device also asks for a six-digit code from an app on your phone — one that
        changes every thirty seconds and never travels over email or SMS.</Text>
    </View>
    <View style={s.points}>
      {[['flash-outline', 'Set up in one tap', 'Vibyra opens your authenticator app with this account ready to add.'],
        ['wifi-outline', 'Works without signal', 'The codes are worked out on your phone, so a plane or a dead zone changes nothing.'],
        ['key-outline', 'Ten recovery codes', 'Kept for the day the phone with the app isn’t in your hand.']].map(([icon, title, line]) =>
        <View key={title} style={s.point}>
          <Icon name={icon as 'flash-outline'} size={19} color={colors.accent} />
          <View style={s.pointText}>
            <Text style={[s.pointTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[s.pointLine, { color: colors.muted }]}>{line}</Text>
          </View>
        </View>)}
    </View>
    {error && <View style={s.notice}><Hint error>{error}</Hint></View>}
    <Button title="Turn on two-factor" busy={busy} disabled={busy} onPress={onStart} />
  </View>;
}

/** On: when it started, what is left to fall back on, and the two ways to change it. */
export function TwoFactorOn({ detail, onRenew, onDisable }: {
  detail: TwoFactorState; onRenew: () => void; onDisable: () => void;
}) {
  const { colors } = useTheme();
  const left = detail.recoveryCodesLeft;
  return <View>
    <Label first>Two-factor authentication</Label>
    <Group>
      {/* The date belongs under the row, not squeezed into the column on the right,
          where a long month name is cut off rather than read. */}
      <Row title="Status" value="On" dot={colors.success} detail={since(detail.confirmedAt)} />
      <Row title="Recovery codes" value={`${left} left`}
        detail={left === 0 ? 'None left. Get a new set before you need one.'
          : left <= 3 ? 'Running low. A new set retires the old ones.' : undefined} />
    </Group>
    <Footnote>Signing in on a new device asks for a code from your authenticator app.</Footnote>
    <View style={s.actions}>
      <Button title="Get new recovery codes" secondary onPress={onRenew} />
    </View>
    <Group style={s.danger}>
      <Row title="Turn off two-factor" danger onPress={onDisable} trailing="none" />
    </Group>
    <Footnote>Your password alone would open your account again.</Footnote>
  </View>;
}

/** The server could not be asked. Never drawn as "off": that would invite somebody to
 *  set up a second factor they may already have. */
export function TwoFactorUnknown({ problem, onRetry }: { problem: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return <View style={s.elsewhere}>
    <Text style={[s.heroTitle, { color: colors.text }]}>Your security settings couldn’t be loaded</Text>
    <Text style={[s.heroLine, { color: colors.muted }]}>{problem}</Text>
    <View style={s.retry}><Button title="Try again" secondary onPress={onRetry} /></View>
  </View>;
}

/** An Apple or Google account, whose second step is the provider's to ask for. */
export function TwoFactorElsewhere({ provider }: { provider: string }) {
  return <TwoFactorNote title={`Managed by ${provider}`}
    line={`You sign in to Vibyra with ${provider}, so ${provider} is where a second step belongs.`
      + ` Turn it on in your ${provider} account and it protects your Vibyra account too.`} />;
}

/** One calm explanation with the shield above it, for the states with nothing to do. */
export function TwoFactorNote({ title, line }: { title: string; line: string }) {
  const { colors } = useTheme();
  return <View style={s.elsewhere}>
    <Icon name="shield-checkmark-outline" size={28} color={colors.muted} />
    <Text style={[s.heroTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[s.heroLine, { color: colors.muted }]}>{line}</Text>
  </View>;
}
const s = StyleSheet.create({
  hero: { borderRadius: 16, padding: 18, gap: 8, alignItems: 'center', marginTop: 4 },
  heroTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  heroLine: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  points: { gap: 16, paddingVertical: 22, paddingHorizontal: 2 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  pointLine: { fontSize: 13, lineHeight: 19 },
  notice: { marginBottom: 12, marginHorizontal: 2 },
  actions: { marginTop: 20 },
  danger: { marginTop: 24 },
  elsewhere: { alignItems: 'center', gap: 8, paddingTop: 40, paddingHorizontal: 8 },
  retry: { alignSelf: 'stretch', marginTop: 12, paddingHorizontal: 20 },
});
