import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Hint, Icon } from '../../ui/primitives';
import { TeammateAvatar } from '../TeammateAvatar';
import type { Avatar, TeammateFields } from '../types';
import { form, SetupField, SetupHeading, SetupSection } from './SetupForm';

export function SetupReview({ fields, locked, budgetOnly, onChange }: {
  fields: TeammateFields; locked: boolean; budgetOnly: boolean; onChange(patch: Partial<TeammateFields>): void;
}) {
  const { colors } = useTheme();
  if (budgetOnly) return <View style={form.body}>
    <SetupHeading title="Task budget" description="Choose how many Vibes this teammate can use for a single task." />
    <View style={s.options}>{[5, 10, 20].map((budget, i) => <Pressable key={budget} accessibilityRole="radio" accessibilityLabel={`${budget} Vibes per task`}
      aria-checked={fields.budget === budget} accessibilityState={{ checked: fields.budget === budget }} disabled={locked} onPress={() => onChange({ budget })}
      style={[s.option, { backgroundColor: colors.surface, borderColor: fields.budget === budget ? colors.accent : colors.border }]}>
      <Text style={[s.amount, { color: colors.text }]}>{budget}</Text><Text style={{ fontSize: 12, color: colors.muted }}>{['Light', 'Everyday', 'More room'][i]}</Text>
      <Icon name={fields.budget === budget ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={fields.budget === budget ? colors.accent : colors.muted} /></Pressable>)}</View>
    <SetupField label="Vibes per task" accessibilityLabel="Vibes per task" value={fields.budget ? String(fields.budget) : ''} editable={!locked}
      onChangeText={v => onChange({ budget: /^\d+$/.test(v) ? Number(v) : 0 })} keyboardType="number-pad" maxLength={2} hint="Choose a whole number from 1 to 50." />
    <Text style={[form.description, { color: colors.muted }]}>This is a spending limit, not an extra charge. Tasks use your existing balance, and unused Vibes are returned.</Text>
    {(!Number.isInteger(fields.budget) || fields.budget < 1 || fields.budget > 50) && <Hint error>Choose a whole number from 1 to 50.</Hint>}
  </View>;
  return <View style={form.body}>
    <SetupHeading title="Identity" description="A familiar name and face for your specialist." />
    <SetupField label="Name" accessibilityLabel="Teammate name" value={fields.name} editable={!locked} onChangeText={name => onChange({ name })} maxLength={80} placeholder="e.g. Research helper" />
    <SetupSection label="APPEARANCE"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatars}>
      {(['assistant', 'review', 'site', 'oncall', 'lead', 'bugs', 'db', 'qa', 'sprout'] as Avatar[]).map(avatar =>
        <Pressable key={avatar} accessibilityRole="radio" accessibilityLabel={`${avatar} avatar`} aria-checked={fields.avatar === avatar} accessibilityState={{ checked: fields.avatar === avatar }}
          disabled={locked} onPress={() => onChange({ avatar })} style={[s.avatar, { borderColor: fields.avatar === avatar ? colors.accent : colors.border }]}><TeammateAvatar avatar={avatar} size={48} /></Pressable>)}
    </ScrollView></SetupSection>
  </View>;
}
const s = StyleSheet.create({ options: { flexDirection: 'row', gap: 10 }, option: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 18, gap: 10, borderWidth: 1, borderRadius: 14 },
  amount: { fontSize: 26, fontWeight: '600' }, avatars: { gap: 10, paddingVertical: 2 }, avatar: { padding: 7, borderWidth: 1, borderRadius: 16 } });
