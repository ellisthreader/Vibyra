import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import type { OnboardingMode } from '../ui/types';
import { OnboardingScaffold } from './OnboardingScaffold';
import { OnboardingBrand } from './OnboardingBrand';
import { OnboardingHeaderBackdrop } from './OnboardingHeaderBackdrop';
import { PathChoice } from './PathChoice';
import { useEntrance } from './welcomeMotion';

export const phoneReason = 'Coding on your phone needs a Vibyra account.';
export function PathStep({ onConnect, onPhone, onSkip, onBack }: {
  onConnect: () => void; onPhone: () => void; onSkip: () => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<OnboardingMode>('computer');
  const compact = useWindowDimensions().height < 740;
  const [heading, options] = useEntrance(2);
  return <OnboardingScaffold step={3} onBack={onBack} backdrop={<OnboardingHeaderBackdrop />} header={<OnboardingBrand />}
    headerRight={<Pressable accessibilityRole="button" accessibilityLabel="Skip — I’ll decide later" onPress={onSkip}
      style={({ pressed }) => [s.skip, { opacity: pressed ? 0.5 : 1 }]}>
      <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
    </Pressable>}
    footer={<Button title={choice === 'computer' ? 'Connect computer' : 'Start on phone'} onPress={choice === 'computer' ? onConnect : onPhone} />}>
    <Animated.View style={[s.heading, compact && s.headingTight, heading]}>
      <Text accessibilityRole="header" accessibilityLabel="How do you want to code?" style={[s.title, compact && s.titleTight, { color: colors.text }]}>
        How do you want{'\n'}<Text style={{ color: colors.accent }}>to code?</Text>
      </Text>
      <Text style={[s.detail, { color: colors.muted }]}>You can switch any time.</Text>
    </Animated.View>
    {/* The two devices stand on the page between the title and the action, with no boxes:
        the chosen one lights up, and that is the whole signal. */}
    <Animated.View style={[s.stage, options]}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Where to code" style={s.pair}>
        {(['computer', 'phone'] as const).map(mode => <PathChoice key={mode} mode={mode}
          selected={choice === mode} onPress={() => setChoice(mode)} />)}
      </View>
    </Animated.View>
  </OnboardingScaffold>;
}
const s = StyleSheet.create({
  heading: { paddingTop: 28, gap: 12 },
  headingTight: { paddingTop: 8, gap: 8 },
  title: { fontSize: 36, lineHeight: 41, letterSpacing: -1.5, fontWeight: '700' },
  titleTight: { fontSize: 30, lineHeight: 35 },
  detail: { fontSize: 15, lineHeight: 22 },
  stage: { flexGrow: 1, justifyContent: 'center', paddingBottom: 24 },
  pair: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, skipText: { fontSize: 14 },
});
