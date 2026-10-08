import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';
import type { Tone } from '../v2/routinesModel';

export function useToneColor() {
  const { colors } = useTheme();
  return (tone: Tone) => (tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : tone === 'error' ? colors.error : colors.muted);
}
/** A neutral choice chip; the chosen one is marked in the text colour, like the setup tabs. */
export function Chip({ label, selected, disabled, onPress, a11y }: { label: string; selected: boolean; disabled?: boolean; onPress(): void; a11y?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected, disabled }} aria-pressed={selected}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.chip, { borderColor: selected ? colors.text : colors.border, backgroundColor: selected ? colors.elevated : colors.surface,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Text style={[s.chipText, { color: selected ? colors.text : colors.muted }, selected && s.chipOn]}>{label}</Text>
    </Pressable>
  );
}
export const ChipRow = ({ children, label }: { children: ReactNode; label: string }) => (
  <View style={s.chips} accessibilityLabel={label}>{children}</View>
);
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const { colors } = useTheme();
  const color = useToneColor()(tone);
  return (
    <View style={[s.pill, { backgroundColor: colors.elevated }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.pillText, { color: tone === 'muted' ? colors.muted : colors.text }]}>{label}</Text>
    </View>
  );
}
/** A small text action (Pause, Delete, History…) that keeps the card calm. */
export function TextAction({ label, onPress, disabled, danger, a11y }: { label: string; onPress(): void; disabled?: boolean; danger?: boolean; a11y?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      hitSlop={6} style={({ pressed }) => [s.action, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <Text style={[s.actionText, { color: danger ? colors.error : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}
export interface HistoryRow { id: string; label: string; tone: Tone; when: string; title?: string; runId: string | null }
export function HistoryRows({ rows, empty, onOpenRun }: { rows: HistoryRow[]; empty: string; onOpenRun?(runId: string): void }) {
  const { colors } = useTheme();
  const tone = useToneColor();
  if (!rows.length) return <Text style={[s.meta, { color: colors.muted }]}>{empty}</Text>;
  return (
    <View style={s.history}>
      {rows.map(row => (
        <View key={row.id} style={s.historyRow}>
          <View style={[s.dot, { backgroundColor: tone(row.tone) }]} />
          <View style={s.grow}>
            <Text style={[s.historyLabel, { color: colors.text }]}>{row.label}</Text>
            <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>{[row.when, row.title].filter(Boolean).join(' · ')}</Text>
          </View>
          {row.runId && onOpenRun && <TextAction label="Open" a11y={`Open the run from ${row.when} in chat`} onPress={() => onOpenRun(row.runId!)} />}
        </View>
      ))}
    </View>
  );
}
/** Copies on the web; on iPhone the share sheet offers Copy (no clipboard module ships in this app). */
export function CopyValue({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const { colors } = useTheme();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(value); else await Share.share({ message: value });
      setDone(true);
    } catch { setDone(false); }
  };
  return (
    <View style={[s.copy, { backgroundColor: colors.elevated }]}>
      <View style={s.grow}>
        <Text style={[s.meta, { color: colors.muted }]}>{label}{secret ? ' · shown once' : ''}</Text>
        <Text selectable style={[s.mono, { color: colors.text }]}>{value}</Text>
      </View>
      <TextAction label={done ? 'Copied' : 'Copy'} a11y={`Copy ${label.toLowerCase()}`} onPress={() => void copy()} />
    </View>
  );
}
export const bits = StyleSheet.create({
  card: { padding: 14, gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { ...font.row },
  body: { ...font.footnote },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
});
const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  chipText: { fontSize: 13.5, lineHeight: 18, fontWeight: '500', letterSpacing: -0.1 },
  chipOn: { fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillText: { ...font.caption },
  dot: { width: 6, height: 6, borderRadius: 3 },
  action: { minHeight: 32, justifyContent: 'center' },
  actionText: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.1 },
  history: { gap: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyLabel: { fontSize: 13.5, lineHeight: 18, fontWeight: '500' },
  grow: { flex: 1, minWidth: 0 },
  meta: { ...font.footnote, fontSize: 12.5 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
});
