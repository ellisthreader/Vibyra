import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { BrandMark, Button, Icon, type IconName } from '../ui/primitives';

// What an account adds, in the words the rest of the app uses for it. Each line is
// something this list leaves out for a guest, so the sign-up is the way to it.
const perks: { icon: IconName; text: string }[] = [
  { icon: 'chatbubbles-outline', text: 'Your chats, saved to your account' },
  { icon: 'sparkles-outline', text: 'Personality, Memory and Plugins' },
  { icon: 'wallet-outline', text: 'Plans with more Vibyra tokens' },
];

/**
 * The top of Settings for someone without an account. Not an empty face over "Not
 * signed in", but the case for making one: the mark, one line of promise, the three
 * things an account adds, one filled button to make it, and a quieter way in for
 * someone who already has one. The sign-up screens' cobalt light sits behind it, still,
 * so this reads as the start of that flow rather than a row in a list.
 */
export function GuestHeader({
  onSignUp,
  onSignIn,
}: {
  onSignUp?: () => void;
  onSignIn?: () => void;
}) {
  const { colors, dark } = useTheme();
  return (
    <View style={s.header}>
      <Light strength={dark ? 1 : 0.45} ground={colors.rail} />
      <BrandMark size={52} />
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
        Make Vibyra yours
      </Text>
      <Text style={[s.subtitle, { color: colors.muted }]}>
        Sign up free with Apple, Google or email.
      </Text>
      <View style={s.perks}>
        {perks.map((perk) => (
          <View key={perk.text} style={s.perk}>
            <Icon name={perk.icon} size={19} color={colors.accent} />
            <Text style={[s.perkText, { color: colors.text }]}>{perk.text}</Text>
          </View>
        ))}
      </View>
      {onSignUp && (
        <View style={[s.lift, { shadowColor: colors.accent }]}>
          <Button title="Create free account" onPress={onSignUp} />
        </View>
      )}
      {onSignIn && (
        <View style={s.signIn}>
          <Text style={[s.signInLead, { color: colors.muted }]}>Already have an account?</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            hitSlop={12}
            onPress={onSignIn}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[s.signInLink, { color: colors.accent }]}>Sign in</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** The welcome's two glows, held still and cut off at the sheet's edges. The sheet's
 *  title bar has none, so they fade up into its colour rather than stop at a line. */
function Light({ strength, ground }: { strength: number; ground: string }) {
  return (
    <View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={s.light}
    >
      <Image
        accessible={false}
        source={require('../../assets/glow-cobalt.png')}
        style={[s.cobalt, { opacity: 0.34 * strength }]}
      />
      <Image
        accessible={false}
        source={require('../../assets/glow-sky.png')}
        style={[s.sky, { opacity: 0.2 * strength }]}
      />
      <Svg style={s.fade} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="guest-light-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground} stopOpacity={1} />
            <Stop offset="1" stopColor={ground} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#guest-light-fade)" />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  header: { alignItems: 'center', paddingTop: 20 },
  // Reaches past the list's 20pt gutters to the sheet's edges; the glows fade out
  // well above its foot, so it never shows as a box.
  light: { position: 'absolute', top: -4, left: -20, right: -20, height: 360, overflow: 'hidden' },
  cobalt: {
    position: 'absolute',
    width: 480,
    height: 480,
    top: -200,
    left: '50%',
    marginLeft: -330,
  },
  sky: { position: 'absolute', width: 380, height: 380, top: -170, left: '50%', marginLeft: -70 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  title: {
    marginTop: 18,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subtitle: { marginTop: 6, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  perks: { marginTop: 22, gap: 12 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { fontSize: 15.5, letterSpacing: -0.25 },
  lift: {
    alignSelf: 'stretch',
    marginTop: 26,
    borderRadius: 14,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  signIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    minHeight: 44,
    marginTop: 6,
  },
  signInLead: { fontSize: 15 },
  signInLink: { fontSize: 15, fontWeight: '600' },
});
