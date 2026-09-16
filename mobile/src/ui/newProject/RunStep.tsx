import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { ScaffoldProgress } from '../../scaffold/api';
import type { RunPhase } from '../../scaffold/wizard';
import { Icon } from '../primitives';
import { BuildRing } from './BuildRing';
import { MONO } from './mono';
import { WizardFooter } from './WizardFooter';

/**
 * The build, watched rather than waited out. The ring carries the progress, the
 * steps underneath say what each one was, and the log stays a tap away for the
 * times it matters.
 *
 * The step list comes from the plan, not from the computer's reports, so all of
 * it is on screen from the first moment — you can see what is going to happen
 * as well as what already has. A failure leaves the folder alone and offers a
 * way out rather than an apology.
 */
export function RunStep({ phase, progress, steps, log, error, onCancel, onRetry, onOpenFolder, onOpenTerminal, onClose }: {
  phase: RunPhase; progress: ScaffoldProgress | null;
  /** Every step's label, in order, from the plan that was started. */
  steps: string[];
  log: string[]; error: string | null;
  onCancel: () => void; onRetry: () => void; onOpenFolder: () => void; onOpenTerminal: () => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const tail = useRef<ScrollView>(null);
  const running = phase === 'running';
  const done = phase === 'done';
  useEffect(() => { if (expanded) tail.current?.scrollToEnd({ animated: false }); }, [expanded, log]);
  const index = progress?.index ?? 0;
  const total = progress?.total ?? steps.length;
  const status = running
    ? progress?.label ?? 'Getting the folder ready…'
    : done ? 'Your project is ready.' : error ?? 'Stopped.';
  const footer = running ? { secondary: { title: 'Cancel', onPress: onCancel } }
    : phase === 'stalled' ? { secondary: { title: 'Close', onPress: onClose }, primary: { title: 'Open it in a terminal', onPress: onOpenTerminal } }
    : phase === 'failed' ? { secondary: { title: 'Close', onPress: onClose },
      // Something was already written into the folder, so a second run would
      // only be refused for finding files there.
      primary: log.length > 0 ? { title: 'Open the folder anyway', onPress: onOpenFolder } : { title: 'Try again', onPress: onRetry } }
    : {};
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <BuildRing phase={phase} index={index} total={total} label={status} />
      <Text accessibilityRole="text" accessibilityLiveRegion="polite"
        style={[s.status, { color: phase === 'failed' ? colors.error : colors.text }]}>{status}</Text>
      {running && log.length > 0 && <Text numberOfLines={1} style={[s.tail, { color: colors.muted }]}>{log[log.length - 1]}</Text>}
      {steps.length > 0 && <View style={s.steps}>
        {steps.map((step, at) => {
          const finished = done || at < index;
          const active = running && at === index;
          return <View key={`${step}-${at}`} style={s.step}>
            <View style={[s.bullet, { borderColor: finished || active ? colors.accent : colors.border,
              backgroundColor: finished ? colors.accent : 'transparent' }]}>
              {finished && <Icon name="checkmark" size={11} color="#FFFFFF" />}
            </View>
            <Text numberOfLines={1} style={[s.stepText, {
              color: finished ? colors.muted : active ? colors.text : colors.muted,
              fontWeight: active ? '600' : '500' }]}>{step}</Text>
          </View>;
        })}
      </View>}
      {log.length > 0 && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
        hitSlop={6} style={({ pressed }) => [s.toggle, { opacity: pressed ? 0.55 : 1 }]}>
        <Text style={[s.toggleText, { color: colors.accent }]}>{expanded ? 'Hide output' : `Show output (${log.length} lines)`}</Text>
      </Pressable>}
      {expanded && <ScrollView ref={tail} style={[s.log, { backgroundColor: colors.elevated }]} contentContainerStyle={s.logContent}>
        <Text selectable style={[s.logText, { color: colors.text }]}>{log.join('\n')}</Text>
      </ScrollView>}
    </ScrollView>
    <WizardFooter {...footer} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 20 },
  status: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center', marginTop: 22 },
  tail: { fontFamily: MONO, fontSize: 11.5, textAlign: 'center', marginTop: 7 },
  steps: { marginTop: 26, gap: 13 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  bullet: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14.5, letterSpacing: -0.2 },
  toggle: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', marginTop: 20 },
  toggleText: { fontSize: 14, fontWeight: '600' },
  log: { maxHeight: 220, borderRadius: 14, marginTop: 4 },
  logContent: { paddingHorizontal: 14, paddingVertical: 12 },
  logText: { fontFamily: MONO, fontSize: 11.5, lineHeight: 17 },
});
