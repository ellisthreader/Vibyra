import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';

// The pairing art is drawn from views in the app's own palette instead of a flat render, so it
// tracks light and dark, stays sharp at any size, and can show the link actually carrying data.
// It sits straight on the sheet with no panel or wash behind it, so only the devices carry colour.
const artWidth = 332;
const artHeight = 168;

// One linear cycle other elements interpolate from, so the caret and the link stay in step.
function useCycle(period: number, reduced: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: period,
      easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [value, period, reduced]);
  return value;
}

export function ConnectDevices({ scale = 1 }: { scale?: number }) {
  const { colors, dark } = useTheme();
  const reduced = useReducedMotion();
  const travel = useCycle(2100, reduced);
  const blink = useCycle(1100, reduced);
  const bar = { backgroundColor: colors.muted };
  // A cast shadow is what lifts the devices off the stage, especially in light mode where the
  // frames and the panel are only a step apart in tone.
  const shell = { backgroundColor: dark ? colors.elevated : colors.surface, borderColor: colors.border,
    shadowColor: '#080B12', shadowOpacity: dark ? 0.5 : 0.16, shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }, elevation: 8 };
  // A lit top edge, drawn as an inset line rather than a per-side border colour, which iOS renders
  // unevenly against a corner radius.
  const gloss = dark ? { backgroundColor: 'rgba(255,255,255,0.12)' } : { opacity: 0 };
  const screen = { backgroundColor: dark ? colors.background : colors.elevated };
  const caret = reduced ? 1
    : blink.interpolate({ inputRange: [0, 0.48, 0.52, 1], outputRange: [1, 1, 0.08, 0.08] });
  // Each dot brightens a beat after the one before it, so the pulse reads as travelling phone-ward.
  const pulse = (index: number) => reduced ? 0.55 : travel.interpolate({
    inputRange: [0, 0.16 + index * 0.14, 0.3 + index * 0.14, 1], outputRange: [0.2, 1, 0.2, 0.2] });
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[s.art, { transform: [{ scale }] }]}>
    <View style={s.laptop}>
      <View style={[s.lid, shell]}>
        <View style={[s.gloss, s.lidGloss, gloss]} />
        <View style={[s.display, screen]}>
          <View style={s.chrome}>{[0, 1, 2].map(dot =>
            <View key={dot} style={[s.chromeDot, { backgroundColor: colors.border }]} />)}</View>
          <View style={s.row}>
            <Icon name="chevron-forward" size={11} color={colors.accent} />
            <View style={[s.bar, bar, { width: 100, opacity: 0.42 }]} />
          </View>
          <View style={[s.row, s.indent]}>
            <View style={[s.bar, bar, { width: 46, opacity: 0.26 }]} />
            <View style={[s.bar, { backgroundColor: colors.accent, width: 30, opacity: 0.5 }]} />
          </View>
          <View style={[s.row, s.indent]}><View style={[s.bar, bar, { width: 62, opacity: 0.18 }]} /></View>
          <View style={s.row}>
            <Icon name="chevron-forward" size={11} color={colors.accent} />
            <View style={[s.bar, bar, { width: 54, opacity: 0.42 }]} />
            <Animated.View style={[s.caret, { backgroundColor: colors.accent, opacity: caret }]} />
          </View>
        </View>
      </View>
      <View style={[s.deck, shell, { shadowOpacity: 0 }]}>
        <View style={[s.lip, { backgroundColor: colors.border }]} />
      </View>
    </View>
    <View style={s.link}>{[0, 1, 2].map(dot =>
      <Animated.View key={dot} style={[s.linkDot, { backgroundColor: colors.accent, opacity: pulse(dot) }]} />)}</View>
    <View style={[s.phone, shell]}>
      <View style={[s.gloss, s.phoneGloss, gloss]} />
      <View style={[s.phoneScreen, screen]}>
        <View style={[s.speaker, { backgroundColor: colors.border }]} />
        <View style={[s.check, { backgroundColor: colors.accentSoft }]}>
          <Icon name="checkmark" size={17} color={colors.accent} />
        </View>
        <View style={[s.bar, bar, { width: 30, opacity: 0.34 }]} />
        <View style={[s.bar, bar, { width: 19, opacity: 0.22 }]} />
        <View style={[s.home, { backgroundColor: colors.border }]} />
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  art: { width: artWidth, height: artHeight },
  laptop: { position: 'absolute', left: 0, top: 13, width: 222 },
  gloss: { position: 'absolute', top: 0, height: 1 },
  lidGloss: { left: 20, right: 20 }, phoneGloss: { left: 16, right: 16 },
  lid: { marginHorizontal: 12, height: 128, borderWidth: 1, padding: 9, borderTopLeftRadius: 15,
    borderTopRightRadius: 15, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  display: { flex: 1, borderRadius: 8, paddingHorizontal: 13, paddingTop: 12, gap: 9 },
  chrome: { flexDirection: 'row', gap: 5, paddingBottom: 3 },
  chromeDot: { width: 5, height: 5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 }, indent: { paddingLeft: 17 },
  bar: { height: 7, borderRadius: 4 },
  caret: { width: 7, height: 13, borderRadius: 2, marginLeft: 1 },
  deck: { height: 12, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 7, borderBottomRightRadius: 7,
    alignItems: 'center', justifyContent: 'center' },
  lip: { width: 44, height: 3, borderRadius: 2 },
  link: { position: 'absolute', left: 222, top: 83, width: 36, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkDot: { width: 6, height: 6, borderRadius: 3 },
  phone: { position: 'absolute', left: 258, top: 29, width: 74, height: 124, borderRadius: 20, borderWidth: 1, padding: 5 },
  phoneScreen: { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 8 },
  speaker: { position: 'absolute', top: 8, width: 18, height: 3.5, borderRadius: 2 },
  check: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  home: { position: 'absolute', bottom: 8, width: 22, height: 3, borderRadius: 2 },
});
