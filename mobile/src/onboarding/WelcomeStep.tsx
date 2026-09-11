import { useState } from 'react';
import { Animated, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Button } from '../ui/primitives';
import { OnboardingScaffold, TextLink } from './OnboardingScaffold';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import { useEntrance } from './welcomeMotion';

const legal = (path: string) => () => { void Linking.openURL(`https://vibyra.app/legal/${path}`); };
export function WelcomeStep({ onStart, onLogIn }: { onStart: () => void; onLogIn: () => void }) {
  const { colors } = useTheme();
  const tall = useWindowDimensions().height >= 800;
  const [mark, title, subtitle, footer] = useEntrance(4);
  const size = tall ? 96 : 84;
  // The glow follows the brand mark wherever the hero settles: scaffold header (56) + content top padding (8) + mark offset.
  const [markY, setMarkY] = useState(4);
  const centre = 64 + markY + size / 2;
  return <OnboardingScaffold step={1} backdrop={<OnboardingBackdrop centre={centre} />} footer={<Animated.View style={[s.footer, footer]}>
    <View style={[s.glowButton, { shadowColor: colors.accent }]}><Button title="Get started" onPress={onStart} /></View>
    <TextLink title="I already have an account" onPress={onLogIn} />
    <Text style={[s.legal, { color: colors.muted }]}>By continuing you agree to the{' '}
      <Text accessibilityRole="link" onPress={legal('terms')} style={[s.legalLink, { color: colors.text }]}>Terms</Text> and{' '}
      <Text accessibilityRole="link" onPress={legal('privacy')} style={[s.legalLink, { color: colors.text }]}>Privacy Policy</Text>.</Text>
  </Animated.View>}>
    <View style={s.hero}>
      <Animated.View onLayout={event => setMarkY(event.nativeEvent.layout.y)} style={mark}><BrandMark size={size} /></Animated.View>
      <Animated.Text accessibilityRole="header" style={[s.title, tall && s.titleTall, { color: colors.text }, title]}>
        Build from{'\n'}<Text style={{ color: colors.accent }}>your pocket.</Text>
      </Animated.Text>
      <Animated.Text style={[s.subtitle, { color: colors.muted }, subtitle]}>
        Real terminals, real projects and an agent that writes the code. All from your phone.
      </Animated.Text>
    </View>
  </OnboardingScaffold>;
}
const s = StyleSheet.create({
  hero: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 4, paddingBottom: 6, gap: 18 },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '600', letterSpacing: -1.3, textAlign: 'center' },
  titleTall: { fontSize: 40, lineHeight: 46, letterSpacing: -1.5 },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  footer: { gap: 4 },
  glowButton: { shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6, borderRadius: 18 },
  legal: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingTop: 6 }, legalLink: { textDecorationLine: 'underline' },
});
