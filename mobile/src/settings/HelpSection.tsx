import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { confirmAction } from '../ui/confirm';
import { describeConnection } from '../ui/hostStatus';
import { Hint } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { useAction } from '../ui/useAction';
import { appVersion, links, SUPPORT_EMAIL, supportMail } from './links';
import { Group, Label, Row } from './SettingsRows';

/**
 * Help, then Log out on its own, then the version with one set of legal links. A
 * support email that cannot be opened (no mail app) leaves the address on screen
 * instead of doing nothing.
 */
export function HelpSection({ workspace }: { workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const [mailFailed, setMailFailed] = useState(false);
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };
  const mail = () => {
    setMailFailed(false);
    const connection = workspace.host ? describeConnection(workspace).label : 'None';
    void Linking.openURL(supportMail(connection)).catch(() => setMailFailed(true));
  };
  const logOut = workspace.account && workspace.actions.logOut;
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
        <Row title="Contact support" trailing="external" onPress={mail} />
      </Group>
      {mailFailed && (
        <View style={s.notice}>
          <Hint>{`No mail app opened. Write to ${SUPPORT_EMAIL}.`}</Hint>
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
