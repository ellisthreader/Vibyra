import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import type { TwoFactorSetup as Setup } from '../../ui/types';
import { useAction } from '../../ui/useAction';
import type { SettingsPageProps } from '../pages';
import { CodePrompt } from '../twoFactor/CodePrompt';
import { RecoveryCodes } from '../twoFactor/RecoveryCodes';
import { TwoFactorSetup } from '../twoFactor/TwoFactorSetup';
import {
  TwoFactorElsewhere,
  TwoFactorNote,
  TwoFactorOff,
  TwoFactorOn,
  TwoFactorUnknown,
} from '../twoFactor/TwoFactorStatus';
import { useTwoFactor } from '../twoFactor/useTwoFactor';
import { sampleNote, settingsAccount } from '../whose';

const names = { apple: 'Apple', google: 'Google', github: 'GitHub' } as const;
type Step =
  | { at: 'status' }
  | { at: 'setup'; setup: Setup }
  /** Shown once, after a setup or a new set was asked for. */
  | { at: 'codes'; codes: string[]; fresh: boolean }
  | { at: 'renew' }
  | { at: 'off' };

/**
 * The second factor, from the case for having one to the day it is turned off.
 *
 * The page is one thing at a time. Setting up is not a list of options to weigh — it
 * is the tap that fills the authenticator in, then the code that proves it worked —
 * and the two ways to change it afterwards each ask for a code first, on their own
 * screen, so nothing destructive is ever one stray tap away.
 */
export function TwoFactorPage({ workspace }: SettingsPageProps) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const account = settingsAccount(workspace);
  const { status, reload, settle } = useTwoFactor(workspace);
  const { busy, error, run, clearError } = useAction();
  const [step, setStep] = useState<Step>({ at: 'status' });
  const { startTwoFactor, confirmTwoFactor, newRecoveryCodes, disableTwoFactor } =
    workspace.actions;
  const back = () => {
    clearError();
    setStep({ at: 'status' });
  };
  const begin = () =>
    void run(async () => {
      const setup = await startTwoFactor!();
      setStep({ at: 'setup', setup });
    });
  const confirm = (code: string) =>
    void run(async () => {
      const codes = await confirmTwoFactor!(code);
      settle({
        enabled: true,
        confirmedAt: new Date().toISOString(),
        recoveryCodesLeft: codes.length,
      });
      setStep({ at: 'codes', codes, fresh: true });
    });
  const renew = (code: string) =>
    void run(async () => {
      const codes = await newRecoveryCodes!(code);
      settle({ recoveryCodesLeft: codes.length });
      setStep({ at: 'codes', codes, fresh: false });
    });
  const disable = (code: string) =>
    void run(async () => {
      await disableTwoFactor!(code);
      settle({ enabled: false, confirmedAt: null, recoveryCodesLeft: 0 });
      setStep({ at: 'status' });
    });
  const body = () => {
    if (step.at === 'setup')
      return <TwoFactorSetup setup={step.setup} busy={busy} error={error} onConfirm={confirm} />;
    if (step.at === 'codes')
      return (
        <RecoveryCodes
          codes={step.codes}
          account={account?.email ?? ''}
          onDone={back}
          doneLabel={step.fresh ? 'Done' : 'Back to security'}
        />
      );
    if (step.at === 'renew')
      return (
        <CodePrompt
          title="Get new recovery codes"
          action="Get new codes"
          busy={busy}
          error={error}
          detail="Enter a code from your authenticator app. The codes you have now stop working."
          onSubmit={renew}
          onCancel={back}
        />
      );
    if (step.at === 'off')
      return (
        <CodePrompt
          title="Turn off two-factor"
          action="Turn off"
          danger
          busy={busy}
          error={error}
          detail="Enter a code to confirm it’s you. Your password alone will open your account again."
          onSubmit={disable}
          onCancel={back}
        />
      );
    if (status.state === 'loading')
      return (
        <View style={s.centre}>
          <ActivityIndicator
            color={colors.muted}
            accessibilityLabel="Loading two-factor authentication"
          />
        </View>
      );
    if (status.state === 'unknown')
      return <TwoFactorUnknown problem={status.problem} onRetry={() => void reload()} />;
    if (!status.detail.available)
      return (
        <TwoFactorElsewhere provider={names[account?.provider as 'apple'] ?? 'your provider'} />
      );
    if (status.detail.enabled)
      return (
        <TwoFactorOn
          detail={status.detail}
          onRenew={() => {
            clearError();
            setStep({ at: 'renew' });
          }}
          onDisable={() => {
            clearError();
            setStep({ at: 'off' });
          }}
        />
      );
    return <TwoFactorOff busy={busy} error={error} onStart={begin} />;
  };
  /*
   * The sample has no server to keep a secret, and a sample that appeared to turn
   * two-factor on would hand somebody ten recovery codes that protect nothing. So it
   * explains the feature and stops there, which is the one place a mockup would do harm.
   */
  if (!startTwoFactor)
    return (
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
        <TwoFactorNote
          title="Not in the sample"
          line={
            'On your own account, this asks for a six-digit code from an app on your phone as well as ' +
            'your password, so a stolen password isn’t enough on its own.'
          }
          note={
            workspace.demo
              ? sampleNote(workspace)
              : 'Two-factor authentication isn’t available on this phone yet.'
          }
        />
      </ScrollView>
    );
  return (
    <ScrollView
      contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {body()}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4 },
  centre: { paddingTop: 48, alignItems: 'center' },
});
