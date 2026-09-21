import { ScrollView, StyleSheet } from 'react-native';
import { useIntegrations } from '../integrations/IntegrationsProvider';
import { useSheetBottomInset } from '../ui/OverlaySheet';
import type { WorkspaceModel } from '../ui/types';
import { AccountSection } from './AccountSection';
import { AppSection } from './AppSection';
import { GuestHeader } from './GuestHeader';
import { HelpSection } from './HelpSection';
import type { SettingsNav, SettingsRoutes } from './pages';
import { ProfileHeader } from './ProfileHeader';
import { Group, Label, Row } from './SettingsRows';
import { ThemePicker } from './ThemePicker';
import { usePersonalization } from './usePersonalization';
import { settingsAccount } from './whose';

export type { SettingsRoutes } from './pages';

/**
 * The list the sheet opens on: who you are (the card is the way to your profile),
 * then what shapes Vibyra, your account, how the app looks, the app itself, and
 * help — with Log out alone at the end. Rows answer themselves on the right, so most
 * of it is read rather than opened. An account, the test account and the sample show
 * every group, the sample's kept in memory. A guest sees only what works without an
 * account — the look, the app and help — under the case for making one, which names
 * what the other groups would add.
 */
export function SettingsHome({ workspace, nav, routes }: { workspace: WorkspaceModel; nav: SettingsNav; routes: SettingsRoutes }) {
  const bottom = useSheetBottomInset();
  const { logIn, signUp, updateProfile } = workspace.actions;
  const guest = !workspace.account && !workspace.demo;
  // The card opens Profile only for an account whose details can be edited there.
  const profile = settingsAccount(workspace) && updateProfile ? () => nav.push('profile') : undefined;
  return <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]} keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}>
    {guest && (logIn || signUp) ? <GuestHeader onSignUp={signUp ? () => nav.signIn('signup') : undefined}
      onSignIn={logIn ? () => nav.signIn('login') : undefined} /> : <ProfileHeader workspace={workspace} onOpenProfile={profile} />}
    {!guest && <>
      <VibyraSection workspace={workspace} nav={nav} routes={routes} />
      <AccountSection workspace={workspace} nav={nav} />
    </>}
    <Label>Appearance</Label>
    <ThemePicker theme={workspace.themePreference} accent={workspace.accent ?? 'cobalt'}
      onTheme={workspace.actions.setTheme} onAccent={workspace.actions.setAccent} />
    <AppSection workspace={workspace} nav={nav} routes={routes} />
    <HelpSection workspace={workspace} />
  </ScrollView>;
}

/** What shapes Vibyra's replies and what it can reach. A component of its own so a
 *  guest, who never sees these rows, never has their preferences asked for either. */
function VibyraSection({ workspace, nav, routes }: { workspace: WorkspaceModel; nav: SettingsNav; routes: SettingsRoutes }) {
  const { installed } = useIntegrations();
  // Asked again each time the sheet opens.
  const ai = usePersonalization(workspace, true).rows;
  return <>
    <Label>Vibyra</Label>
    <Group>
      <Row title="Personality" value={ai.personality} onPress={() => nav.push('personality')} />
      <Row title="Memory" value={ai.memory} onPress={() => nav.push('memory')} />
      <Row title="Plugins" value={installed.length ? `${installed.length} connected` : null} onPress={() => nav.close(routes.plugins)} />
    </Group>
  </>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6 },
});
