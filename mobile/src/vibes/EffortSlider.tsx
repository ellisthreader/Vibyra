import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { effortChoice } from '../ui/effort';
import { detent } from '../ui/haptics';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { positionAt, rungAt, stopAt } from './gaugeGeometry';
import { useGlass } from './glass';
import type { Effort } from './types';

const KNOB = 30;
const INSET = KNOB / 2 + 7;
const TRACK = 48;

/**
 * How hard the model thinks, set in a glass panel that takes the whole composer
 * while it is open: the level's name large at the top, and under it one dot per
 * level the model publishes, cheapest on the left. Slide or tap anywhere on the
 * track; it clicks at each dot and settles on the nearest when the finger lifts.
 *
 * Under Auto there is nothing to slide: the router picks the level for each message
 * and ignores one sent beside it, so the panel says so and offers the picker.
 */
export function EffortSlider({ ladder, value, onChange, automatic = false, onChooseModel, onClose }: {
  ladder: Effort[]; value: Effort | null; onChange(effort: Effort): void; automatic?: boolean;
  onChooseModel(): void; onClose(): void;
}) {
  const { colors } = useTheme();
  const glass = useGlass();
  const reduced = useReducedMotion();
  const count = ladder.length;
  const held = Math.max(0, value ? ladder.indexOf(value) : 0);
  const [shown, setShown] = useState(held);
  const [length, setLength] = useState(0);
  const position = useRef(new Animated.Value(held)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const live = useRef({ position: held, rung: held, start: 0, dragging: false, length: 0 });
  live.current.length = length;

  const show = (rung: number) => {
    live.current.rung = rung;
    setShown(rung);
    detent();
    onChange(ladder[rung]!);
  };
  const follow = (x: number) => {
    const next = positionAt(x, live.current.length, count, INSET);
    live.current.position = next;
    position.setValue(next);
    const rung = rungAt(next, count);
    if (rung !== live.current.rung) show(rung);
  };
  const press = (down: boolean) => {
    if (reduced) lift.setValue(down ? 1 : 0);
    else Animated.spring(lift, { toValue: down ? 1 : 0, speed: 30, bounciness: 8, useNativeDriver: true }).start();
  };
  const settle = (rung = rungAt(live.current.position, count)) => {
    live.current.dragging = false;
    live.current.position = rung;
    press(false);
    if (reduced) position.setValue(rung);
    else Animated.spring(position, { toValue: rung, speed: 24, bounciness: 6, useNativeDriver: true }).start();
  };
  // Made once, so it reaches this render's ladder and callbacks through a ref.
  const latest = useRef({ follow, settle, press });
  latest.current = { follow, settle, press };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      live.current.dragging = true;
      live.current.start = event.nativeEvent.locationX;
      latest.current.press(true);
      latest.current.follow(live.current.start);
    },
    onPanResponderMove: (_event, gesture) => latest.current.follow(live.current.start + gesture.dx),
    onPanResponderRelease: () => latest.current.settle(), onPanResponderTerminate: () => latest.current.settle(),
  }), []);
  // A level set from elsewhere, such as switching to another model, moves the knob too.
  useEffect(() => {
    if (live.current.dragging || held === live.current.rung) return;
    live.current.rung = held; setShown(held); settle(held);
  }, [held]);

  const title = automatic ? 'Auto' : effortChoice(ladder[shown] ?? ladder[0]!).label;
  const header = <View style={s.header}>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.title, { color: colors.text }]}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Done setting thinking effort" onPress={onClose} hitSlop={6}
      style={({ pressed }) => [s.done, { backgroundColor: glass.well, borderColor: glass.rim, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="checkmark" size={18} color={colors.text} />
    </Pressable>
  </View>;

  if (automatic) return <View style={s.panel}>
    {header}
    <Text style={[s.autoText, { color: colors.muted }]}>Auto sets the effort for each message.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose a model to set the effort" onPress={onChooseModel}
      style={({ pressed }) => [s.choose, { backgroundColor: glass.well, borderColor: glass.rim, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[s.chooseText, { color: colors.text }]}>Choose a model</Text>
    </Pressable>
  </View>;

  const choice = effortChoice(ladder[shown] ?? ladder[0]!);
  const x = count > 1 && length > 0 ? position.interpolate({ inputRange: [0, count - 1],
    outputRange: [stopAt(0, length, count, INSET), stopAt(count - 1, length, count, INSET)] }) : stopAt(0, length, count, INSET);
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  return <View style={s.panel}>
    {header}
    <View {...pan.panHandlers} onLayout={event => setLength(event.nativeEvent.layout.width)}
      accessible accessibilityRole="adjustable" accessibilityLabel="Thinking effort"
      aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={shown} aria-valuetext={`${choice.label}, ${choice.hint}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        const rung = Math.min(count - 1, Math.max(0, live.current.rung + (event.nativeEvent.actionName === 'increment' ? 1 : -1)));
        if (rung !== live.current.rung) { show(rung); settle(rung); }
      }} style={[s.track, { backgroundColor: glass.well, borderColor: glass.rim }]}>
      {/* The glass's lit upper edge, and the tint it has taken up to the knob. */}
      <View pointerEvents="none" style={[s.shine, { backgroundColor: glass.shine }]} />
      {length > 0 && <Animated.View pointerEvents="none" style={[s.fill, { backgroundColor: colors.accentSoft, width: length,
        transform: [{ translateX: Animated.subtract(Animated.add(x, KNOB / 2 + 5), length) }] }]} />}
      {length > 0 && ladder.map((rung, index) => <View key={rung} pointerEvents="none" style={[s.dot,
        { left: stopAt(index, length, count, INSET) - 4, backgroundColor: index <= shown ? colors.accent : glass.dot }]} />)}
      {length > 0 && <Animated.View pointerEvents="none" style={[s.knob, { backgroundColor: glass.knob, borderColor: glass.rim,
        transform: [{ translateX: Animated.subtract(x, KNOB / 2) }, { scale }] }]}>
        <View style={[s.core, { backgroundColor: colors.accent }]} />
      </Animated.View>}
    </View>
  </View>;
}
const s = StyleSheet.create({
  panel: { flex: 1, justifyContent: 'space-between', gap: 14, paddingHorizontal: 2, paddingTop: 2, paddingBottom: 4 },
  header: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.4, textAlign: 'center' },
  done: { position: 'absolute', right: 0, top: 2, width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center' },
  track: { height: TRACK, borderRadius: TRACK / 2, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden' },
  shine: { position: 'absolute', left: TRACK / 2, right: TRACK / 2, top: 0, height: StyleSheet.hairlineWidth * 2 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: TRACK / 2 },
  dot: { position: 'absolute', top: TRACK / 2 - 4 - StyleSheet.hairlineWidth, width: 8, height: 8, borderRadius: 4 },
  knob: { position: 'absolute', left: 0, top: TRACK / 2 - KNOB / 2 - StyleSheet.hairlineWidth, width: KNOB, height: KNOB, borderRadius: KNOB / 2,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  core: { width: 10, height: 10, borderRadius: 5 },
  autoText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  choose: { alignSelf: 'center', minHeight: 40, paddingHorizontal: 18, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  chooseText: { fontSize: 14, fontWeight: '600' },
});
