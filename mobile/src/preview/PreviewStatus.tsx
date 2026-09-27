import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from '../ui/font';
import { Button, Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { PreviewProblem } from './previewProblem';

/** Shared opening, waiting and failure surface. Website content stays underneath while loading. */
export function PreviewStatus({ phase = 'loading', problem, label, onRetry, onClose }: {
  phase?: 'connecting' | 'loading' | 'waiting'; problem?: PreviewProblem; label?: string;
  onRetry?(): void; onClose(): void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [details, setDetails] = useState(false);
  const waiting = phase === 'waiting';
  const title = problem?.title ?? (waiting ? 'Ready when your website is' : 'Opening your website');
  const description = problem?.message ?? (waiting
    ? 'Start a website in this project on your Mac. It will open here when it’s ready.'
    : phase === 'connecting' ? 'Connecting to your Mac…' : 'Loading the page from your Mac…');
  return <ScrollView testID="preview-status" style={{ flex: 1, backgroundColor: colors.background }}
    contentContainerStyle={s.canvas} bounces={false}>
    <View style={s.content} accessibilityLiveRegion="polite">
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[s.window, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.chrome, { borderBottomColor: colors.border }]}>
          {[0, 1, 2].map(dot => <View key={dot} style={[s.dot, { backgroundColor: colors.border }]} />)}
          <View style={[s.tinyAddress, { backgroundColor: colors.elevated }]} />
        </View>
        <View style={s.windowBody}>
          <View style={[s.symbol, { backgroundColor: problem ? colors.errorSoft : colors.accentSoft }]}>
            <Icon name={problem ? 'alert-circle-outline' : waiting ? 'globe-outline' : 'code-slash-outline'}
              color={problem ? colors.error : colors.accent} size={30} />
          </View>
          <View style={[s.skeleton, { width: 86, backgroundColor: colors.border }]} />
          <View style={[s.skeleton, { width: 118, backgroundColor: colors.elevated }]} />
        </View>
      </View>
      {label ? <Text numberOfLines={1} style={[s.label, { color: colors.muted }]}>{label}</Text> : null}
      <Text accessibilityRole={problem ? 'alert' : 'header'} style={[s.title, { color: colors.text }]}>{title}</Text>
      <Text style={[s.description, { color: colors.muted }]}>{description}</Text>
      {!problem && !waiting && <View style={s.progress}>
        {reduced ? <View style={[s.dot, { backgroundColor: colors.accent }]} /> : <ActivityIndicator color={colors.accent} size="small" />}
        <Text style={[font.caption, { color: colors.muted }]}>Live preview</Text>
      </View>}
      {problem && onRetry && <View style={s.retry}><Button title="Try again" icon="refresh-outline" onPress={onRetry} /></View>}
      <Pressable accessibilityRole="button" onPress={onClose} style={s.close}>
        <Text style={[font.row, { color: colors.muted }]}>Close preview</Text>
      </Pressable>
      {problem?.detail && <View style={s.diagnostics}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }}
          onPress={() => setDetails(value => !value)} style={s.detailToggle}>
          <Text style={[font.footnote, { color: colors.muted }]}>{details ? 'Hide details' : 'Show details'}</Text>
          <Icon name={details ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
        </Pressable>
        {details && <Text selectable style={[s.detail, { color: colors.muted, backgroundColor: colors.surface, borderColor: colors.border }]}>{problem.detail}</Text>}
      </View>}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  canvas: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingVertical: 36 },
  content: { width: '100%', maxWidth: 350, alignItems: 'center' },
  window: { width: 190, height: 152, borderWidth: 1, borderRadius: 18, marginBottom: 28, overflow: 'hidden' },
  chrome: { height: 30, paddingHorizontal: 12, flexDirection: 'row', gap: 4, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 5, height: 5, borderRadius: 3 },
  tinyAddress: { height: 8, width: 84, borderRadius: 4, marginLeft: 12 },
  windowBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  symbol: { width: 52, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  skeleton: { height: 5, borderRadius: 3 },
  label: { ...font.caption, marginBottom: 9 },
  title: { ...font.title, textAlign: 'center', maxWidth: 310 },
  description: { ...font.subhead, lineHeight: 22, textAlign: 'center', marginTop: 12, maxWidth: 290 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 25, minHeight: 20 },
  retry: { width: '100%', marginTop: 26 },
  close: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, marginTop: 8 },
  diagnostics: { width: '100%', marginTop: 8 },
  detailToggle: { minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { ...font.footnote, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
