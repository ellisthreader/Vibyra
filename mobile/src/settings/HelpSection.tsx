import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { confirmAction } from '../ui/confirm';
import { Hint } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { useAction } from '../ui/useAction';
import { appVersion, links } from './links';
import { Group, Label, Row } from './SettingsRows';

/**
 * Help, then Log out on its own, then the version with one set of legal links.
 */
export function HelpSection({ workspace, showLogOut = true }: { workspace: WorkspaceModel; showLogOut?: boolean }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const [contactFailed, setContactFailed] = useState(false);
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };
  const contact = () => {
    setContactFailed(false);
    void Linking.openURL(links.support).catch(() => setContactFailed(true));
  };
  const logOut = showLogOut && workspace.account && workspace.actions.logOut;
  const confirmLogOut = () =>
    confirmAction(
      'Log out of Vibyra?',
      'Your chats stay with your account. Sign in again to pick them back up.',
      'Log out',
      () => void run(() => workspace.actions.logOut!()),
    );
  return (
    <>
      <Label>Help</Label>
      <Group>
        <Row title="Help & guides" trailing="external" onPress={() => open(links.help)} />
        <Row title="Contact Vibyra" trailing="external" onPress={contact} />
      </Group>
      {contactFailed && (
        <View style={s.notice}>
          <Hint error>Could not open the contact form. Try again in your browser.</Hint>
        </View>
      )}
      {logOut && (
        <Group style={s.logOut}>
          <Row
            title={busy ? 'Logging out…' : 'Log out'}
            danger
            busy={busy}
            onPress={confirmLogOut}
            trailing="none"
          />
        </Group>
      )}
      {error && (
        <View style={s.notice}>
          <Hint error>{error}</Hint>
        </View>
      )}
      <View style={s.footer}>
        <Text style={[s.version, { color: colors.muted }]}>{`Vibyra ${appVersion()}`.trim()}</Text>
        <View style={s.legal}>
          <Text
            accessibilityRole="link"
            onPress={() => open(links.terms)}
            style={[s.version, { color: colors.accent }]}
          >
            Terms
          </Text>
          <Text
            accessibilityRole="link"
            onPress={() => open(links.privacy)}
            style={[s.version, { color: colors.accent }]}
          >
            Privacy
          </Text>
        </View>
      </View>
    </>
  );
}
const s = StyleSheet.create({
  logOut: { marginTop: 28 },
  notice: { paddingTop: 12, paddingHorizontal: 2 },
  footer: { alignItems: 'center', marginTop: 22, gap: 2 },
  legal: { flexDirection: 'row', gap: 20 },
  version: { fontSize: 12.5, lineHeight: 20 },
});
