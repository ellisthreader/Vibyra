import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { ApprovalComputer, type ConnectionStage } from './ApprovalComputer';
import { font } from '../ui/font';

/** One task at a time: computer identity, the action needed, then its live status. */
export function ConnectionProgress({
  name,
  stage,
  cloud,
  working,
}: {
  name: string;
  stage: ConnectionStage;
  cloud: boolean;
  working: boolean;
}) {
  const { colors } = useTheme();
  const compact = useWindowDimensions().height < 740;
  const approval = stage === 'approval';
  const connected = stage === 'connected';
  const failed = stage === 'failed';
  return (
    <View style={[s.body, compact && s.compact]}>
      <View style={s.heading} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
          {approval
            ? 'Approve this iPhone'
            : connected
              ? 'Connected'
              : failed
                ? 'Could not connect'
                : 'Connecting'}
        </Text>
        <Text style={[s.subtitle, { color: colors.muted }]}>
          {approval
            ? 'One last step on your computer.'
            : connected
              ? 'You’re ready to go.'
              : failed
                ? 'Check your computer, then try again.'
                : cloud
                  ? 'Reaching your computer through Vibyra Cloud.'
                  : 'Setting up a secure connection.'}
        </Text>
      </View>
      <View style={[s.identity, { paddingTop: compact ? 0 : 8, paddingBottom: compact ? 0 : 8 }]}>
        <ApprovalComputer stage={stage} width={compact ? 220 : 252} />
        <Text style={[s.computer, { color: colors.text }]}>{name}</Text>
      </View>
      {approval && (
        <View
          style={[s.instructions, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {[
            ['Open Vibyra Desktop', 'On the computer shown above.'],
            ['Allow the connection', 'Choose “Allow” or “Allow viewing” in the iPhone request.'],
          ].map(([title, detail], index) => (
            <View
              key={title}
              style={[
                s.instruction,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
              accessible
              accessibilityLabel={`Step ${index + 1}. ${title}. ${detail}`}
            >
              <View style={[s.number, { backgroundColor: colors.accentSoft }]}>
                <Text style={[s.digit, { color: colors.accent }]}>{index + 1}</Text>
              </View>
              <View style={s.copy}>
                <Text style={[s.stepTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[s.stepDetail, { color: colors.muted }]}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {!failed && (
        <View style={s.status} accessible accessibilityLiveRegion="polite">
          {stage === 'connecting' && working ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Icon
              name={connected ? 'checkmark-circle' : 'time-outline'}
              size={17}
              color={connected ? colors.success : colors.muted}
            />
          )}
          <Text style={[s.statusText, { color: colors.muted }]}>
            {approval
              ? 'Waiting for your approval…'
              : connected
                ? 'Opening your workspace…'
                : 'Connecting securely…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, gap: 24 },
  compact: { gap: 16 },
  heading: { gap: 8 },
  title: { ...font.title, fontSize: 30, lineHeight: 36, letterSpacing: -1 },
  subtitle: { ...font.subhead, fontSize: 15, lineHeight: 21 },
  identity: { alignItems: 'center', gap: 10 },
  computer: {
    ...font.headline,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  instructions: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  instruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 60,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 2 },
  stepTitle: { ...font.row, fontSize: 15.5, fontWeight: '600' },
  stepDetail: { ...font.footnote },
  status: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 8,
  },
  statusText: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
});
