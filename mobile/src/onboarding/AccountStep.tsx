import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { AccountForm, type AccountMode } from './AccountForm';
import { OnboardingScaffold } from './OnboardingScaffold';
import { OnboardingHeaderBackdrop } from './OnboardingHeaderBackdrop';
import { OnboardingBrand } from './OnboardingBrand';
import { useTheme } from '../theme';
import { revealFormEnd } from '../ui/keyboardOffset';
import { Icon } from '../ui/primitives';
import { font } from '../ui/font';
import type { WorkspaceModel } from '../ui/types';

export function AccountStep({
  workspace,
  mode,
  onMode,
  reason,
  onDone,
  onSkip,
  onBack,
}: {
  workspace: WorkspaceModel;
  mode: AccountMode;
  onMode: (mode: AccountMode) => void;
  reason?: string;
  onDone: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const signedIn = Boolean(workspace.account);
  const signInDemo = workspace.actions.signInDemo;
  const scroll = useRef<ScrollView>(null);
  return (
    <OnboardingScaffold
      step={2}
      onBack={onBack}
      backdrop={<OnboardingHeaderBackdrop />}
      scrollRef={scroll}
      header={<OnboardingBrand />}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
          onPress={onSkip}
          style={({ pressed }) => [s.skip, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
        </Pressable>
      }
    >
      {signedIn && <View style={s.grow} />}
      <View style={s.hero}>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
          {signedIn
            ? 'You’re all set.'
            : mode === 'signup'
              ? 'Create your account'
              : 'Welcome back'}
        </Text>
        {signedIn && (
          <Text style={[s.subtitle, { color: colors.muted }]}>
            Your work, your computers and your credits follow this account everywhere you sign in.
          </Text>
        )}
      </View>
      <AccountForm
        workspace={workspace}
        mode={mode}
        onMode={onMode}
        onDone={onDone}
        reason={reason}
        onFocusPassword={() => revealFormEnd(scroll)}
        secondary={
          __DEV__ && signInDemo ? (
            <View style={[s.test, { borderTopColor: colors.border }]}>
              {/* Dev-only, so it stays quiet: a small outlined pill under a hairline, never a second primary action. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Test"
                onPress={signInDemo}
                style={({ pressed }) => [
                  s.testButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.elevated : 'transparent',
                  },
                ]}
              >
                <Icon name="flask-outline" size={15} color={colors.muted} />
                <Text style={[s.testText, { color: colors.text }]}>Test</Text>
              </Pressable>
              <Text style={[s.testHint, { color: colors.muted }]}>
                Dev builds only. Logs in to the demo account and opens the sample workspace. No
                account is created and nothing is sent to Vibyra.
              </Text>
            </View>
          ) : undefined
        }
      />
      {signedIn && <View style={s.grow} />}
    </OnboardingScaffold>
  );
}
const s = StyleSheet.create({
  skip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  hero: { alignItems: 'center', gap: 8, paddingTop: 20, paddingBottom: 6 },
  subtitle: { ...font.subhead, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  title: { ...font.title, fontSize: 30, lineHeight: 36, letterSpacing: -1, textAlign: 'center' },
  test: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  testButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  testText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  testHint: { ...font.footnote, fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 320 },
  grow: { flexGrow: 1, flexShrink: 1 },
});
