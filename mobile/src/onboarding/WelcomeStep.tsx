import { useState } from 'react';
import { Animated, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { links } from '../settings/links';
import { useTheme } from '../theme';
import { BrandMark, Button } from '../ui/primitives';
import { OnboardingScaffold, TextLink } from './OnboardingScaffold';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import { useEntrance } from './welcomeMotion';
import { font } from '../ui/font';

// vibyra.app is a parked domain; the legal pages live on the site the API runs on (settings/links.ts).
const legal = (path: 'terms' | 'privacy') => () => {
  void Linking.openURL(links[path]).catch(() => {});
};
export function WelcomeStep({ onStart, onLogIn }: { onStart: () => void; onLogIn: () => void }) {
  const { colors } = useTheme();
  const tall = useWindowDimensions().height >= 800;
  const [mark, title, subtitle, footer] = useEntrance(4);
  const size = tall ? 96 : 84;
  // The glow follows the brand mark wherever the hero settles: scaffold header (56) + content top padding (8) + mark offset.
  const [markY, setMarkY] = useState(4);
  const centre = 64 + markY + size / 2;
  return (
    <OnboardingScaffold
      step={1}
      backdrop={<OnboardingBackdrop centre={centre} />}
      footer={
        <Animated.View style={[s.footer, footer]}>
          <View style={[s.glowButton, { shadowColor: colors.accent }]}>
            <Button title="Get started" onPress={onStart} />
          </View>
          <TextLink title="I already have an account" onPress={onLogIn} />
          <Text style={[s.legal, { color: colors.muted }]}>
            By continuing you agree to the{' '}
            <Text
              accessibilityRole="link"
              onPress={legal('terms')}
              style={[s.legalLink, { color: colors.text }]}
            >
              Terms
            </Text>{' '}
            and{' '}
            <Text
              accessibilityRole="link"
              onPress={legal('privacy')}
              style={[s.legalLink, { color: colors.text }]}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </Animated.View>
      }
    >
      <View style={s.hero}>
        <Animated.View onLayout={(event) => setMarkY(event.nativeEvent.layout.y)} style={mark}>
          <BrandMark size={size} />
        </Animated.View>
        <Animated.Text
          accessibilityRole="header"
          style={[s.title, tall && s.titleTall, { color: colors.text }, title]}
        >
          Build from{'\n'}
          <Text style={{ color: colors.accent }}>your pocket.</Text>
        </Animated.Text>
        <Animated.Text style={[s.subtitle, { color: colors.muted }, subtitle]}>
          Real terminals, real projects and an agent that writes the code. All from your phone.
        </Animated.Text>
      </View>
    </OnboardingScaffold>
  );
}
const s = StyleSheet.create({
  hero: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
    gap: 16,
  },
  title: {
    fontSize: 36,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: -1.4,
    textAlign: 'center',
    marginTop: 10,
  },
  titleTall: { fontSize: 40, lineHeight: 45, letterSpacing: -1.6 },
  subtitle: { ...font.body, textAlign: 'center', maxWidth: 310 },
  footer: { gap: 2 },
  glowButton: {
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    borderRadius: 14,
  },
  legal: { ...font.caption, fontWeight: '400', textAlign: 'center', paddingTop: 8 },
  legalLink: { textDecorationLine: 'underline' },
});
