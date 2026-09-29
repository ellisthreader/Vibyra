import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { Icon, type IconName } from '../ui/primitives';
import type { RequestBlock, RequestStatus } from './types';

export function RequestFrame({
  title,
  icon,
  children,
  status,
  canRespond,
  blocked,
  error,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
  status: RequestStatus;
  canRespond: boolean;
  blocked?: RequestBlock;
  error?: string;
}) {
  const { colors } = useTheme();
  const labels: Record<RequestStatus, string> = {
    pending: 'Your input is needed',
    resolving: 'Sending your response…',
    accepted: 'Response sent',
    declined: 'Declined',
    expired: 'This request is no longer active',
    unknown: 'Checking your response…',
    elsewhere: 'Answer this on your Mac. The agent is waiting for you there.',
    answered: 'Answered on your Mac',
  };
  const stuck = status === 'pending' && !canRespond;
  // A request the agent is waiting on is the one thing on screen that needs you.
  const waiting = status === 'pending' || status === 'elsewhere';
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.header}>
        <Icon name={icon} size={17} color={waiting ? colors.accent : colors.muted} />
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
          {title}
        </Text>
      </View>
      {children}
      {(error || status !== 'pending' || !canRespond) && (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.status, { color: error ? colors.error : colors.muted }]}
        >
          {error ?? (stuck ? (blocked?.reason ?? 'Take control to answer.') : labels[status])}
        </Text>
      )}
      {stuck && !error && blocked?.action && (
        <Pressable accessibilityRole="button" onPress={blocked.action.onPress} style={s.fix}>
          <Text style={[s.fixText, { color: colors.accent }]}>{blocked.action.label}</Text>
          <Icon name="arrow-forward" size={14} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { ...font.row, fontWeight: '600', flex: 1 },
  status: { ...font.footnote },
  fix: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  fixText: { fontSize: 14, fontWeight: '600' },
});
