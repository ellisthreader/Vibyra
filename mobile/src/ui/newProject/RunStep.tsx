import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { ScaffoldProgress } from '../../scaffold/api';
import type { RunPhase } from '../../scaffold/wizard';
import { useReducedMotion } from '../useReducedMotion';
import { MONO } from './mono';
import { WizardFooter } from './WizardFooter';

/**
 * The build. One line of progress, the log a tap away, and a failure that
 * leaves the folder alone and offers a way out rather than an apology.
 */
export function RunStep({ phase, progress, log, error, onCancel, onRetry, onOpenFolder, onOpenTerminal, onClose }: {
  phase: RunPhase; progress: ScaffoldProgress | null; log: string[]; error: string | null;
  onCancel: () => void; onRetry: () => void; onOpenFolder: () => void; onOpenTerminal: () => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const tail = useRef<ScrollView>(null);
  const running = phase === 'running';
  useEffect(() => { if (expanded) tail.current?.scrollToEnd({ animated: false }); }, [expanded, log]);
  const status = running
    ? progress ? `${progress.label}… (${progress.index + 1} of ${progress.total})` : 'Getting the folder ready…'
    : phase === 'done' ? 'Done.' : error ?? 'Stopped.';
  const tone = phase === 'done' ? colors.success : phase === 'stalled' ? colors.warning : phase === 'failed' ? colors.error : colors.accent;
  const footer = running ? { secondary: { title: 'Cancel', onPress: onCancel } }
    : phase === 'stalled' ? { secondary: { title: 'Close', onPress: onClose }, primary: { title: 'Open it in a terminal', onPress: onOpenTerminal } }
    : phase === 'failed' ? { secondary: { title: 'Close', onPress: onClose },
      // Something was already written into the folder, so a second run would
      // only be refused for finding files there.
      primary: log.length > 0 ? { title: 'Open the folder anyway', onPress: onOpenFolder } : { title: 'Try again', onPress: onRetry } }
    : {};
  return <>
    <View style={s.body}>
      <ProgressBar running={running} tone={tone} />
      <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={[s.status, { color: phase === 'failed' ? colors.error : colors.text }]}>{status}</Text>
      {running && log.length > 0 && <Text numberOfLines={1} style={[s.tail, { color: colors.muted }]}>{log[log.length - 1]}</Text>}
      {log.length > 0 && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
        hitSlop={6} style={({ pressed }) => [s.toggle, { opacity: pressed ? 0.55 : 1 }]}>
        <Text style={[s.toggleText, { color: colors.accent }]}>{expanded ? 'Hide output' : `Show output (${log.length} lines)`}</Text>
      </Pressable>}
      {expanded && <ScrollView ref={tail} style={[s.log, { backgroundColor: colors.elevated }]} contentContainerStyle={s.logContent}>
        <Text selectable style={[s.logText, { color: colors.text }]}>{log.join('\n')}</Text>
      </ScrollView>}
    </View>
    <WizardFooter {...footer} />
  </>;
}

/** A thin bar: sliding while the computer works, filled in the outcome's colour after. */
function ProgressBar({ running, tone }: { running: boolean; tone: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!running || reduced || width === 0) { slide.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [running, reduced, width, slide]);
  const span = width * 0.38;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[s.track, { backgroundColor: colors.border }]}>
    {running && !reduced
      ? <Animated.View style={[s.fill, { width: span, backgroundColor: tone,
        transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-span, width] }) }] }]} />
      : <View style={[s.fill, { width: running ? '50%' : '100%', backgroundColor: tone }]} />}
  </View>;
}
const s = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  status: { fontSize: 16, lineHeight: 22, fontWeight: '500', letterSpacing: -0.2 },
  tail: { fontFamily: MONO, fontSize: 12, marginTop: -4 },
  toggle: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600' },
  log: { maxHeight: 260, borderRadius: 14 },
  logContent: { paddingHorizontal: 14, paddingVertical: 12 },
  logText: { fontFamily: MONO, fontSize: 11.5, lineHeight: 17 },
});
