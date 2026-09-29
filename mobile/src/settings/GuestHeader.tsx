import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';

/** Unboxed account actions for a guest in Settings and direct Account routes. */
export function GuestHeader({ onSignUp, onSignIn }: {
  onSignUp: () => void;
  onSignIn: () => void;
}) {
  const { colors } = useTheme();
  return <View testID="guest-account-entry" style={s.entry}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Your account</Text>
    <Text style={[s.detail, { color: colors.muted }]}>
      Sign in or create an account for your chats and profile.
    </Text>
    <View style={s.actions}>
      <View style={s.signInAction}>
        <Button title="Sign in" label="Sign in to Vibyra" secondary onPress={onSignIn} />
      </View>
      <View style={s.action}>
        <Button title="Create account" label="Create a Vibyra account" onPress={onSignUp} />
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  entry: { paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.5 },
  detail: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  signInAction: { width: 108 },
  action: { flex: 1, minWidth: 0 },
});
