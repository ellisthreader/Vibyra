import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useDrift } from './welcomeMotion';

// Reuse the welcome light textures, with slower movement and a natural fade
// below the heading. The scaffold keeps this decorative layer behind touch targets.
export function OnboardingHeaderBackdrop() {
  const { dark } = useTheme();
  const strength = dark ? 1 : 0.45;
  const cobalt = useDrift({ period: 20000, dx: 18, dy: -8, grow: 1.04, opacity: 0.38 * strength });
  const sky = useDrift({ period: 26000, dx: -14, dy: 10, grow: 1.03, opacity: 0.22 * strength });
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.frame}>
    <Animated.Image accessible={false} source={require('../../assets/glow-cobalt.png')} style={[s.cobalt, cobalt]} />
    <Animated.Image accessible={false} source={require('../../assets/glow-sky.png')} style={[s.sky, sky]} />
  </View>;
}
const s = StyleSheet.create({
  frame: { width: '100%', maxWidth: 760, height: 380, alignSelf: 'center' },
  cobalt: { position: 'absolute', width: 560, height: 560, top: -210, left: '50%', marginLeft: -390 },
  sky: { position: 'absolute', width: 420, height: 420, top: -165, left: '50%', marginLeft: -100 },
});
