import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { ModelLogo } from './BrandLogo';
import type { useAutoSceneMotion } from './useAutoSceneMotion';

export function AutoCore({
  mark,
  motion,
  model,
}: {
  mark: number;
  motion: ReturnType<typeof useAutoSceneMotion>;
  model?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.centre}>
      <Animated.View
        style={[
          s.halo,
          {
            width: mark + 24,
            height: mark + 24,
            borderRadius: (mark + 24) / 2,
            borderColor: colors.accent,
            opacity: motion.breath.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.25] }),
            transform: [
              { scale: motion.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          s.mark,
          {
            width: mark,
            height: mark,
            borderRadius: mark * 0.34,
            backgroundColor: colors.accentSoft,
            borderColor: colors.accent + '35',
            transform: [
              { scale: motion.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) },
            ],
          },
        ]}
      >
        <Animated.View style={{ opacity: Animated.subtract(1, motion.resolve) }}>
          <Icon name="sparkles" size={mark * 0.44} color={colors.accent} />
        </Animated.View>
        {model && (
          <Animated.View
            testID="auto-chosen-logo"
            style={[
              s.chosen,
              {
                opacity: motion.resolve,
                transform: [
                  {
                    scale: motion.resolve.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.65, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <ModelLogo id={model} size={mark} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  centre: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', borderWidth: 1 },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chosen: { position: 'absolute' },
});
