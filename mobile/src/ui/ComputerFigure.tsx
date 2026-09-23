import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { ComputerDesktop } from './ComputerDesktop';
import type { Figure } from './hostStatus';
import { Icon, type IconName } from './primitives';
import { useReducedMotion } from './useReducedMotion';

/**
 * The computer, drawn in the idiom of the pairing art (`ConnectDevices`): a lid
 * with a lit edge, a deck, a cast shadow, all in the app's own palette so it
 * tracks both themes. Its screen is the state. Connected, Vibyra Desktop is up
 * on it (`ComputerDesktop`), a caret ticking in its focused pane; being reached, it
 * boots — the platform logo over a spinner; out of reach, the logo sits dim on
 * a dark screen. The words under it say the same thing, so the figure is
 * hidden from assistive technology.
 */
export function ComputerFigure({ state, logo }: { state: Figure; logo: IconName }) {
  const { colors, dark } = useTheme();
  const reduced = useReducedMotion();
  const blink = useBlink(state === 'live' && !reduced);
  const shell = {
    backgroundColor: dark ? colors.elevated : colors.surface,
    borderColor: colors.border,
    shadowColor: '#080B12',
    shadowOpacity: dark ? 0.5 : 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  };
  const gloss = dark ? { backgroundColor: 'rgba(255,255,255,0.12)' } : { opacity: 0 };
  const screen = { backgroundColor: dark ? colors.background : colors.elevated };
  const caret = reduced
    ? 1
    : blink.interpolate({ inputRange: [0, 0.48, 0.52, 1], outputRange: [1, 1, 0.08, 0.08] });
  return (
    <View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={s.figure}
    >
      <View style={[s.lid, shell]}>
        <View style={[s.gloss, gloss]} />
        <View style={[s.display, screen]}>
          {state === 'live' ? (
            <ComputerDesktop logo={logo} caret={caret} />
          ) : (
            <View style={s.boot}>
              <View style={{ opacity: state === 'waking' ? 0.85 : 0.3 }}>
                <Icon name={logo} size={38} color={colors.text} />
              </View>
              {state === 'waking' && <ActivityIndicator size="small" color={colors.muted} />}
            </View>
          )}
        </View>
      </View>
      <View style={[s.deck, shell, { shadowOpacity: 0 }]}>
        <View style={[s.lip, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

/** One linear cycle the caret steps on, so it ticks rather than breathes. */
function useBlink(active: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, active]);
  return value;
}

const s = StyleSheet.create({
  figure: { width: '100%', maxWidth: 324, alignSelf: 'center' },
  lid: {
    marginHorizontal: 16,
    height: 170,
    borderWidth: 1,
    padding: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  gloss: { position: 'absolute', top: 0, left: 24, right: 24, height: 1 },
  display: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 6 },
  deck: {
    height: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lip: { width: 56, height: 3, borderRadius: 2 },
});
