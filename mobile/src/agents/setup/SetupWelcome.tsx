import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/primitives';
import { TeammateAvatar } from '../TeammateAvatar';
import type { Avatar } from '../types';
import { setupIdeas } from './ideas';

const starters: { label: string; detail: string; avatar: Avatar }[] = [
  { label: 'Personal assistant', detail: 'Bring order to your day', avatar: 'assistant' },
  { label: 'Coding', detail: 'Review code & solve bugs', avatar: 'review' },
  { label: 'Research', detail: 'Find answers with sources', avatar: 'site' },
  { label: 'Ops', detail: 'Keep track of what needs you', avatar: 'oncall' },
];
export function SetupWelcome({ disabled, onChoose }: { disabled: boolean; onChoose(job: string): void }) {
  const { colors } = useTheme(); const [ideas, setIdeas] = useState(false);
  return <View style={s.body}>
    <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: colors.muted }}>START FROM A ROLE</Text>
    
    <View style={s.list}>{starters.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} disabled={disabled}
      onPress={() => onChoose(item.label)} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.5 : 1 }]}>
      <TeammateAvatar avatar={item.avatar} size={44} /><View style={s.grow}><Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
        <Text style={[s.detail, { color: colors.muted }]}>{item.detail}</Text></View><Icon name="arrow-forward" size={18} color={colors.muted} />
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={ideas ? 'Fewer ideas' : 'More job ideas'} accessibilityState={{ expanded: ideas }}
      onPress={() => setIdeas(!ideas)} style={s.more}><Text style={{ color: colors.accent, fontSize: 14 }}> {ideas ? 'Fewer ideas' : 'More job ideas'}</Text><Icon name={ideas ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} /></Pressable>
    {ideas && <View style={s.ideas}>{setupIdeas.map(([label, job]) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled} onPress={() => onChoose(job)} style={[s.idea, { backgroundColor: colors.elevated }]}><Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text></Pressable>)}</View>}
  </View>;
}
const s = StyleSheet.create({ body: { gap: 16 }, title: { fontSize: 30, lineHeight: 35, letterSpacing: -0.9, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 23 }, list: { gap: 2 }, row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingVertical: 8 },
  grow: { flex: 1 }, label: { fontSize: 16, fontWeight: '500' }, detail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, idea: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 15, justifyContent: 'center' } });
