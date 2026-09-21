import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ConnectScreen } from '../ui/ConnectScreen';
import { BrandMark } from '../ui/primitives';
import type { OnboardingMode, WorkspaceModel } from '../ui/types';
import type { AccountMode } from './AccountForm';
import { AccountStep } from './AccountStep';
import { PathStep, phoneReason } from './PathStep';
import { WelcomeStep } from './WelcomeStep';
import { pairedHere } from './welcomeOutcome';

// A connection made here finishes onboarding after this long, not on the same
// frame. The sheet closes itself sooner, after showing "Connected", which
// finishes it then; this is the fallback for a vibyra://pair link.
const CONNECTED_BEAT = 1600;

// Shown once before the workspace mounts. The home screen itself stays untouched.
export function OnboardingFlow({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'welcome' | 'account' | 'path'>('welcome');
  const [mode, setMode] = useState<AccountMode>('signup');
  const [reason, setReason] = useState<string>();
  const [connect, setConnect] = useState(false);
  // How far the connect sheet is up; the page under it eases back in step, as an iOS sheet's parent does.
  const presented = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 600;
  const wasConnected = useRef(workspace.status === 'connected');
  // Set by the connect sheet when it has actually connected a computer, which is
  // the only thing that says so when one was already connected before this began.
  const [sheetConnected, setSheetConnected] = useState(false);
  const finished = useRef(false);
  const complete = (chosen: OnboardingMode | null) => {
    if (finished.current) return;
    finished.current = true;
    setConnect(false); void workspace.actions.completeOnboarding?.(chosen);
  };
  const paired = pairedHere({ connected: workspace.status === 'connected',
    connectedAtStart: wasConnected.current, sheetConnected });
  // Pairing during the flow (from the sheet or a vibyra://pair link) is the computer path, finished.
  useEffect(() => {
    if (!paired) return;
    const timer = setTimeout(() => complete('computer'), CONNECTED_BEAT);
    return () => clearTimeout(timer);
  }, [paired]);
  if (workspace.onboarding.status !== 'pending') return <SafeAreaView style={[s.splash, { backgroundColor: colors.background }]}>
    <View accessibilityLiveRegion="polite" accessibilityLabel="Starting Vibyra"><BrandMark size={56} /></View>
  </SafeAreaView>;
  const account = (next: AccountMode, why?: string) => { setMode(next); setReason(why); setStep('account'); };
  // A wide browser shows the sheet as a centred card instead, with nothing to ease back from.
  const recede = wide ? s.page : { flex: 1, transform: [{ scale: presented.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] };
  return <View style={s.stack}>
    <Animated.View style={recede}>
      {step === 'welcome' && <WelcomeStep onStart={() => account('signup')} onLogIn={() => account('login')} />}
      {step === 'account' && <AccountStep workspace={workspace} mode={mode} onMode={setMode} reason={reason}
        onDone={() => reason ? complete('phone') : setStep('path')} onSkip={() => setStep('path')} onBack={() => setStep('welcome')} />}
      {step === 'path' && <PathStep onConnect={() => setConnect(true)} onSkip={() => complete(null)} onBack={() => setStep('welcome')}
        onPhone={() => workspace.account ? complete('phone') : account('signup', phoneReason)} />}
    </Animated.View>
    {/* Closing once connected goes straight on, rather than back to this page first. */}
    <ConnectScreen visible={connect} workspace={workspace} presented={presented}
      onConnected={() => setSheetConnected(true)}
      onClose={() => paired ? complete('computer') : setConnect(false)} />
  </View>;
}
// Black behind the page, as behind an iOS sheet's parent, so the edges it leaves while easing back read as depth.
const s = StyleSheet.create({ splash: { flex: 1, alignItems: 'center', justifyContent: 'center' }, stack: { flex: 1, backgroundColor: '#000' }, page: { flex: 1 } });
