import { AccountForm, type AccountMode } from './AccountForm';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import { OnboardingScaffold, StepTitle, TextLink } from './OnboardingScaffold';
import type { WorkspaceModel } from '../ui/types';

export function AccountStep({ workspace, mode, onMode, reason, onDone, onSkip, onBack }: {
  workspace: WorkspaceModel; mode: AccountMode; onMode: (mode: AccountMode) => void; reason?: string;
  onDone: () => void; onSkip: () => void; onBack: () => void;
}) {
  const signedIn = Boolean(workspace.account);
  return <OnboardingScaffold step={2} onBack={onBack} backdrop={<OnboardingBackdrop centre={-60} soft />}>
    <StepTitle title={signedIn ? 'You’re all set' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
      detail={signedIn ? 'Your chats stay with this account across devices.'
        : mode === 'signup' ? 'Keeps your chats and unlocks coding on your phone. You can do this later.' : 'Log in to pick up where you left off.'} />
    <AccountForm workspace={workspace} mode={mode} onMode={onMode} onDone={onDone} reason={reason}
      secondary={!signedIn && <TextLink title="Skip for now" onPress={onSkip} />} />
  </OnboardingScaffold>;
}
