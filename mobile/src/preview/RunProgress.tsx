import { useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from '../ui/font';
import { useCycle, useMotionTarget } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { RunState } from './runnable';


type Phase = 'pending' | 'active' | 'done';
const GLINT = 0.5;

/** Where an app's run is, in three steps. The step being worked on is half filled with
 *  a light sweeping across it; finished steps are solid. Nothing here claims a percent. */
export function RunProgress({ state, name, log, web = false }: { state: RunState; name: string; log?: string | null; web?: boolean }) {
  const { colors } = useTheme();
  const STEPS = web ? ['Start server', 'Open website', 'Ready'] : ['Build', 'Open window', 'Ready'];
  const index = state === 'building' ? 0 : state === 'waiting_for_window' ? 1 : 2;
  return <View accessibilityRole="progressbar" accessibilityLabel={`${name}: ${STEPS[index]}`}
    accessibilityValue={{ text: STEPS[index] }} accessibilityLiveRegion="polite" style={s.wrap}>
    <View style={s.bar}>
      {STEPS.map((step, i) => <Segment key={step} phase={i < index ? 'done' : i === index ? 'active' : 'pending'} />)}
    </View>
    <View style={s.labels}>
      {STEPS.map((step, i) => <Text key={step} numberOfLines={1}
        style={[s.label, { color: i === index ? colors.text : colors.muted, fontWeight: i === index ? '600' : '500' }]}>{step}</Text>)}
    </View>
    {log ? <Text numberOfLines={1} style={[s.log, { color: colors.muted }]}>{log}</Text> : null}
  </View>;
}

function Segment({ phase }: { phase: Phase }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const fill = useMotionTarget(phase === 'done' ? 1 : phase === 'active' ? 0.5 : 0, reduced, 500);
  const sweep = useCycle(phase === 'active' && !reduced, 1500);
  const glint = width * GLINT;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[s.track, { backgroundColor: colors.elevated }]}>
    <Animated.View style={[s.fill, { backgroundColor: colors.accent, transform: [{ scaleX: fill }] }]} />
    {phase === 'active' && !reduced && width > 0 && <Animated.View pointerEvents="none"
      style={[s.glint, { width: glint, backgroundColor: `${colors.accent}8C`, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-glint, width] }) }] }]} />}
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  bar: { flexDirection: 'row', gap: 6 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  // Grows from its left edge; the track's rounded ends clip it.
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transformOrigin: 'left center' },
  glint: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  labels: { flexDirection: 'row', gap: 6 },
  label: { ...font.caption, flex: 1 },
  log: { fontFamily: 'Menlo', fontSize: 11.5, lineHeight: 16 },
});
