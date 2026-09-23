import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { VibesTurn } from './types';
const labels: Record<string, string> = {
  queued: 'Waiting to start',
  working: 'Working',
  tool_waiting: 'Using a tool',
  approval_pending: 'Needs your approval',
  question_pending: 'Needs your answer',
  reconciling: 'Checking outcome',
  outcome_unknown: 'Action outcome unconfirmed',
  budget_limit: 'Paused at budget',
  step_limit: 'Paused at step limit',
  failed: 'Could not finish',
  stopped: 'Stopped',
  reply_ready: 'Reply ready',
};
export function WorkProgress({ turn }: { turn?: VibesTurn }) {
  const { colors } = useTheme();
  const p = turn?.progress;
  if (
    !p ||
    (['queued', 'working', 'tool_waiting', 'reply_ready'].includes(p.phase) && !p.assessment)
  )
    return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: 20, paddingVertical: 8, gap: 2 }}
    >
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {labels[p.phase] ?? 'Status unavailable'}
      </Text>
      {p.assessment && (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          May need attention · review recent activity
        </Text>
      )}
    </View>
  );
}
