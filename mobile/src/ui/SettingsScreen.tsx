import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { AccountSheet } from './AccountSheet';
import { computerMode, computerRemembered } from './mode';
import { Hint, Icon, type IconName } from './primitives';
import { clearDrafts } from './useDraft';
import { confirmAction } from './confirm';
import { useAction } from './useAction';
import type { ThemePreference, WorkspaceModel } from './types';

const appearances: { id: ThemePreference; title: string }[] = [
  { id: 'system', title: 'System' }, { id: 'light', title: 'Light' }, { id: 'dark', title: 'Dark' },
];
export function SettingsScreen({ workspace, onConnect }: { workspace: WorkspaceModel; onConnect?: () => void }) {
  const { colors } = useTheme();
  const computer = computerMode(workspace) || computerRemembered(workspace);
  const { busy, error, run } = useAction();
  const [expanded, setExpanded] = useState<string>();
  const [account, setAccount] = useState(false);
  const toggle = (key: string) => setExpanded(expanded === key ? undefined : key);
  const forget = () => confirmAction('Forget this connection?',
    'Remove saved pairing and unsent drafts from this phone. Work on your computer continues. Remove this phone on the computer to revoke trust.',
    'Forget connection', () => void run(async () => { await workspace.actions.forgetDevice!(); clearDrafts(); }));
  return <ScrollView contentContainerStyle={s.content}>
    <Text style={[s.section, s.firstSection, { color: colors.muted }]}>Preferences</Text>
    <View style={[s.group, { borderColor: colors.border }]}>
      <SettingRow title="Appearance" icon="contrast-outline" value={appearances.find(item => item.id === workspace.themePreference)?.title}
        expanded={expanded === 'appearance'} onPress={() => toggle('appearance')} />
      {expanded === 'appearance' && <View style={s.appearances}>{appearances.map(item =>
        <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.title}
          aria-checked={workspace.themePreference === item.id} accessibilityState={{ checked: workspace.themePreference === item.id }} onPress={() => workspace.actions.setTheme(item.id)}
          style={[s.appearance, { backgroundColor: workspace.themePreference === item.id ? colors.elevated : 'transparent', borderColor: colors.border }]}>
          <Text style={[s.appearanceText, { color: colors.text }]}>{item.title}</Text>
          {workspace.themePreference === item.id && <Icon name="checkmark" size={15} color={colors.accent} />}
        </Pressable>)}</View>}
    </View>
    {workspace.actions.logOut && <>
      <Text style={[s.section, { color: colors.muted }]}>Account</Text>
      <View style={[s.group, { borderColor: colors.border }]}>
        {workspace.account ? <>
          <SettingRow title="Account" icon="person-circle-outline" value={workspace.account.email}
            expanded={expanded === 'account'} onPress={() => toggle('account')} />
          {expanded === 'account' && <View style={s.detail}>
            <Hint>{workspace.demo ? 'Sample account for trying Vibyra. Nothing here is stored and no computer is connected.'
              : `${workspace.account.name ? `${workspace.account.name} · ` : ''}${workspace.account.plan} plan. Your chats stay with this account.`}</Hint>
            <Pressable accessibilityRole="button" accessibilityLabel="Log out" aria-disabled={busy} accessibilityState={{ disabled: busy, busy }}
              disabled={busy} onPress={() => void run(() => workspace.actions.logOut!())} style={s.logOut}>
              <Icon name="log-out-outline" size={19} color={colors.error} />
              <Text style={[s.forgetText, { color: colors.error }]}>{busy ? 'Logging out…' : 'Log out'}</Text>
            </Pressable>
          </View>}
        </> : <SettingRow title="Sign in or create account" icon="person-circle-outline" onPress={() => setAccount(true)} />}
      </View>
    </>}
    {/* Only a phone that has a computer needs computer settings. Without one this
        section explains permissions and remote access that do not apply. */}
    {computer ? <>
      <Text style={[s.section, { color: colors.muted }]}>Connection</Text>
      <View style={[s.group, { borderColor: colors.border }]}>
        <SettingRow title="Privacy" icon="shield-checkmark-outline" expanded={expanded === 'privacy'} onPress={() => toggle('privacy')} />
        {expanded === 'privacy' && <View style={s.detail}><Hint>Commands run with your computer account’s permissions. Your coding provider may receive project content. Provider credentials stay on your computer.</Hint></View>}
        <View style={[s.separator, { backgroundColor: colors.border }]} />
        <SettingRow title="Remote access" icon="desktop-outline" expanded={expanded === 'remote'} onPress={() => toggle('remote')} />
        {expanded === 'remote' && <View style={s.detail}><Hint>Keep your computer awake and Vibyra Host running. Reconnect after returning to retrieve the latest session output.</Hint></View>}
      </View>
    </> : onConnect ? <>
      <Text style={[s.section, { color: colors.muted }]}>Computer</Text>
      <View style={[s.group, { borderColor: colors.border }]}>
        <SettingRow title="Connect a computer" icon="desktop-outline" onPress={onConnect} />
      </View>
      <Text style={[s.note, { color: colors.muted }]}>Run Vibyra Host on your computer to add its projects, terminals and coding agents to this phone.</Text>
    </> : null}
    {computer && workspace.actions.forgetDevice && <Pressable accessibilityRole="button" accessibilityLabel="Forget saved connection"
      accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={forget} style={s.forget}>
      <Icon name="unlink-outline" size={19} color={colors.error} />
      <Text style={[s.forgetText, { color: colors.error }]}>{busy ? 'Forgetting connection…' : 'Forget saved connection'}</Text>
    </Pressable>}
    {error && <View style={s.error}><Hint error>{error}</Hint></View>}
    {(workspace.actions.enterDemo || workspace.demo || workspace.actions.resetOnboarding) && <>
      <Text style={[s.section, { color: colors.muted }]}>Vibyra</Text>
      <View style={[s.group, { borderColor: colors.border }]}>
        {(workspace.actions.enterDemo || workspace.demo) && <SettingRow title={workspace.demo ? 'Leave sample workspace' : 'Open sample workspace'}
          icon="layers-outline" onPress={workspace.demo ? workspace.actions.exitDemo! : workspace.actions.enterDemo!} />}
        {workspace.actions.enterDemo && workspace.actions.resetOnboarding && <View style={[s.separator, { backgroundColor: colors.border }]} />}
        {workspace.actions.resetOnboarding && <SettingRow title="Show welcome again" icon="sparkles-outline"
          onPress={() => void run(() => workspace.actions.resetOnboarding!())} />}
      </View>
    </>}
    <AccountSheet visible={account} workspace={workspace} onClose={() => setAccount(false)} />
    <Text style={[s.footer, { color: colors.muted }]}>Vibyra</Text>
  </ScrollView>;
}
function SettingRow({ title, icon, value, expanded, onPress }: {
  title: string; icon: IconName; value?: string; expanded?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    aria-expanded={expanded} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }]}>
    <Icon name={icon} size={21} color={colors.muted} /><Text style={[s.rowTitle, { color: colors.text }]}>{title}</Text>
    {value && <Text numberOfLines={1} style={[s.value, { color: colors.muted }]}>{value}</Text>}
    <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 35 },
  section: { fontSize: 13, fontWeight: '500', marginTop: 31, marginBottom: 13 },
  // The header already names the page, so the first group sits straight under it.
  firstSection: { marginTop: 0 },
  group: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 61, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, fontSize: 15, lineHeight: 22 }, value: { fontSize: 13, flexShrink: 1 }, separator: { height: StyleSheet.hairlineWidth, marginLeft: 49 },
  appearances: { flexDirection: 'row', gap: 8, paddingHorizontal: 13, paddingBottom: 14 },
  appearance: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7 }, appearanceText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  detail: { paddingHorizontal: 17, paddingBottom: 18 }, forget: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 11 },
  note: { fontSize: 12, lineHeight: 19, marginTop: 12 },
  forgetText: { fontSize: 14 }, logOut: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 6 }, error: { paddingTop: 12 }, footer: { marginTop: 45, textAlign: 'center', fontSize: 14, letterSpacing: -0.4 },
});
