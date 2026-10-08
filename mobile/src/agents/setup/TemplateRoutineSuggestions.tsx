import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';
import type { Schedule } from '../v2/routinesModel';
import type { Trigger } from '../v2/triggersModel';
import { recurrenceWords, triggerWords, type Template } from '../v2/templatesModel';
import { TextAction, bits } from './RoutineBits';

/**
 * A starter's suggested routine and trigger as one-tap "Set up…" buttons. Each opens the real editor
 * filled in; nothing is scheduled or subscribed until the person saves it there.
 */
export function TemplateRoutineSuggestions({ template, schedules, triggers, canSchedule, canTrigger, onSchedule, onTrigger }: {
  template: Template; schedules: Schedule[]; triggers: Trigger[]; canSchedule: boolean; canTrigger: boolean; onSchedule(): void; onTrigger(): void;
}) {
  const { colors } = useTheme();
  const routine = canSchedule ? template.schedule : null, trigger = canTrigger ? template.trigger : null;
  if (!routine && !trigger) return null;
  const scheduled = routine && schedules.some(s => s.prompt.trim() === routine.prompt.trim());
  const subscribed = trigger && triggers.some(t => t.kind === trigger.kind);
  return (
    <View style={[bits.card, s.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="template-routines">
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{`Suggested for ${template.name}`}</Text>
      {routine && (
        <View style={s.row}>
          <View style={s.grow}>
            <Text style={[bits.name, { color: colors.text }]}>{recurrenceWords(routine.recurrence)}</Text>
            <Text style={[s.detail, { color: colors.muted }]} numberOfLines={2}>{routine.prompt}</Text>
          </View>
          {scheduled ? <Text style={[s.detail, { color: colors.success }]}>Scheduled</Text> : <TextAction label="Set up…" a11y="Set up this routine" onPress={onSchedule} />}
        </View>
      )}
      {trigger && (
        <View style={s.row}>
          <View style={s.grow}>
            <Text style={[bits.name, { color: colors.text }]}>{`When ${triggerWords(trigger.kind).toLowerCase()} arrives`}</Text>
            <Text style={[s.detail, { color: colors.muted }]} numberOfLines={2}>{trigger.promptTemplate}</Text>
          </View>
          {subscribed ? <Text style={[s.detail, { color: colors.success }]}>Added</Text> : <TextAction label="Set up…" a11y="Set up this trigger" onPress={onTrigger} />}
        </View>
      )}
      <Text style={[s.detail, { color: colors.muted }]}>Nothing runs until you save it.</Text>
    </View>
  );
}
const s = StyleSheet.create({
  card: { gap: 12 }, title: { ...font.headline, fontSize: 16 }, detail: { ...font.footnote },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, grow: { flex: 1, minWidth: 0, gap: 1 },
});
