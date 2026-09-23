import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { PersonalizationState } from '../personalization';

/**
 * What a Personality or Memory page shows instead of its controls when there is
 * nothing to show them with: a spinner on the first load, or one calm line and a way
 * to ask again. Controls are never drawn over an answer the server did not give, so
 * nothing on the page can look saved when it was not.
 */
export function PageState({
  feature,
  state,
  onRetry,
  onSignIn,
}: {
  feature: string;
  state: PersonalizationState;
  onRetry: () => void;
  onSignIn?: () => void;
}) {
  const { colors } = useTheme();
  if (state.status === 'idle' || state.status === 'loading')
    return (
      <View style={s.box}>
        <ActivityIndicator color={colors.muted} accessibilityLabel={`Loading ${feature}`} />
      </View>
    );
  const signedOut = state.status === 'signedOut';
  const line = signedOut ? `Sign in to use ${feature}.` : `${feature} isn’t available yet.`;
  return (
    <View style={s.box} accessibilityLiveRegion="polite">
      <Text style={[s.line, { color: colors.text }]}>{line}</Text>
      {state.problem && <Text style={[s.detail, { color: colors.muted }]}>{state.problem}</Text>}
      {signedOut ? (
        onSignIn && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={onSignIn}
            style={({ pressed }) => [
              s.signIn,
              { backgroundColor: colors.action, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[s.signInText, { color: colors.onAction }]}>Sign in</Text>
          </Pressable>
        )
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={({ pressed }) => [s.retry, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[s.retryText, { color: colors.accent }]}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  box: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 12, gap: 6 },
  line: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontWeight: '600' },
  // The same compact pill the profile header signs in with.
  signIn: {
    marginTop: 12,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: { fontSize: 15, fontWeight: '600' },
});
