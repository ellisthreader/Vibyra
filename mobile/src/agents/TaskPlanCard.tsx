import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { Hint, Icon } from '../ui/primitives';
import { font } from '../ui/font';
import { integrationBrand } from '../integrations/integrationBrands';
import { TextAction } from './setup/RoutineBits';
import { droppedLine, gapRows, planIsQuiet, planSummary, serviceRows, type FixStep, type TaskPlan } from './v2/planModel';
import { markId } from './v2/providerLabels';

/**
 * "What will it use?" — the plan for the message being written: the accounts it can reach, what asks
 * first, what was left out, and each gap with its one fix. One quiet line until opened. It is only
 * information: Send never waits for it, and nothing here grants, connects or sends by itself.
 */
export function TaskPlanCard({ plan, onFix, fixing, error }: {
  plan: TaskPlan; onFix(step: FixStep, key: string): void; fixing: string | null; error?: string | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (planIsQuiet(plan)) return null;
  const summary = planSummary(plan);
  const color = summary.tone === 'warn' ? colors.warning : colors.muted;
  const gaps = gapRows(plan), services = serviceRows(plan), dropped = droppedLine(plan);
  return (
    <View style={s.wrap} testID="task-plan">
      <Pressable accessibilityRole="button" accessibilityLabel={`What will it use? ${summary.text}`} accessibilityState={{ expanded: open }}
        aria-expanded={open} onPress={() => setOpen(!open)} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name={summary.tone === 'warn' ? 'alert-circle-outline' : 'shield-checkmark-outline'} size={16} color={color} />
        <Text numberOfLines={1} style={[s.summary, { color }]}>{summary.text}</Text>
        <Text style={[s.more, { color: colors.muted }]}>{open ? 'Hide' : 'Details'}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLiveRegion="polite">
          {services.length > 0 && <Text accessibilityRole="header" style={[s.heading, { color: colors.text }]}>What it will use</Text>}
          {services.map(r => (
            <View key={r.key} style={s.service}>
              <Mark brand={integrationBrand(markId(r.provider))} size={24} />
              <View style={s.grow}>
                <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{[r.name, r.account].filter(Boolean).join(' · ')}</Text>
                {r.line ? <Text style={[s.line, { color: colors.muted }]}>{r.line}</Text> : null}
              </View>
            </View>
          ))}
          {dropped ? <Text style={[s.line, { color: colors.muted }]}>{dropped}</Text> : null}
          {gaps.length > 0 && <Text accessibilityRole="header" style={[s.heading, { color: colors.text }]}>Needs attention</Text>}
          {gaps.map(g => (
            <View key={g.key} style={s.gap}>
              <View style={[s.dot, { backgroundColor: g.blocking ? colors.warning : colors.muted }]} />
              <View style={s.grow}>
                <Text style={[s.name, { color: colors.text }]}>{g.title}</Text>
                {g.message ? <Text style={[s.line, { color: colors.muted }]}>{g.message}</Text> : null}
                {g.hint ? <Text style={[s.line, { color: colors.muted }]}>{g.hint}</Text> : null}
                {g.step.kind !== 'words' && g.step.kind !== 'choose_ai_account' && (
                  <TextAction label={fixing === g.key ? 'Working…' : g.step.label} a11y={g.step.label} disabled={fixing !== null} onPress={() => onFix(g.step, g.key)} />
                )}
              </View>
            </View>
          ))}
          {error ? <Hint error>{error}</Hint> : null}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 6, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 28 },
  summary: { ...font.footnote, flex: 1, fontWeight: '500' },
  more: { ...font.caption },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  heading: { ...font.section },
  service: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gap: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  grow: { flex: 1, minWidth: 0 },
  name: { ...font.row },
  line: { ...font.footnote },
});
