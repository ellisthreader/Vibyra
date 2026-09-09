import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import type { OnboardingMode } from '../ui/types';
import { OnboardingScaffold } from './OnboardingScaffold';
import { OnboardingBrand } from './OnboardingBrand';
import { OnboardingHeaderBackdrop } from './OnboardingHeaderBackdrop';
import { PathCard } from './PathCard';

export const phoneReason = 'Coding on your phone needs a Vibyra account.';
export function PathStep({ onConnect, onPhone, onSkip, onBack }: {
  onConnect: () => void; onPhone: () => void; onSkip: () => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<OnboardingMode>('computer');
  return <OnboardingScaffold step={3} onBack={onBack} backdrop={<OnboardingHeaderBackdrop />} header={<OnboardingBrand />}
    headerRight={<Pressable accessibilityRole="button" accessibilityLabel="Skip — I’ll decide later" onPress={onSkip}
      style={({ pressed }) => [s.skip, { opacity: pressed ? 0.5 : 1 }]}>
      <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
    </Pressable>}
    footer={<Button title={choice === 'computer' ? 'Connect computer' : 'Start on phone'} onPress={choice === 'computer' ? onConnect : onPhone} />}>
    <View style={s.heading}>
      <Text accessibilityRole="header" accessibilityLabel="How do you want to code?" style={[s.title, { color: colors.text }]}>
        How do you want{'\n'}to code?
      </Text>
      <Text style={[s.detail, { color: colors.muted }]}>You can switch any time.</Text>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Where to code" style={s.options}>
      <PathCard icon="desktop-outline" title="Connect your computer" badge="Recommended" selected={choice === 'computer'} onPress={() => setChoice('computer')}
        detail="Your projects and terminals, wherever you are." />
      <PathCard icon="phone-portrait-outline" title="Code on this phone" badge="Rolling out" selected={choice === 'phone'} onPress={() => setChoice('phone')}
        detail="Start with an idea. No computer needed." />
    </View>
  </OnboardingScaffold>;
}
const s = StyleSheet.create({
  heading: { alignItems: 'center', paddingTop: 24, paddingBottom: 12, gap: 10 },
  title: { fontSize: 31, lineHeight: 38, letterSpacing: -1.1, fontWeight: '700', textAlign: 'center' },
  detail: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  options: { gap: 14 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, skipText: { fontSize: 14 },
});
