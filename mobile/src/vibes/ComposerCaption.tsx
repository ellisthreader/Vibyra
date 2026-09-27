import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { ComposerSubmission } from './composerContracts';
import { composerStyles as s } from './composerStyles';
import { vibeWord, vibes } from './count';

export function ComposerCaption({
  note,
  notice,
  submission,
}: {
  note: string | null;
  notice?: string | null;
  submission: ComposerSubmission;
}) {
  const { colors } = useTheme();
  const { busy, quietGeneration, maximum, trialRemaining } = submission;
  const message =
    note ??
    notice ??
    (busy && !quietGeneration
      ? 'Your next draft can wait here.'
      : maximum !== undefined
        ? `This reply uses up to ${vibes(maximum)}`
        : trialRemaining !== undefined
          ? `${trialRemaining} trial ${vibeWord(trialRemaining)} left in this chat`
          : '');
  return (
    <View style={s.estimate}>
      <Text
        accessibilityLiveRegion={note || notice ? 'polite' : 'none'}
        style={[s.caption, { color: colors.muted }]}
      >
        {message}
      </Text>
    </View>
  );
}
