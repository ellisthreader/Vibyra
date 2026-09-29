import { memo, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { BrandMark, Icon, type IconName } from '../ui/primitives';
import type { Arrival } from './foundMotion';

/** The found computer opens above a steady floor light. Keep that light outside
 * the transformed machine so its SVG does not share animated opacity, scale or
 * perspective compositing with the lid. Only the status dot keeps breathing. */
export const FoundMachine = memo(function FoundMachine({
  width,
  motion,
  logo,
  screen,
  screenOpacity,
}: {
  width: number;
  motion: Arrival;
  logo?: IconName;
  screen?: ReactNode;
  screenOpacity?: Animated.AnimatedInterpolation<number>;
}) {
  const { colors, dark } = useTheme();
  const { rise, lid } = motion;
  const k = width / 240;
  const lidHeight = 146 * k;
  const deckHeight = 12 * k;
  const lightWidth = width * 1.5;
  const lightHeight = width * 0.4;
  const shell = {
    backgroundColor: dark ? '#2A2E38' : colors.surface,
    borderColor: dark ? 'rgba(255,255,255,0.18)' : colors.border,
  };
  const shadow = {
    shadowColor: '#080B12',
    shadowOpacity: dark ? 0.55 : 0.16,
    shadowRadius: 18 * k,
    shadowOffset: { width: 0, height: 12 * k },
  };
  const clamp = (inputRange: number[], outputRange: number[]) =>
    lid.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  // Closed, the lid lies over the deck with its top edge towards the viewer; it hinges up from its bottom edge.
  const open = lid.interpolate({ inputRange: [0, 1], outputRange: ['-78deg', '0deg'] });
  // The screen wakes smoothly; avoid a second brightness flash during the reveal.
  const awake = clamp([0, 0.42, 0.72, 1], [0, 0, 1, 1]);
  const screenLight = clamp([0, 0.42, 0.72, 1], [0, 0, dark ? 0.1 : 0.06, dark ? 0.1 : 0.06]);
  return (
    <View pointerEvents="none" style={[s.machine, { width }]}>
      <View
        style={[
          s.light,
          {
            width: lightWidth,
            height: lightHeight,
            left: (width - lightWidth) / 2,
            top: lidHeight + deckHeight - lightHeight / 2,
          },
        ]}
      >
        <Svg width={lightWidth} height={lightHeight}>
          <Defs>
            <RadialGradient id="found-floor" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.success} stopOpacity={dark ? 0.34 : 0.16} />
              <Stop offset="0.5" stopColor={colors.success} stopOpacity={dark ? 0.08 : 0.04} />
              <Stop offset="1" stopColor={colors.success} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={lightWidth / 2}
            cy={lightHeight / 2}
            rx={lightWidth / 2}
            ry={lightHeight / 2}
            fill="url(#found-floor)"
          />
        </Svg>
      </View>
      <Animated.View
        needsOffscreenAlphaCompositing
        style={{
          transformOrigin: '50% 100%',
          opacity: rise.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              scale: rise.interpolate({
                inputRange: [0, 1],
                outputRange: [0.88, 1],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      >
        {/* Composite the glass and bezel before rotating; the deck stays in front of the hinge. */}
        <Animated.View
          shouldRasterizeIOS
          renderToHardwareTextureAndroid
          style={[
            s.lid,
            shell,
            {
              height: lidHeight,
              marginHorizontal: 14 * k,
              padding: 7 * k,
              borderTopLeftRadius: 15 * k,
              borderTopRightRadius: 15 * k,
              transformOrigin: '50% 100%',
              transform: [{ perspective: 800 }, { rotateX: open }],
            },
          ]}
        >
          {dark && <View style={[s.gloss, { left: 20 * k, right: 20 * k }]} />}
          <View
            style={[
              s.display,
              { borderRadius: 9 * k, backgroundColor: dark ? colors.background : colors.elevated },
            ]}
          >
            {(!screen || screenOpacity) && (
              <>
                <Animated.View style={[StyleSheet.absoluteFill, s.mark, { opacity: awake }]}>
                  {logo ? (
                    <Icon name={logo} size={58 * k} color={colors.text} />
                  ) : (
                    <BrandMark size={52 * k} />
                  )}
                </Animated.View>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.accent, opacity: screenLight },
                  ]}
                />
              </>
            )}
            {screen && (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOpacity ?? 1 }]}>
                {screen}
              </Animated.View>
            )}
          </View>
        </Animated.View>
        <View
          style={[
            s.deck,
            shell,
            shadow,
            { height: deckHeight, borderBottomLeftRadius: 8 * k, borderBottomRightRadius: 8 * k },
          ]}
        >
          <View style={[s.lip, { width: 48 * k, height: 3 * k, backgroundColor: colors.border }]} />
        </View>
      </Animated.View>
    </View>
  );
});

const s = StyleSheet.create({
  machine: { alignSelf: 'center' },
  light: { position: 'absolute' },
  gloss: { position: 'absolute', top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  lid: { borderWidth: 1, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  display: { flex: 1, overflow: 'hidden' },
  mark: { alignItems: 'center', justifyContent: 'center' },
  deck: {
    zIndex: 1,
    borderWidth: 1,
    borderTopWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lip: { borderRadius: 2 },
});
