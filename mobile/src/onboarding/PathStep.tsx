import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import type { OnboardingMode } from '../ui/types';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import { OnboardingScaffold, StepTitle, TextLink } from './OnboardingScaffold';
import { PathCard } from './PathCard';

export const phoneReason = 'Coding on your phone needs a Vibyra account.';
export function PathStep({ onConnect, onPhone, onSkip, onBack }: {
  onConnect: () => void; onPhone: () => void; onSkip: () => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<OnboardingMode>('computer');
  return <OnboardingScaffold step={3} onBack={onBack} backdrop={<OnboardingBackdrop centre={-60} soft />} footer={<>
    <View style={[s.glowButton, { shadowColor: colors.accent }]}>
      <Button title={choice === 'computer' ? 'Connect computer' : 'Start on phone'} onPress={choice === 'computer' ? onConnect : onPhone} />
    </View>
    <TextLink title="Skip — I’ll decide later" onPress={onSkip} />
  </>}>
    <StepTitle title="How do you want to code?" detail="You can switch any time." />
    <View accessibilityRole="radiogroup" style={s.options}>
      <PathCard icon="desktop-outline" title="Connect your computer" badge="Recommended" selected={choice === 'computer'} onPress={() => setChoice('computer')}
        detail="Real terminals, live preview, your projects and git." meta="Needs Vibyra Host on your computer." />
      <PathCard icon="phone-portrait-outline" title="Code on this phone" badge="Rolling out" selected={choice === 'phone'} onPress={() => setChoice('phone')}
        detail="Chat and build straight from your pocket. Nothing to install." meta="Needs a Vibyra account." />
    </View>
  </OnboardingScaffold>;
}
const s = StyleSheet.create({
  options: { gap: 12 },
  glowButton: { shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5, borderRadius: 18 },
});
