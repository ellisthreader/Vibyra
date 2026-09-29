import { ScrollView } from 'react-native';
import { useSheetBottomInset } from '../../ui/OverlaySheet';
import { confirmAction } from '../../ui/confirm';
import { AccountSection } from '../AccountSection';
import { GuestHeader } from '../GuestHeader';
import type { SettingsPageProps } from '../pages';
import { ProfileHeader } from '../ProfileHeader';
import { Group, Row } from '../SettingsRows';

export function AccountSettingsPage({ workspace, nav }: SettingsPageProps) {
  const bottom = useSheetBottomInset();
  const guest = !workspace.account && !workspace.demo;
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottom + 24 }}>
    {guest ? <GuestHeader onSignUp={() => nav.signIn('signup')} onSignIn={() => nav.signIn('login')} /> :
      <ProfileHeader workspace={workspace} onOpenProfile={workspace.actions.updateProfile ? () => nav.push('profile') : undefined} />}
    <AccountSection workspace={workspace} nav={nav} />
    {workspace.account && workspace.actions.logOut && <Group style={{ marginTop: 22 }}>
      <Row title="Log out" danger trailing="none" onPress={() => confirmAction('Log out of Vibyra?',
        'Your chats stay with your account. Sign in again to pick them back up.', 'Log out',
        () => { void workspace.actions.logOut?.(); })} />
    </Group>}
  </ScrollView>;
}
