import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ConnectScreen } from '../ui/ConnectScreen';
import { BrandMark } from '../ui/primitives';
import type { OnboardingMode, WorkspaceModel } from '../ui/types';
import type { AccountMode } from './AccountForm';
import { AccountStep } from './AccountStep';
import { PathStep, phoneReason } from './PathStep';
import { WelcomeStep } from './WelcomeStep';

// Shown once before the workspace mounts. The home screen itself stays untouched.
export function OnboardingFlow({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'welcome' | 'account' | 'path'>('welcome');
  const [mode, setMode] = useState<AccountMode>('signup');
  const [reason, setReason] = useState<string>();
  const [connect, setConnect] = useState(false);
  const wasConnected = useRef(workspace.status === 'connected');
  const complete = (chosen: OnboardingMode | null) => { setConnect(false); void workspace.actions.completeOnboarding?.(chosen); };
  // Pairing during the flow (from the sheet or a vibyra://pair link) is the computer path, finished.
  useEffect(() => { if (workspace.status === 'connected' && !wasConnected.current) complete('computer'); }, [workspace.status]);
  if (workspace.onboarding.status !== 'pending') return <SafeAreaView style={[s.splash, { backgroundColor: colors.background }]}>
    <View accessibilityLiveRegion="polite" accessibilityLabel="Starting Vibyra"><BrandMark size={56} /></View>
  </SafeAreaView>;
  const account = (next: AccountMode, why?: string) => { setMode(next); setReason(why); setStep('account'); };
  return <>
    {step === 'welcome' && <WelcomeStep onStart={() => account('signup')} onLogIn={() => account('login')} />}
    {step === 'account' && <AccountStep workspace={workspace} mode={mode} onMode={setMode} reason={reason}
      onDone={() => reason ? complete('phone') : setStep('path')} onSkip={() => setStep('path')} onBack={() => setStep('welcome')} />}
    {step === 'path' && <PathStep onConnect={() => setConnect(true)} onSkip={() => complete(null)} onBack={() => setStep('welcome')}
      onPhone={() => workspace.account ? complete('phone') : account('signup', phoneReason)} />}
    <ConnectScreen visible={connect} workspace={workspace} onClose={() => setConnect(false)} />
  </>;
}
const s = StyleSheet.create({ splash: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
