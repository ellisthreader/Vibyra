import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

/** The two devices someone can code on, drawn from views in the app's own
 *  palette the way the setup and search pages draw theirs, so the whole flow
 *  shares one set of devices. `lit` (0 → 1) is the only thing that changes
 *  with the choice: the chosen device lifts a little, its screen wakes in
 *  accent and its code lines type in one after another; the other settles
 *  back and dims. Everything runs on the native driver from that one value. */
export function PathDevice({ phone = false, lit }: { phone?: boolean; lit: Animated.Value }) {
  const { colors, dark } = useTheme();
  const clamp = (inputRange: number[], outputRange: number[]) => lit.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const shell = { backgroundColor: dark ? '#2A2E38' : colors.surface,
    borderColor: dark ? 'rgba(255,255,255,0.16)' : colors.border,
    shadowColor: '#080B12', shadowOpacity: dark ? 0.5 : 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 10 } };
  const gloss = dark ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { opacity: 0 };
  const widths = phone ? [36, 26, 31] : [64, 86, 44];
  const screen = <View style={[s.screen, { borderRadius: phone ? 11 : 6, backgroundColor: dark ? colors.background : colors.elevated }]}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: clamp([0, 1], [0, dark ? 0.16 : 0.1]) }]} />
    <View style={s.bars}>{widths.map((width, index) => {
      // Each line arrives a beat after the one before, from the left, like text being typed.
      const at = 0.15 + index * 0.22;
      return <View key={index} style={[s.bar, { width }]}>
        <Animated.View style={[StyleSheet.absoluteFill, s.bar, { backgroundColor: colors.muted, opacity: clamp([0, 1], [0.3, 0]) }]} />
        <Animated.View style={[StyleSheet.absoluteFill, s.bar, { backgroundColor: index === 1 ? colors.muted : colors.accent,
          opacity: clamp([at, at + 0.35], [0, index === 1 ? 0.4 : 0.9]),
          transform: [{ translateX: clamp([at, at + 0.35], [-8, 0]) }] }]} />
      </View>;
    })}</View>
  </View>;
  return <Animated.View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[s.stage, { opacity: clamp([0, 1], [0.72, 1]),
      transform: [{ translateY: clamp([0, 1], [0, -6]) }, { scale: clamp([0, 1], [0.97, 1.03]) }] }]}>
    {phone ? <View style={[s.phone, shell]}>
      <View style={[s.gloss, { left: 14, right: 14 }, gloss]} />{screen}
    </View> : <View style={s.laptop}>
      <View style={[s.lid, shell]}><View style={[s.gloss, { left: 12, right: 12 }, gloss]} />{screen}</View>
      <View style={[s.deck, shell, { shadowOpacity: 0 }]}><View style={[s.lip, { backgroundColor: colors.border }]} /></View>
    </View>}
  </Animated.View>;
}
const s = StyleSheet.create({
  stage: { height: 152, alignItems: 'center', justifyContent: 'flex-end' },
  gloss: { position: 'absolute', top: 0, height: 1 },
  laptop: { width: 172 },
  lid: { marginHorizontal: 13, height: 102, borderWidth: 1, padding: 6, borderTopLeftRadius: 13, borderTopRightRadius: 13,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  deck: { height: 9, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 7, borderBottomRightRadius: 7,
    alignItems: 'center', justifyContent: 'center' },
  lip: { width: 34, height: 2, borderRadius: 1 },
  phone: { width: 70, height: 132, borderRadius: 19, borderWidth: 1, padding: 4.5 },
  screen: { flex: 1, overflow: 'hidden', justifyContent: 'center' },
  bars: { gap: 8, paddingHorizontal: 13 }, bar: { height: 6, borderRadius: 3 },
});
