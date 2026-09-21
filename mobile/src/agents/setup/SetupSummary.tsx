import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from '../../ui/primitives';
import { TeammateAvatar } from '../TeammateAvatar';
import type { SetupDraft, SetupStep } from './types';
import { SetupSection } from './SetupForm';

export function SetupSummary({ draft, locked, onEdit }: { draft: SetupDraft; locked: boolean; onEdit(step: SetupStep): void }) {
  const { colors } = useTheme(); const { fields } = draft;
  const row = (label: string, detail: string, icon: IconName, step: SetupStep, status?: string) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    disabled={locked} onPress={() => onEdit(step)} style={({ pressed }) => [s.row, { borderColor: colors.border, opacity: locked ? 0.5 : pressed ? 0.65 : 1 }]}>
    <View style={[s.icon, { backgroundColor: colors.elevated }]}><Icon name={icon} size={19} color={colors.muted} /></View>
    <View style={s.grow}><View style={s.line}><Text style={[s.label, { color: colors.text }]}>{label}</Text>
      {status && <Text style={[s.status, { color: colors.muted }]}>{status}</Text>}</View>
      <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>{detail}</Text></View><Icon name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
  return <View style={s.body}>
    <Pressable accessibilityRole="button" accessibilityLabel="Edit name & role" disabled={locked} onPress={() => onEdit('identity')} style={s.identity}>
      <TeammateAvatar avatar={fields.avatar} size={56} /><View style={s.grow}>
        <Text accessibilityRole="header" style={[s.name, { color: colors.text }]}>{fields.name || 'Your teammate'}</Text>
        <Text style={[s.detail, { color: colors.muted }]}>{fields.name ? 'Edit name and appearance' : 'Give it a name and a purpose'}</Text>
      </View><Icon name="pencil-outline" size={17} color={colors.muted} />
    </Pressable>
    <SetupSection label="SETUP"><View>
      {row('Task', fields.brief || 'What should this teammate help you with?', 'sparkles-outline', 'job', fields.brief ? undefined : 'Required')}
      {row('Tools', fields.integrations.length ? fields.integrations.map(id => ({ github: 'GitHub', stripe: 'Stripe', figma: 'Figma' })[id] ?? id).join(', ')
        : 'Connect services and choose access', 'link-outline', 'tools', fields.integrations.length ? String(fields.integrations.length) : 'Optional')}
      {row('Task budget', `Up to ${fields.budget} Vibes per task`, 'flash-outline', 'budget')}
      {row('Memory', fields.memory || 'Preferences and context worth remembering', 'person-outline', 'memory', fields.memory ? undefined : 'Optional')}
    </View></SetupSection>
    <SetupSection label="FOR LATER"><View>
      {row('Routine plans', draft.routines.length ? draft.routines.join(' · ') : 'Save ideas for recurring work', 'repeat-outline', 'routine', 'Not active')}
    </View></SetupSection>
  </View>;
}
const s = StyleSheet.create({ body: { gap: 20 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  grow: { flex: 1, minWidth: 0 }, name: { fontSize: 25, lineHeight: 31, letterSpacing: -0.6, fontWeight: '600' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, label: { fontSize: 15, fontWeight: '500' },
  detail: { fontSize: 13, lineHeight: 19, marginTop: 5 }, status: { fontSize: 11 },
});
