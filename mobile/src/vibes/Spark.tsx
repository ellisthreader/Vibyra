import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useBreath } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';

/**
 * Vibyra thinking, drawn once: a soft accent light with the spark at its centre.
 * Large on the empty page, small beside a reply that is still being written,
 * where it breathes so long as the reply is on its way. Reduce Motion holds it still.
 */
export function Spark({ size = 96, breathing = false }: { size?: number; breathing?: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const breath = useBreath(breathing && !reduced);
  const glyph = Math.round(size * 0.3);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View style={[StyleSheet.absoluteFill, breathing && { opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
      transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }] }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><RadialGradient id="spark" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.55} />
          <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#spark)" />
      </Svg>
    </Animated.View>
    <Icon name="sparkles" size={glyph} color={colors.accent} />
  </View>;
}
