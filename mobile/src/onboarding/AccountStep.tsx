import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { AccountForm, type AccountMode } from './AccountForm';
import { OnboardingScaffold } from './OnboardingScaffold';
import { OnboardingHeaderBackdrop } from './OnboardingHeaderBackdrop';
import { OnboardingBrand } from './OnboardingBrand';
import { useTheme } from '../theme';
import { revealFormEnd } from '../ui/keyboardOffset';
import { Button, Hint } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';

export function AccountStep({ workspace, mode, onMode, reason, onDone, onSkip, onBack }: {
  workspace: WorkspaceModel; mode: AccountMode; onMode: (mode: AccountMode) => void; reason?: string;
  onDone: () => void; onSkip: () => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const signedIn = Boolean(workspace.account);
  const signInDemo = workspace.actions.signInDemo;
  const scroll = useRef<ScrollView>(null);
  return <OnboardingScaffold step={2} onBack={onBack} backdrop={<OnboardingHeaderBackdrop />} scrollRef={scroll}
    header={<OnboardingBrand />}
    headerRight={<Pressable accessibilityRole="button" accessibilityLabel="Skip for now" onPress={onSkip}
      style={({ pressed }) => [s.skip, { opacity: pressed ? 0.5 : 1 }]}>
      <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
    </Pressable>}>
    {signedIn && <View style={s.grow} />}
    <View style={s.hero}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
        {signedIn ? 'You’re all set.' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
      </Text>
      {signedIn && <Text style={[s.subtitle, { color: colors.muted }]}>
        Your work, your computers and your credits follow this account everywhere you sign in.
      </Text>}
    </View>
    <AccountForm workspace={workspace} mode={mode} onMode={onMode} onDone={onDone} reason={reason} onFocusPassword={() => revealFormEnd(scroll)}
      secondary={__DEV__ && signInDemo ? <View style={s.test}>
        <Button title="Test" secondary onPress={signInDemo} />
        <Hint>Dev builds only. Logs in to the demo account and opens the sample workspace. No account is created and nothing is sent to Vibyra.</Hint>
      </View> : undefined} />
    {signedIn && <View style={s.grow} />}
  </OnboardingScaffold>;
}
const s = StyleSheet.create({
  skip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, skipText: { fontSize: 14 },
  hero: { alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 4 },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  title: { fontSize: 31, lineHeight: 38, letterSpacing: -1.1, fontWeight: '700', textAlign: 'center' },
  test: { gap: 8 }, grow: { flexGrow: 1, flexShrink: 1 },
});
