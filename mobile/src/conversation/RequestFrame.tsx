import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';
import type { RequestStatus } from './types';

export function RequestFrame({ title, icon, children, status, canRespond, error }: {
  title: string; icon: IconName; children: ReactNode; status: RequestStatus; canRespond: boolean; error?: string;
}) {
  const { colors } = useTheme();
  const labels: Record<RequestStatus, string> = { pending: 'Your input is needed', resolving: 'Sending your response…',
    accepted: 'Response sent', declined: 'Declined', expired: 'This request is no longer active', unknown: 'Checking your response…' };
  return <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={s.header}><View style={[s.icon, { backgroundColor: colors.accentSoft }]}>
      <Icon name={icon} size={19} color={colors.accent} /></View>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text></View>
    {children}
    {(error || status !== 'pending' || !canRespond) && <Text accessibilityLiveRegion="polite" style={[s.status, { color: error ? colors.error : colors.muted }]}>
      {error ?? (status === 'pending' && !canRespond ? 'Take control when connected to respond.' : labels[status])}
    </Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 17, gap: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 23 },
  status: { fontSize: 12, lineHeight: 18 },
});
